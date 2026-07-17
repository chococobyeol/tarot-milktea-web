import { ZodError } from "zod";

const SESSION_COOKIE = "tarot_milktea_session";
const SESSION_TTL_SECONDS = 2 * 60 * 60;

export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export interface WorkersAIBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface RuntimeEnv {
  AI?: WorkersAIBinding;
  DB?: D1Database;
  GROQ_API_KEY?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET?: string;
  SESSION_RATE_LIMITER?: RateLimitBinding;
  NETWORK_RATE_LIMITER?: RateLimitBinding;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyHmac(value: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      new TextEncoder().encode(value),
    );
  } catch {
    return false;
  }
}

function getCookie(request: Request, name: string): string | null {
  const cookies = request.headers.get("cookie") ?? "";
  for (const item of cookies.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function sessionSecret(env: RuntimeEnv, request: Request): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return "tarot-milktea-local-development";
  throw new ApiError(500, "SERVER_MISCONFIGURED", "서버 보안 설정이 완료되지 않았습니다.");
}

async function ensureSessionTable(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS tarot_sessions (
      id_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ai_calls INTEGER NOT NULL DEFAULT 0,
      followup_count INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS tarot_sessions_expires_at_idx ON tarot_sessions (expires_at)"),
  ]);
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  return new URL(request.url).origin === origin;
}

export function assertSafeRequest(request: Request): void {
  if (!isSameOrigin(request)) throw new ApiError(403, "ORIGIN_REJECTED", "허용되지 않은 요청 출처입니다.");
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError(415, "CONTENT_TYPE_REQUIRED", "JSON 형식의 요청만 허용합니다.");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32 * 1024) throw new ApiError(413, "REQUEST_TOO_LARGE", "요청 내용이 너무 깁니다.");
}

export async function readSafeJson(request: Request): Promise<unknown> {
  assertSafeRequest(request);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32 * 1024) {
    throw new ApiError(413, "REQUEST_TOO_LARGE", "요청 내용이 너무 깁니다.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON 요청 형식을 확인하세요.");
  }
}

async function verifyTurnstile(request: Request, env: RuntimeEnv, token: string): Promise<void> {
  if (!env.TURNSTILE_SECRET) return;
  if (!token) throw new ApiError(400, "TURNSTILE_REQUIRED", "봇 감지 확인이 필요합니다.");

  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET);
  form.set("response", token);
  const remoteIp = request.headers.get("cf-connecting-ip");
  if (remoteIp) form.set("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const result = await response.json() as { success?: boolean };
  if (!result.success) throw new ApiError(403, "TURNSTILE_FAILED", "봇 감지 확인에 실패했습니다.");
}

export async function createAnonymousSession(
  request: Request,
  env: RuntimeEnv,
  turnstileToken: string,
): Promise<Response> {
  assertSafeRequest(request);
  await verifyTurnstile(request, env, turnstileToken);

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const sessionId = bytesToBase64Url(bytes);
  const signature = await hmac(sessionId, sessionSecret(env, request));
  const token = `${sessionId}.${signature}`;
  const idHash = await sha256(sessionId);
  const now = Math.floor(Date.now() / 1000);

  if (env.DB) {
    await ensureSessionTable(env.DB);
    await env.DB.prepare("DELETE FROM tarot_sessions WHERE expires_at < ?").bind(now).run();
    await env.DB.prepare(
      "INSERT INTO tarot_sessions (id_hash, created_at, expires_at, ai_calls, followup_count) VALUES (?, ?, ?, 0, 0)",
    ).bind(idHash, now, now + SESSION_TTL_SECONDS).run();
  }

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json(
    { ok: true, expiresIn: SESSION_TTL_SECONDS, protected: Boolean(env.TURNSTILE_SECRET) },
    {
      headers: {
        "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Strict${secure}`,
        "cache-control": "no-store",
      },
    },
  );
}

async function verifySessionToken(request: Request, env: RuntimeEnv): Promise<{ idHash: string }> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) throw new ApiError(401, "SESSION_REQUIRED", "리딩 세션을 다시 확인해야 합니다.");
  const [sessionId, signature] = token.split(".");
  if (!sessionId || !signature) throw new ApiError(401, "SESSION_INVALID", "리딩 세션이 올바르지 않습니다.");
  if (!await verifyHmac(sessionId, signature, sessionSecret(env, request))) {
    throw new ApiError(401, "SESSION_INVALID", "리딩 세션이 올바르지 않습니다.");
  }
  return { idHash: await sha256(sessionId) };
}

export async function consumeAiCall(request: Request, env: RuntimeEnv, followup: boolean): Promise<void> {
  assertSafeRequest(request);
  const { idHash } = await verifySessionToken(request, env);

  const sessionLimit = await env.SESSION_RATE_LIMITER?.limit({ key: idHash });
  if (sessionLimit && !sessionLimit.success) {
    throw new ApiError(429, "RATE_LIMITED", "요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.", 60);
  }

  const networkValue = `${request.headers.get("cf-connecting-ip") ?? "local"}:${request.headers.get("user-agent") ?? "unknown"}`;
  const networkHash = await sha256(`${networkValue}:${sessionSecret(env, request)}`);
  const networkLimit = await env.NETWORK_RATE_LIMITER?.limit({ key: networkHash });
  if (networkLimit && !networkLimit.success) {
    throw new ApiError(429, "NETWORK_RATE_LIMITED", "이 네트워크에서 요청이 많습니다. 잠시 후 다시 시도하세요.", 60);
  }

  if (!env.DB) return;
  await ensureSessionTable(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const update = followup
    ? await env.DB.prepare(
      `UPDATE tarot_sessions
       SET ai_calls = ai_calls + 1
       WHERE id_hash = ? AND expires_at >= ? AND ai_calls < 6 AND followup_count < 2`,
    ).bind(idHash, now).run()
    : await env.DB.prepare(
      `UPDATE tarot_sessions SET ai_calls = ai_calls + 1
       WHERE id_hash = ? AND expires_at >= ? AND ai_calls < 6`,
    ).bind(idHash, now).run();

  if ((update.meta.changes ?? 0) > 0) return;
  const session = await env.DB.prepare(
    "SELECT ai_calls, followup_count, expires_at FROM tarot_sessions WHERE id_hash = ?",
  ).bind(idHash).first<{ ai_calls: number; followup_count: number; expires_at: number }>();
  if (!session || session.expires_at < now) {
    throw new ApiError(401, "SESSION_EXPIRED", "리딩 세션이 만료되었습니다.");
  }
  if (followup && session.followup_count >= 2) {
    throw new ApiError(429, "FOLLOWUP_LIMIT_REACHED", "추가 질문은 한 리딩에서 최대 2회까지 가능합니다.");
  }
  throw new ApiError(429, "SESSION_LIMIT_REACHED", "이 리딩에서 사용할 수 있는 AI 요청을 모두 사용했습니다.");
}

export async function completeFollowup(
  request: Request,
  env: RuntimeEnv,
  expectedFollowupCount: number,
): Promise<void> {
  assertSafeRequest(request);
  const { idHash } = await verifySessionToken(request, env);

  if (!env.DB) return;
  await ensureSessionTable(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const update = await env.DB.prepare(
    `UPDATE tarot_sessions
     SET followup_count = followup_count + 1
     WHERE id_hash = ? AND expires_at >= ? AND followup_count = ? AND followup_count < 2`,
  ).bind(idHash, now, expectedFollowupCount).run();

  if ((update.meta.changes ?? 0) > 0) return;
  const session = await env.DB.prepare(
    "SELECT followup_count, expires_at FROM tarot_sessions WHERE id_hash = ?",
  ).bind(idHash).first<{ followup_count: number; expires_at: number }>();
  if (!session || session.expires_at < now) {
    throw new ApiError(401, "SESSION_EXPIRED", "리딩 세션이 만료되었습니다.");
  }
  if (session.followup_count === expectedFollowupCount + 1) {
    return;
  }
  throw new ApiError(429, "FOLLOWUP_LIMIT_REACHED", "추가 질문은 한 리딩에서 최대 2회까지 가능합니다.");
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "입력 내용을 확인하세요." } },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  if (error instanceof ApiError) {
    const headers: Record<string, string> = { "cache-control": "no-store" };
    if (error.retryAfter) headers["retry-after"] = String(error.retryAfter);
    return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
  }
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다. 현재 상태를 유지하고 다시 시도하세요." } },
    { status: 500, headers: { "cache-control": "no-store" } },
  );
}

import { readingPlanSchema, readingResultSchema } from "@/src/lib/schemas";
import type { AppLanguage } from "@/src/lib/i18n";
import type { AnswerContract, ReadingContext, ReadingPlan, ReadingResult, SelectedCard } from "@/src/lib/tarot";

export type ApiMode = "ai" | "local";

export class TarotApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

interface RequestTimeout {
  milliseconds: number;
  code: "SESSION_TIMEOUT" | "PLAN_TIMEOUT" | "INTERPRETATION_TIMEOUT";
  message: string;
}

const SESSION_TIMEOUT: RequestTimeout = {
  milliseconds: 30_000,
  code: "SESSION_TIMEOUT",
  message: "세션 확인 시간이 초과되었습니다. 봇 감지 확인 후 다시 시도하세요.",
};

const PLAN_TIMEOUT: RequestTimeout = {
  milliseconds: 120_000,
  code: "PLAN_TIMEOUT",
  message: "카드 구성 응답 시간이 초과되었습니다. 질문을 유지한 채 다시 시도하세요.",
};

const INTERPRETATION_TIMEOUT: RequestTimeout = {
  milliseconds: 180_000,
  code: "INTERPRETATION_TIMEOUT",
  message: "카드 해석 응답 시간이 초과되었습니다. 선택한 카드를 유지한 채 다시 시도하세요.",
};

async function parseResponse(response: Response): Promise<unknown> {
  const payload = await response.json().catch(() => null) as {
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new TarotApiError(
      payload?.error?.code ?? "REQUEST_FAILED",
      payload?.error?.message ?? "요청을 처리하지 못했습니다.",
      response.status,
      Number(response.headers.get("retry-after") ?? 0) || undefined,
    );
  }
  return payload;
}

function createRequestId(): string {
  if (typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeout: RequestTimeout,
): Promise<Response> {
  const controller = new AbortController();
  const headers = new Headers(init.headers);
  headers.set("x-tarot-request-id", createRequestId());
  let timedOut = false;
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout.milliseconds);
  try {
    return await fetch(input, { ...init, headers, signal: controller.signal });
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new TarotApiError(timeout.code, timeout.message, 408);
    }
    throw new TarotApiError("NETWORK_ERROR", "네트워크 연결을 확인하고 다시 시도하세요.", 0);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function ensureAnonymousSession(turnstileToken = ""): Promise<void> {
  const response = await fetchWithTimeout("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ turnstileToken }),
  }, SESSION_TIMEOUT);
  await parseResponse(response);
}

export async function requestReadingPlan(
  question: string,
  followup = false,
  language: AppLanguage = "ko",
  context?: ReadingContext,
): Promise<{ data: ReadingPlan; mode: ApiMode }> {
  const response = await fetchWithTimeout("/api/tarot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "plan", question, followup, language, context }),
  }, PLAN_TIMEOUT);
  const payload = await parseResponse(response) as { data: unknown; mode?: ApiMode };
  return { data: readingPlanSchema.parse(payload.data), mode: payload.mode ?? "ai" };
}

export async function requestInterpretation(
  question: string,
  cards: SelectedCard[],
  previous: ReadingResult | undefined,
  language: AppLanguage,
  answerContract: AnswerContract,
  context?: ReadingContext,
): Promise<{ data: ReadingResult; mode: ApiMode }> {
  const response = await fetchWithTimeout("/api/tarot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "interpret", question, cards, previous, language, answerContract, context }),
  }, INTERPRETATION_TIMEOUT);
  const payload = await parseResponse(response) as { data: unknown; mode?: ApiMode };
  return { data: readingResultSchema.parse(payload.data), mode: payload.mode ?? "ai" };
}

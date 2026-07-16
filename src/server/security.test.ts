import { describe, expect, it } from "vitest";

import {
  ApiError,
  completeFollowup,
  consumeAiCall,
  createAnonymousSession,
  readSafeJson,
} from "@/src/server/security";

function jsonRequest(url: string, body: string, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function sessionDb() {
  let session: {
    idHash: string;
    expiresAt: number;
    aiCalls: number;
    followupCount: number;
  } | null = null;

  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          values = bound;
          return statement;
        },
        async run() {
          if (sql.includes("INSERT INTO tarot_sessions")) {
            session = {
              idHash: String(values[0]),
              expiresAt: Number(values[2]),
              aiCalls: 0,
              followupCount: 0,
            };
            return { meta: { changes: 1 } };
          }
          if (sql.includes("SET followup_count = followup_count + 1")) {
            const now = Number(values[1]);
            const expectedFollowupCount = Number(values[2]);
            if (
              session
              && session.idHash === values[0]
              && session.expiresAt >= now
              && session.followupCount === expectedFollowupCount
              && session.followupCount < 2
            ) {
              session.followupCount += 1;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.includes("SET ai_calls = ai_calls + 1")) {
            const now = Number(values[1]);
            const followupAllowed = !sql.includes("followup_count < 2") || (session?.followupCount ?? 2) < 2;
            if (session && session.idHash === values[0] && session.expiresAt >= now && session.aiCalls < 6 && followupAllowed) {
              session.aiCalls += 1;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async first<T>() {
          if (!session || session.idHash !== values[0]) return null;
          return {
            ai_calls: session.aiCalls,
            followup_count: session.followupCount,
            expires_at: session.expiresAt,
          } as T;
        },
      };
      return statement;
    },
    async batch() {
      return [];
    },
  } as unknown as D1Database;

  return {
    db,
    state: () => session,
  };
}

describe("anonymous session security", () => {
  it("creates and verifies a signed local session cookie", async () => {
    const response = await createAnonymousSession(jsonRequest("http://localhost/api/session", "{}"), {}, "");
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");

    const cookieValue = cookie?.split(";")[0] ?? "";
    await expect(consumeAiCall(
      jsonRequest("http://localhost/api/tarot", "{}", { cookie: cookieValue }),
      {},
      false,
    )).resolves.toBeUndefined();
  });

  it("rejects a modified session signature", async () => {
    const response = await createAnonymousSession(jsonRequest("http://localhost/api/session", "{}"), {}, "");
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    const modified = cookie.replace(/\.([A-Za-z0-9_-])/, (_, first: string) => `.${first === "a" ? "b" : "a"}`);

    await expect(consumeAiCall(
      jsonRequest("http://localhost/api/tarot", "{}", { cookie: modified }),
      {},
      false,
    )).rejects.toMatchObject({ status: 401, code: "SESSION_INVALID" });
  });

  it("counts a follow-up only after its plan succeeds", async () => {
    const store = sessionDb();
    const env = { DB: store.db };
    const response = await createAnonymousSession(jsonRequest("http://localhost/api/session", "{}"), env, "");
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    const followupRequest = () => jsonRequest("http://localhost/api/tarot", "{}", { cookie });

    await consumeAiCall(followupRequest(), env, true);
    expect(store.state()).toMatchObject({ aiCalls: 1, followupCount: 0 });

    // A failed plan stops here, so another attempt must still have both follow-up slots.
    await consumeAiCall(followupRequest(), env, true);
    expect(store.state()).toMatchObject({ aiCalls: 2, followupCount: 0 });

    await completeFollowup(followupRequest(), env, 0);
    expect(store.state()).toMatchObject({ aiCalls: 2, followupCount: 1 });

    await consumeAiCall(followupRequest(), env, true);
    await completeFollowup(followupRequest(), env, 1);
    expect(store.state()).toMatchObject({ aiCalls: 3, followupCount: 2 });

    await expect(consumeAiCall(followupRequest(), env, true))
      .rejects.toMatchObject({ status: 429, code: "FOLLOWUP_LIMIT_REACHED" });
  });

  it("does not spend two follow-up slots for duplicate concurrent plans", async () => {
    const store = sessionDb();
    const env = { DB: store.db };
    const response = await createAnonymousSession(jsonRequest("http://localhost/api/session", "{}"), env, "");
    const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
    const followupRequest = () => jsonRequest("http://localhost/api/tarot", "{}", { cookie });

    await consumeAiCall(followupRequest(), env, true);
    await consumeAiCall(followupRequest(), env, true);
    await completeFollowup(followupRequest(), env, 0);
    await completeFollowup(followupRequest(), env, 0);

    expect(store.state()).toMatchObject({ aiCalls: 2, followupCount: 1 });
  });

  it("fails closed when a production session secret is missing", async () => {
    await expect(createAnonymousSession(jsonRequest("https://tarot-milktea.pages.dev/api/session", "{}"), {}, ""))
      .rejects.toMatchObject({ status: 500, code: "SERVER_MISCONFIGURED" });
  });

  it("rejects cross-origin and oversized request bodies", async () => {
    await expect(readSafeJson(jsonRequest(
      "http://localhost/api/tarot",
      "{}",
      { origin: "https://example.com" },
    ))).rejects.toBeInstanceOf(ApiError);

    await expect(readSafeJson(jsonRequest(
      "http://localhost/api/tarot",
      JSON.stringify({ value: "x".repeat(33 * 1024) }),
    ))).rejects.toMatchObject({ status: 413, code: "REQUEST_TOO_LARGE" });
  });
});

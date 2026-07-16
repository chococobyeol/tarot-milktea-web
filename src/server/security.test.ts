import { describe, expect, it } from "vitest";

import {
  ApiError,
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

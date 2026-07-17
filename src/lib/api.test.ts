import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ensureAnonymousSession,
  requestInterpretation,
  requestReadingPlan,
} from "@/src/lib/api";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function abortingFetch() {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject({ name: "AbortError" }), { once: true });
  }));
}

describe("tarot client requests", () => {
  it("adds a different UUID request id to every request", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetcher);

    await ensureAnonymousSession("token-one");
    await ensureAnonymousSession("token-two");

    const ids = fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get("x-tarot-request-id"));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(ids[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("reports a session-specific timeout after 30 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortingFetch());

    const request = ensureAnonymousSession("token");
    const rejection = expect(request).rejects.toMatchObject({ code: "SESSION_TIMEOUT", status: 408 });
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
  });

  it("reports a plan-specific timeout after 120 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortingFetch());

    const request = requestReadingPlan("오늘은 무엇을 먹을까요?");
    const rejection = expect(request).rejects.toMatchObject({ code: "PLAN_TIMEOUT", status: 408 });
    await vi.advanceTimersByTimeAsync(120_000);
    await rejection;
  });

  it("reports an interpretation-specific timeout after 180 seconds", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortingFetch());

    const request = requestInterpretation(
      "오늘은 무엇을 먹을까요?",
      [{
        cardId: "major-00",
        reversed: false,
        positionId: "choice",
        positionTitle: "선택",
        positionFocus: "질문에 맞는 선택",
        round: 0,
      }],
      undefined,
      "ko",
      { kind: "recommend_one", subject: "오늘의 메뉴", candidates: [] },
    );
    const rejection = expect(request).rejects.toMatchObject({ code: "INTERPRETATION_TIMEOUT", status: 408 });
    await vi.advanceTimersByTimeAsync(180_000);
    await rejection;
  });

  it("recognizes a non-DOM AbortError shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw { name: "AbortError" };
    }));

    await expect(requestReadingPlan("지금 이직을 준비해도 괜찮을까요?"))
      .rejects.toMatchObject({ code: "PLAN_TIMEOUT", status: 408 });
  });
});

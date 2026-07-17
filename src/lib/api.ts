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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new TarotApiError("REQUEST_TIMEOUT", "응답 시간이 초과되었습니다. 현재 상태에서 다시 시도하세요.", 408);
    }
    throw new TarotApiError("NETWORK_ERROR", "네트워크 연결을 확인하고 다시 시도하세요.", 0);
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function ensureAnonymousSession(turnstileToken = ""): Promise<void> {
  const response = await fetchWithTimeout("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ turnstileToken }),
  }, 20_000);
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
  }, 60_000);
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
  }, 60_000);
  const payload = await parseResponse(response) as { data: unknown; mode?: ApiMode };
  return { data: readingResultSchema.parse(payload.data), mode: payload.mode ?? "ai" };
}

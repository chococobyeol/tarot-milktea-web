import type { WorkersAIBinding } from "@/src/server/security";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_TIMEOUT_MS = 30_000;

export type AiProviderName = "workers-ai" | "groq";
export type AiProviderErrorKind =
  | "daily_limit"
  | "rate_limit"
  | "authentication"
  | "invalid_request"
  | "invalid_response"
  | "timeout"
  | "unavailable";

export interface AiJsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface AiJsonRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature: number;
  jsonSchema: AiJsonSchema;
}

export interface AiJsonProvider {
  readonly activeProvider: AiProviderName;
  run(request: AiJsonRequest): Promise<unknown>;
}

export class AiProviderError extends Error {
  constructor(
    public readonly provider: AiProviderName,
    public readonly kind: AiProviderErrorKind,
    public readonly retryable: boolean,
    public readonly retryAfter?: number,
  ) {
    super(`${provider}:${kind}`);
    this.name = "AiProviderError";
  }
}

interface QuotaFallbackProviderOptions {
  workersAi: WorkersAIBinding;
  workersModel: string;
  groqApiKey?: string;
  groqModel: string;
  groqMaxTokens?: number;
  groqStrictJsonSchema?: boolean;
  groqCorrectionModel?: string;
  groqCorrectionMaxTokens?: number;
  groqCorrectionStrictJsonSchema?: boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  onFallback?: () => void;
}

function errorDetails(error: unknown, seen = new Set<object>(), depth = 0): string {
  if (depth > 4) return "";
  if (error instanceof Error) {
    if (seen.has(error)) return "";
    seen.add(error);
    const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    return `${error.name} ${error.message} ${cause === undefined ? "" : errorDetails(cause, seen, depth + 1)}`.trim();
  }
  if (typeof error === "string" || typeof error === "number") return String(error);
  if (error && typeof error === "object") {
    if (seen.has(error)) return "";
    seen.add(error);
    const record = error as Record<string, unknown>;
    return [record.code, record.message, record.error, record.cause]
      .map((value) => errorDetails(value, seen, depth + 1))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

export function isWorkersAiDailyLimitError(error: unknown): boolean {
  const details = errorDetails(error);
  return /(?:^|\D)(?:3036|4006)(?:\D|$)/.test(details)
    || /used up[^.]*daily free allocation[^.]*neurons?/i.test(details)
    || /daily[^.]{0,80}(?:neuron|usage|free allocation)[^.]{0,80}(?:limit|exceed|used up)/i.test(details);
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.ceil(seconds);
}

interface GroqErrorPayload {
  error?: {
    code?: unknown;
  };
}

function groqHttpError(response: Response, payload: GroqErrorPayload | null): AiProviderError {
  const retryAfter = retryAfterSeconds(response);
  if (response.status === 429) {
    return new AiProviderError("groq", "rate_limit", false, retryAfter);
  }
  if (response.status === 401 || response.status === 403) {
    return new AiProviderError("groq", "authentication", false);
  }
  if (response.status === 400 && payload?.error?.code === "json_validate_failed") {
    return new AiProviderError("groq", "invalid_response", true);
  }
  if (response.status === 400 || response.status === 404) {
    return new AiProviderError("groq", "invalid_request", false);
  }
  if (response.status === 408) {
    return new AiProviderError("groq", "timeout", true, retryAfter);
  }
  if (response.status === 422) {
    return new AiProviderError("groq", "invalid_response", true, retryAfter);
  }
  return new AiProviderError("groq", "unavailable", response.status >= 500, retryAfter);
}

async function runGroqJson(
  apiKey: string,
  model: string,
  request: AiJsonRequest,
  fetcher: typeof fetch,
  timeoutMs: number,
  strictJsonSchema: boolean,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
        max_completion_tokens: request.maxTokens,
        temperature: request.temperature,
        ...(model.startsWith("openai/gpt-oss-")
          ? { reasoning_effort: "low", include_reasoning: false }
          : model === "qwen/qwen3.6-27b"
            ? { reasoning_effort: "none", include_reasoning: false }
            : {}),
        response_format: strictJsonSchema
          ? {
              type: "json_schema",
              json_schema: {
                name: request.jsonSchema.name,
                strict: true,
                schema: request.jsonSchema.schema,
              },
            }
          : { type: "json_object" },
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as GroqErrorPayload | null;
      throw groqHttpError(response, payload);
    }
    try {
      return await response.json();
    } catch {
      throw new AiProviderError("groq", "invalid_response", true);
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new AiProviderError("groq", "timeout", true);
    }
    throw new AiProviderError("groq", "unavailable", true);
  } finally {
    clearTimeout(timeout);
  }
}

export function createQuotaFallbackAiProvider(options: QuotaFallbackProviderOptions): AiJsonProvider {
  const groqApiKey = options.groqApiKey?.trim() || undefined;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_GROQ_TIMEOUT_MS;
  const strictJsonSchema = options.groqStrictJsonSchema ?? true;
  let activeProvider: AiProviderName = "workers-ai";
  let groqCallCount = 0;

  const runConfiguredGroq = (request: AiJsonRequest) => {
    const useCorrectionModel = groqCallCount > 0 && Boolean(options.groqCorrectionModel);
    const model = useCorrectionModel ? options.groqCorrectionModel as string : options.groqModel;
    const maxTokens = useCorrectionModel
      ? options.groqCorrectionMaxTokens ?? request.maxTokens
      : options.groqMaxTokens ?? request.maxTokens;
    const useStrictJsonSchema = useCorrectionModel
      ? options.groqCorrectionStrictJsonSchema ?? false
      : strictJsonSchema;
    groqCallCount += 1;
    return runGroqJson(
      groqApiKey as string,
      model,
      { ...request, maxTokens: Math.min(request.maxTokens, maxTokens) },
      fetcher,
      timeoutMs,
      useStrictJsonSchema,
    );
  };

  return {
    get activeProvider() {
      return activeProvider;
    },
    async run(request) {
      if (activeProvider === "groq") {
        return runConfiguredGroq(request);
      }

      try {
        return await options.workersAi.run(options.workersModel, {
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: request.userPrompt },
          ],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
          response_format: { type: "json_object" },
          chat_template_kwargs: { enable_thinking: false },
        });
      } catch (error) {
        if (!isWorkersAiDailyLimitError(error)) throw error;
        if (!groqApiKey) {
          throw new AiProviderError("workers-ai", "daily_limit", false);
        }

        activeProvider = "groq";
        options.onFallback?.();
        return runConfiguredGroq(request);
      }
    },
  };
}

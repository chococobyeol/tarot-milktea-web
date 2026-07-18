import { describe, expect, it, vi } from "vitest";

import {
  AiProviderError,
  createQuotaFallbackAiProvider,
  isWorkersAiDailyLimitError,
  type AiJsonRequest,
} from "@/src/server/ai-provider";
import type { WorkersAIBinding } from "@/src/server/security";

const request: AiJsonRequest = {
  systemPrompt: "system",
  userPrompt: "user",
  maxTokens: 4_000,
  temperature: 0.25,
  jsonSchema: {
    name: "test_response",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["value"],
      properties: { value: { type: "string" } },
    },
  },
};

function workersBinding(run: WorkersAIBinding["run"]): WorkersAIBinding {
  return { run };
}

function groqSuccess(): Response {
  return Response.json({
    choices: [{ message: { role: "assistant", content: JSON.stringify({ value: "ok" }) } }],
  });
}

describe("quota fallback AI provider", () => {
  it("recognizes only Cloudflare daily allocation failures", () => {
    expect(isWorkersAiDailyLimitError(new Error(
      "4006: You have used up your daily free allocation of 10,000 neurons.",
    ))).toBe(true);
    expect(isWorkersAiDailyLimitError({ code: 3036, message: "Account limited" })).toBe(true);
    expect(isWorkersAiDailyLimitError({
      error: { code: 4006, message: "daily free allocation exhausted" },
    })).toBe(true);
    expect(isWorkersAiDailyLimitError(new Error("429: request rate limited"))).toBe(false);
    expect(isWorkersAiDailyLimitError(new Error("3040: out of capacity"))).toBe(false);
    expect(isWorkersAiDailyLimitError(new Error("neuron response was invalid"))).toBe(false);
  });

  it("keeps Workers AI as the only provider when it succeeds", async () => {
    const workersRun = vi.fn(async () => ({ response: JSON.stringify({ value: "workers" }) }));
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(workersRun),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      fetcher,
    });

    await expect(provider.run(request)).resolves.toMatchObject({ response: expect.any(String) });
    expect(provider.activeProvider).toBe("workers-ai");
    expect(workersRun).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds a hanging Workers AI call with its configured timeout", async () => {
    vi.useFakeTimers();
    try {
      const workersRun = vi.fn(() => new Promise<unknown>(() => undefined));
      const provider = createQuotaFallbackAiProvider({
        workersAi: workersBinding(workersRun),
        workersModel: "workers-model",
        groqModel: "openai/gpt-oss-120b",
        workersTimeoutMs: 1_250,
      });

      const rejection = expect(provider.run(request)).rejects.toMatchObject({
        provider: "workers-ai",
        kind: "timeout",
        retryable: false,
      });
      await vi.advanceTimersByTimeAsync(1_249);
      expect(workersRun).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a sole Workers AI call use the shared deadline without overlapping retries", async () => {
    vi.useFakeTimers();
    try {
      const workersRun = vi.fn(() => new Promise<unknown>(() => undefined));
      const provider = createQuotaFallbackAiProvider({
        workersAi: workersBinding(workersRun),
        workersModel: "workers-model",
        groqModel: "openai/gpt-oss-120b",
        workersTimeoutMs: 1_000,
      });

      let settled = false;
      const result = provider.run({ ...request, deadlineAt: Date.now() + 2_500 });
      void result.then(
        () => { settled = true; },
        () => { settled = true; },
      );
      const rejection = expect(result).rejects.toMatchObject({
        provider: "workers-ai",
        kind: "timeout",
        retryable: false,
      });

      await vi.advanceTimersByTimeAsync(1_001);
      expect(settled).toBe(false);
      expect(workersRun).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_499);
      await rejection;
      expect(settled).toBe(true);
      expect(workersRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the Groq per-call timeout explicit and aborts its fetch", async () => {
    vi.useFakeTimers();
    try {
      let groqSignal: AbortSignal | null = null;
      const fetcher = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        groqSignal = init?.signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          groqSignal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          }, { once: true });
        });
      }) as unknown as typeof fetch;
      const provider = createQuotaFallbackAiProvider({
        workersAi: workersBinding(async () => {
          throw new Error("4006: daily free allocation exhausted");
        }),
        workersModel: "workers-model",
        groqApiKey: "test-key",
        groqModel: "openai/gpt-oss-120b",
        timeoutMs: 2_750,
        fetcher,
      });

      await expect(provider.run(request)).rejects.toMatchObject({
        provider: "workers-ai",
        kind: "daily_limit",
        retryable: true,
      });
      let timeoutError: unknown;
      const groqCall = provider.run(request).catch((error: unknown) => {
        timeoutError = error;
      });
      await vi.advanceTimersByTimeAsync(2_749);
      expect(groqSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await groqCall;
      expect(timeoutError).toMatchObject({
        provider: "groq",
        kind: "timeout",
        retryable: true,
      });
      expect(groqSignal?.aborted).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches once on the exact quota error and keeps retries on Groq", async () => {
    const workersRun = vi.fn(async () => {
      throw new Error("4006: used up daily free allocation of 10,000 neurons");
    });
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const onFallback = vi.fn();
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(workersRun),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      groqMaxTokens: 2_600,
      fetcher,
      onFallback,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    await provider.run({ ...request, userPrompt: "corrected" });
    await provider.run({ ...request, userPrompt: "corrected-again" });

    expect(provider.activeProvider).toBe("groq");
    expect(workersRun).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    expect(body).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_completion_tokens: 2_600,
      reasoning_effort: "low",
      include_reasoning: false,
      stream: false,
      response_format: {
        type: "json_schema",
        json_schema: { name: "test_response", strict: true },
      },
    });
  });

  it("uses the production correction model without returning to Workers AI", async () => {
    const workersRun = vi.fn(async () => {
      throw new Error("4006: used up daily free allocation of 10,000 neurons");
    });
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(workersRun),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      groqMaxTokens: 2_600,
      groqStrictJsonSchema: true,
      groqCorrectionModel: "openai/gpt-oss-20b",
      groqCorrectionMaxTokens: 2_400,
      groqCorrectionStrictJsonSchema: true,
      fetcher,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    await provider.run(request);
    await provider.run(request);

    expect(workersRun).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [, correctionInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    const correctionBody = JSON.parse(String(correctionInit.body)) as Record<string, unknown>;
    expect(correctionBody).toMatchObject({
      model: "openai/gpt-oss-20b",
      max_completion_tokens: 2_400,
      reasoning_effort: "low",
      include_reasoning: false,
      response_format: {
        type: "json_schema",
        json_schema: { name: "test_response", strict: true },
      },
    });
  });

  it("uses the primary Groq model when Workers first reaches its quota on a correction attempt", async () => {
    let workersCalls = 0;
    const workersRun = vi.fn(async () => {
      workersCalls += 1;
      if (workersCalls === 1) return { response: JSON.stringify({ value: "needs-correction" }) };
      throw new Error("4006: daily free allocation exhausted");
    });
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(workersRun),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      groqCorrectionModel: "openai/gpt-oss-20b",
      fetcher,
    });

    await provider.run(request);
    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    await provider.run(request);

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("openai/gpt-oss-120b");
  });

  it("uses Groq for generic Cloudflare failures", async () => {
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(async () => { throw new Error("429: temporary request rate limit"); }),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      fetcher,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "unavailable",
      retryable: true,
    });
    await expect(provider.run(request)).resolves.toEqual(expect.any(Object));
    expect(provider.activeProvider).toBe("groq");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("can move a quality correction from Workers AI to Groq", async () => {
    const workersRun = vi.fn(async () => ({ response: JSON.stringify({ value: "needs-correction" }) }));
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const onFallback = vi.fn();
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(workersRun),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      fetcher,
      onFallback,
    });

    await provider.run(request);
    expect(provider.switchToFallback?.("quality-retry")).toBe(true);
    await provider.run({ ...request, userPrompt: "corrected" });

    expect(provider.activeProvider).toBe("groq");
    expect(workersRun).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith("quality-retry");
  });

  it("uses non-thinking JSON Object Mode for the Qwen plan model", async () => {
    const fetcher = vi.fn(async () => groqSuccess()) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(async () => {
        throw new Error("4006: daily free allocation exhausted");
      }),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "qwen/qwen3.6-27b",
      groqStrictJsonSchema: false,
      fetcher,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    await provider.run(request);

    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("none");
    expect(body.include_reasoning).toBe(false);
  });

  it("keeps the existing daily-limit behavior when no Groq key is configured", async () => {
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(async () => {
        throw new Error("3036: daily free allocation exhausted");
      }),
      workersModel: "workers-model",
      groqModel: "openai/gpt-oss-120b",
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: false,
    });
  });

  it("does not retry a Groq rate limit and preserves Retry-After", async () => {
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: "limited" } }),
      { status: 429, headers: { "content-type": "application/json", "retry-after": "7" } },
    )) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(async () => {
        throw new Error("4006: daily free allocation exhausted");
      }),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      fetcher,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "groq",
      kind: "rate_limit",
      retryable: false,
      retryAfter: 7,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats Groq JSON validation generation failures as retryable without exposing the body", async () => {
    const privateUpstreamBody = "generated-private-payload";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          error: {
            code: "json_validate_failed",
            message: `Generated JSON did not match: ${privateUpstreamBody}`,
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ))
      .mockResolvedValueOnce(groqSuccess()) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(async () => {
        throw new Error("4006: daily free allocation exhausted");
      }),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      groqCorrectionModel: "openai/gpt-oss-20b",
      fetcher,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    const error = await provider.run(request).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      provider: "groq",
      kind: "invalid_response",
      retryable: true,
      upstreamStatus: 400,
      upstreamCode: "json_validate_failed",
    });
    expect((error as Error).message).not.toContain(privateUpstreamBody);

    await expect(provider.run(request)).resolves.toEqual(expect.any(Object));
    const [, correctionInit] = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls[1] as [string, RequestInit];
    const correctionBody = JSON.parse(String(correctionInit.body)) as Record<string, unknown>;
    expect(correctionBody.model).toBe("openai/gpt-oss-20b");
  });

  it.each([
    [401, "authentication", false],
    [400, "invalid_request", false],
    [422, "invalid_response", true],
    [503, "unavailable", true],
  ] as const)("sanitizes Groq HTTP %i as %s", async (status, kind, retryable) => {
    const privateUpstreamBody = "private-upstream-detail";
    const fetcher = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: privateUpstreamBody } }),
      {
        status,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-safe-123",
        },
      },
    )) as unknown as typeof fetch;
    const provider = createQuotaFallbackAiProvider({
      workersAi: workersBinding(async () => {
        throw new Error("4006: daily free allocation exhausted");
      }),
      workersModel: "workers-model",
      groqApiKey: "test-key",
      groqModel: "openai/gpt-oss-120b",
      fetcher,
    });

    await expect(provider.run(request)).rejects.toMatchObject({
      provider: "workers-ai",
      kind: "daily_limit",
      retryable: true,
    });
    const error = await provider.run(request).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error).toMatchObject({
      provider: "groq",
      kind,
      retryable,
      upstreamStatus: status,
      upstreamRequestId: "req-safe-123",
    });
    expect((error as Error).message).not.toContain(privateUpstreamBody);
    expect((error as Error).message).not.toContain("test-key");
  });
});

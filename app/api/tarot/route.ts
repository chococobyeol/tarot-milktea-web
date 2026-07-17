import {
  getCard,
  orientationLabel,
  CARD_BY_ID,
  type AnswerContract,
  type ReadingContext,
  type ReadingPlan,
  type ReadingLanguage,
  type ReadingResult,
  type SelectedCard,
} from "@/src/lib/tarot";
import {
  enforcePlanQuality,
  enforceReadingQuality,
  type ExpectedInterpretation,
} from "@/src/lib/reading-quality";
import {
  readingPlanSchema,
  readingResultSchema,
  tarotApiRequestSchema,
} from "@/src/lib/schemas";
import {
  READING_PLAN_JSON_SCHEMA,
  READING_RESULT_JSON_SCHEMA,
} from "@/src/server/ai-schemas";
import {
  AiProviderError,
  createQuotaFallbackAiProvider,
  type AiJsonProvider,
  type AiJsonSchema,
} from "@/src/server/ai-provider";
import {
  ApiError,
  apiErrorResponse,
  completeFollowup,
  consumeAiCall,
  readSafeJson,
  type RuntimeEnv,
  type WorkersAIBinding,
} from "@/src/server/security";

const WORKERS_AI_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const GROQ_PLAN_MODEL = "openai/gpt-oss-120b";
const GROQ_INTERPRETATION_MODEL = "openai/gpt-oss-120b";
const GROQ_INTERPRETATION_CORRECTION_MODEL = GROQ_INTERPRETATION_MODEL;
const GROQ_INTERPRETATION_MAX_TOKENS = 4_800;

const SYSTEM_PROMPT = `당신은 타로밀크티 웹의 해석 엔진이다.
- 요청에서 지정한 출력 언어로 중립적이고 분석적인 문장을 쓴다.
- 인사, 위로, 신비주의적 수사, 감탄, 사람처럼 느끼는 표현을 쓰지 않는다.
- 질문 전체와 대화 문맥을 읽어 사용자가 실제로 요구한 답의 형태와 범위를 판단한다.
- 카드 원뜻, 방향, 자리 역할에서 실제 답까지 이어지는 논리를 설명한다.
- 질문에 없는 주제로 범위를 확대하지 않는다.
- 한국어로 쓸 때는 주어와 행동이 드러나는 짧고 자연스러운 문장을 사용한다. 카드 키워드와 자리 이름을 추상명사로 나열하지 않는다.
- 한국어 출력은 자연스러운 "-해요/-이에요" 해요체로 통일한다. "-한다/-이다"나 "-합니다/-입니다" 문체를 섞지 않는다.
- 사용자가 요구한 답의 형태를 가장 먼저 지킨다. 하나를 골라 달라면 하나를 고르고, 추천해 달라면 구체적인 추천 하나를 말하고, 예측·조언·원인 설명을 요청하면 그 결론부터 말한다.
- 직접 답해야 하는 질문에 조건이나 판단 기준만 나열하며 결론을 미루지 않는다. 직접 답한 뒤 카드 근거를 쓴다.
- "서로 다른 측면", "요소가 상호작용한다", "균형 잡힌 고려", "분리를 통해 접근" 같은 내용 없는 문장을 쓰지 않는다.
- 요약, 종합 해석, 확인할 점에서 같은 내용을 반복하지 않는다.
- 카드별 sourceMeaning에서는 제공된 원뜻을 정확히 설명하고, 그 밖의 영역에서는 카드 데이터 문장을 그대로 복사하지 말고 질문에 맞는 실제 판단 기준이나 행동으로 바꿔 쓴다.
- 질문의 분야가 무엇이든 카드 상징에서 필요한 성질·상태·감정·결과를 자유롭게 추론하되, 어떤 카드 원뜻과 자리 역할에서 나온 판단인지 밝힌다.
- 결과를 묻는 질문은 카드 배열이 가리키는 한쪽을 첫 문장에서 분명히 말하고, 현실의 불확실성을 이유로 결론을 취소하지 않는다.
- 숫자는 화면의 AI 해석 지표로만 작성한다. 검사 결과, 실제 통계, 정확한 확률이나 의학적 진단을 받은 것처럼 출처를 꾸며내지 않는다.
- 제공된 카드 의미 데이터의 범위를 벗어난 의미를 확정적으로 추가하지 않는다.
- 열린 추천 요청에서는 카드 공개 전 후보를 만들거나 범위를 임의로 좁히지 않는다. 모든 카드를 해석한 뒤 질문에 맞는 구체적인 답 하나를 처음 제안하고, 카드 의미가 그 답과 어떻게 이어지는지 구체적으로 설명한다.
- "이 질문에서는", "질문에 따르면", "추천할 수 있는 것은" 같은 메타 문장으로 시작하지 않는다. 사용자가 바로 이해할 수 있는 답부터 쓴다.
- 반드시 JSON 객체만 출력한다.`;

function extractResponseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.response === "string") return record.response;
    if (record.response && typeof record.response === "object") return JSON.stringify(record.response);
    if (typeof record.result === "string") return record.result;
    if (record.result && typeof record.result === "object") return JSON.stringify(record.result);
    if (typeof record.output_text === "string") return record.output_text;
    const output = record.output;
    if (Array.isArray(output)) {
      const collectOutputText = (messageOnly: boolean) => output.flatMap((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const outputItem = item as Record<string, unknown>;
        if (messageOnly && outputItem.type !== "message") return [];
        if (typeof outputItem.text === "string") return [outputItem.text];
        if (!Array.isArray(outputItem.content)) return [];
        return outputItem.content.flatMap((content) => {
          if (!content || typeof content !== "object" || Array.isArray(content)) return [];
          const contentItem = content as Record<string, unknown>;
          if (messageOnly && contentItem.type && contentItem.type !== "output_text") return [];
          return typeof contentItem.text === "string" ? [contentItem.text] : [];
        });
      }).join("\n");
      const outputText = collectOutputText(true) || collectOutputText(false);
      if (outputText) return outputText;
    }
    if (Array.isArray(record.choices)) {
      const choice = record.choices[0];
      if (choice && typeof choice === "object") {
        const message = (choice as Record<string, unknown>).message;
        if (message && typeof message === "object") {
          const content = (message as Record<string, unknown>).content;
          if (typeof content === "string") return content;
        }
      }
    }
  }
  throw new ApiError(502, "AI_RESPONSE_EMPTY", "AI 응답이 비어 있습니다.");
}

function parseJsonText(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse((fenced ?? text).trim());
}

function normalizeSignalDistribution(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const raw = [record.support, record.caution, record.uncertainty].map((entry) => (
    typeof entry === "number" && Number.isFinite(entry) ? Math.max(0, entry) : 0
  ));
  const total = raw.reduce((sum, entry) => sum + entry, 0);
  if (total <= 0) return { support: 34, caution: 33, uncertainty: 33 };
  const support = Math.min(100, Math.round((raw[0] / total) * 100));
  const caution = Math.min(100 - support, Math.round((raw[1] / total) * 100));
  return { support, caution, uncertainty: 100 - support - caution };
}

function normalizePlanShape(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const positions = Array.isArray(record.positions) ? record.positions : [];
  return {
    ...record,
    cardCount: positions.length,
  };
}

function normalizeReadingShape(
  value: unknown,
  expectedCards: ExpectedInterpretation[],
  answerContract: AnswerContract,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const normalizedInterpretations = Array.isArray(record.cardInterpretations)
    ? record.cardInterpretations.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const interpretation = item as Record<string, unknown>;
      return {
        ...interpretation,
        evidence: typeof interpretation.evidence === "string"
          ? [interpretation.evidence]
          : interpretation.evidence,
      };
    })
    : record.cardInterpretations;
  const hasExactCardSet = Array.isArray(normalizedInterpretations)
    && normalizedInterpretations.length === expectedCards.length
    && expectedCards.every((expected) => normalizedInterpretations.filter((item) => (
      item
      && typeof item === "object"
      && !Array.isArray(item)
      && (item as Record<string, unknown>).cardId === expected.cardId
    )).length === 1);
  const orderedInterpretations = hasExactCardSet
    ? expectedCards.map((expected) => normalizedInterpretations.find((item) => (
      item
      && typeof item === "object"
      && !Array.isArray(item)
      && (item as Record<string, unknown>).cardId === expected.cardId
    )))
    : [];
  const orderedOrOriginal = hasExactCardSet
    ? orderedInterpretations
    : normalizedInterpretations;
  const cardInterpretations = Array.isArray(orderedOrOriginal)
    ? orderedOrOriginal.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const interpretation = item as Record<string, unknown>;
      const expected = expectedCards.find((candidate) => candidate.cardId === interpretation.cardId);
      if (!expected) return interpretation;
      const reasoning = interpretation.reasoning;
      const reasoningRecord = reasoning && typeof reasoning === "object" && !Array.isArray(reasoning)
        ? reasoning as Record<string, unknown>
        : null;
      return {
        ...interpretation,
        positionTitle: expected.positionTitle,
        orientation: expected.orientation,
        reasoning: reasoningRecord
          ? { ...reasoningRecord }
          : reasoning,
        evidence: expected.evidence,
      };
    })
    : orderedOrOriginal;

  const normalizedAxes = Array.isArray(record.axes)
    ? record.axes.map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const axis = item as Record<string, unknown>;
        return {
          ...axis,
          evidence: Array.isArray(axis.evidence)
            ? axis.evidence.filter((entry): entry is string => typeof entry === "string").join(" ")
            : axis.evidence,
        };
      })
    : record.axes;
  const verdict = record.verdict && typeof record.verdict === "object" && !Array.isArray(record.verdict)
    ? { ...(record.verdict as Record<string, unknown>), kind: answerContract.kind }
    : record.verdict;
  return {
    ...record,
    verdict,
    cardInterpretations,
    axes: normalizedAxes,
    signals: normalizeSignalDistribution(record.signals),
  };
}

type AiOperation = "plan" | "interpret";

function validationDiagnostics(error: unknown): { validationCodes?: string[] } {
  if (!error || typeof error !== "object" || !("issues" in error)) return {};
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) return {};
  const validationCodes = issues.slice(0, 6).flatMap((issue) => {
    if (!issue || typeof issue !== "object") return [];
    const record = issue as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : "unknown";
    const path = Array.isArray(record.path)
      ? record.path.filter((part): part is string | number => (
          typeof part === "string" || typeof part === "number"
        )).join(".")
      : "";
    return [`${code}:${path}`];
  });
  return validationCodes.length > 0 ? { validationCodes } : {};
}

function classifyAiFailure(error: unknown): string {
  if (error instanceof AiProviderError) {
    return `${error.provider.toUpperCase().replace("-", "_")}_${error.kind.toUpperCase()}`;
  }
  if (error instanceof SyntaxError) return "INVALID_JSON";
  if (error && typeof error === "object" && "issues" in error) return "SCHEMA_VALIDATION_FAILED";

  const message = error instanceof Error ? error.message : "";
  if (/비어|empty response/i.test(message)) return "EMPTY_RESPONSE";
  if (/network|fetch|timeout|connection/i.test(message)) return "PROVIDER_REQUEST_FAILED";
  return "QUALITY_VALIDATION_FAILED";
}

function providerApiError(error: AiProviderError): ApiError {
  if (error.provider === "workers-ai" && error.kind === "daily_limit") {
    return new ApiError(
      503,
      "DAILY_AI_LIMIT",
      "오늘 AI 사용 한도를 모두 사용했습니다. 한국 시간 오전 9시 이후 다시 시도하세요.",
    );
  }
  if (error.provider === "groq" && error.kind === "rate_limit") {
    return new ApiError(
      503,
      "BACKUP_AI_RATE_LIMIT",
      "대체 AI의 현재 사용 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
      error.retryAfter,
    );
  }
  if (error.provider === "groq" && error.kind === "invalid_response") {
    return new ApiError(
      502,
      "INVALID_AI_RESPONSE",
      "AI 응답 형식을 확인하지 못했습니다. 현재 상태를 유지하고 다시 시도하세요.",
    );
  }
  return new ApiError(
    503,
    "BACKUP_AI_UNAVAILABLE",
    "대체 AI에 연결하지 못했습니다. 현재 상태를 유지하고 잠시 후 다시 시도하세요.",
    error.retryAfter,
  );
}

async function runAiJson<T>(
  operation: AiOperation,
  provider: AiJsonProvider,
  prompt: string,
  validate: (value: unknown) => T,
  maxTokens: number,
  jsonSchema: AiJsonSchema,
  maxAttempts = 2,
  temperature = 0.25,
  recoverLastValid?: () => T | undefined,
): Promise<T> {
  const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `ai-${Date.now()}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let responseLength: number | undefined;
    try {
      const userPrompt = attempt === 0
        ? prompt
        : `${prompt}\n이전 응답 문제: ${lastError instanceof Error ? lastError.message.replace(/\s+/g, " ").slice(0, 900) : "출력 품질 또는 JSON 형식이 기준에 맞지 않았다."}\n지적된 문제를 모두 고쳐 필수 필드를 포함한 JSON만 다시 출력하라.`;
      const result = await provider.run({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens,
        temperature,
        jsonSchema,
      });
      const responseText = extractResponseText(result);
      responseLength = responseText.length;
      return validate(parseJsonText(responseText));
    } catch (error) {
      lastError = error;
      console.warn("[tarot-ai] response rejected", {
        requestId,
        operation,
        attempt: attempt + 1,
        provider: provider.activeProvider,
        category: classifyAiFailure(error),
        responseLength,
        ...validationDiagnostics(error),
      });
      if (error instanceof AiProviderError && !error.retryable) {
        const recovered = recoverLastValid?.();
        if (recovered) return recovered;
        throw providerApiError(error);
      }
      if (attempt + 1 < maxAttempts) provider.switchToFallback?.("quality-retry");
    }
  }

  const recovered = recoverLastValid?.();
  if (recovered) {
    console.warn("[tarot-ai] accepting structurally valid response after quality retries", {
      requestId,
      operation,
    });
    return recovered;
  }
  if (lastError instanceof AiProviderError) throw providerApiError(lastError);
  console.error("[tarot-ai] all responses rejected", {
    requestId,
    operation,
    provider: provider.activeProvider,
    category: classifyAiFailure(lastError),
    ...validationDiagnostics(lastError),
  });
  throw new ApiError(502, "INVALID_AI_RESPONSE", "AI 응답 형식을 확인하지 못했습니다. 현재 상태를 유지하고 다시 시도하세요.");
}

function createReadingAiProvider(
  ai: WorkersAIBinding,
  groqApiKey: string | undefined,
  groqModel: string,
  groqMaxTokens: number,
  groqStrictJsonSchema: boolean,
  groqCorrectionModel?: string,
  groqCorrectionMaxTokens?: number,
  groqCorrectionStrictJsonSchema?: boolean,
): AiJsonProvider {
  return createQuotaFallbackAiProvider({
    workersAi: ai,
    workersModel: WORKERS_AI_MODEL,
    groqApiKey,
    groqModel,
    groqMaxTokens,
    groqStrictJsonSchema,
    groqCorrectionModel,
    groqCorrectionMaxTokens,
    groqCorrectionStrictJsonSchema,
    onFallback: (reason) => {
      console.warn("[tarot-ai] switching provider", {
        from: "workers-ai",
        to: "groq",
        reason,
      });
    },
  });
}

export async function createAiPlan(
  ai: WorkersAIBinding,
  question: string,
  followup: boolean,
  language: ReadingLanguage,
  context?: ReadingContext,
  groqApiKey?: string,
): Promise<ReadingPlan> {
  const prompt = `다음 질문을 위한 ${followup ? "추가" : "최초"} 타로 리딩 구조를 설계하라.
현재 질문: ${JSON.stringify(question)}
대화 맥락: ${JSON.stringify(context ?? null)}
출력 언어: ${language === "ko" ? "한국어" : "English"}. JSON 키는 스키마 그대로 유지하고 모든 사용자 표시 문자열 값은 이 언어로 작성한다.

질문 전체와 대화 문맥을 이해한 뒤 answerContract와 자리 역할을 한 번에 결정한다. 단어 하나가 아니라 사용자가 문장 전체에서 요구한 답을 기준으로 판단한다.
- choose_one: 사용자가 제시한 후보 중 하나를 골라 달라는 요청. candidates에는 질문의 후보를 철자 그대로 2~5개 넣는다.
- recommend_one: 정해진 후보 없이 구체적인 대상이나 행동 하나를 추천해 달라는 요청. candidates는 반드시 빈 배열이다. 카드 공개 전에는 내부적으로도 후보 목록을 만들지 않는다. 카드를 모두 해석한 뒤에만 질문의 제약 안에서 구체적인 답 하나를 생성한다.
- yes_no: 해야 하는지, 가능한지처럼 예/아니요 방향을 요청. 출력 언어의 예/아니요 후보 2개를 넣는다.
- outcome: 성공·실패, 합격·불합격, 성사 여부처럼 사건의 결과를 묻는 질문. candidates는 빈 배열이다. 자리 수와 역할은 질문의 복잡도에 따라 정한다.
- compare: 후보의 차이만 비교하고 선택까지 요구하지 않는 질문. 질문에 나온 후보를 candidates에 넣는다.
- forecast: 시기, 가능성, 향후 흐름을 묻는 질문.
- advice: 무엇을 하거나 어떻게 대응할지 먼저 할 행동을 묻는 질문.
- explain: 이유나 원인을 묻는 질문.
- analysis: 위 유형이 아닌 상태·관계·의미 분석 질문.
후속 질문이 앞선 결론을 이어 가는지 새 대상을 묻는지도 문맥으로 판단한다. 명시 후보는 현재 질문이나 previousContract에서 사용자가 제시한 것만 사용할 수 있다. recommend_one에는 후보를 만들거나 상속하지 않는다.
answerContract.subject에는 지금 답해야 할 대상을 짧고 구체적으로 적는다. candidates가 필요 없는 유형은 빈 배열을 쓴다.

positions는 질문에 실제로 필요한 서로 다른 역할의 수에 따라 1~5개로 정한다. positions 길이가 사용자가 뽑을 카드 수가 된다. 질문 글자 수나 특정 단어가 아니라, 답을 내는 데 필요한 관점 수를 기준으로 한다. 의미가 겹치는 자리를 수를 늘리기 위해 만들지 않는다.
choose_one, yes_no, compare도 후보 수에 기계적으로 맞추지 말고, 질문을 제대로 판단하는 데 필요한 역할을 1~5개로 구성한다. 후보별 자리가 필요하다면 사용하되 자리 이름에 후보 문구를 억지로 반복하지 않는다.
recommend_one은 후보별 자리를 만들지 않는다. 질문에 답하기 위해 필요한 서로 다른 역할만 만든다. 구체적인 추천 대상은 카드 공개 뒤 해석 단계에서 처음 정한다.
각 title은 화면에서 바로 이해되는 짧은 라벨이고, focus는 그 카드가 최종 답에 어떤 정보를 더할지 구체적으로 설명한다. 어느 질문에나 그대로 붙는 추상적인 자리나 설문 문항 같은 표현을 피한다.
응답 JSON 스키마:
{
  "interpretationFrame": "이번 리딩이 분석할 기준",
  "selectionGuide": "카드 선택 안내 한 문장",
  "positions": [{ "id": "고유 영문 ID", "title": "자리 이름", "focus": "이 자리가 살펴볼 관점" }],
  "answerContract": { "kind": "choose_one|recommend_one|yes_no|outcome|compare|forecast|advice|explain|analysis", "subject": "직접 답할 대상", "candidates": [] }
}
interpretationFrame은 자리 이름을 다시 나열하지 말고, 이번 리딩에서 무엇을 판단할지 한 문장으로 쓴다.`;
  const provider = createReadingAiProvider(
    ai,
    groqApiKey,
    GROQ_PLAN_MODEL,
    1_600,
    true,
    GROQ_PLAN_MODEL,
    1_600,
    true,
  );
  return runAiJson("plan", provider, prompt, (value) => enforcePlanQuality(
    readingPlanSchema.parse(normalizePlanShape(value)),
    { question, language, conversation: context },
  ), 1_200, READING_PLAN_JSON_SCHEMA, 3, 0.2);
}

export async function createAiInterpretation(
  ai: WorkersAIBinding,
  question: string,
  cards: SelectedCard[],
  previous: ReadingResult | undefined,
  language: ReadingLanguage,
  answerContract: AnswerContract,
  context?: ReadingContext,
  groqApiKey?: string,
): Promise<ReadingResult> {
  const contract = answerContract;
  const latestRound = Math.max(...cards.map((card) => card.round));
  const cardsToInterpret = previous ? cards.filter((card) => card.round === latestRound) : cards;
  const expectedCards: ExpectedInterpretation[] = cardsToInterpret.map((selected) => {
    const card = getCard(selected.cardId);
    const meaning = card[selected.reversed ? "reversed" : "upright"];
    const direction = orientationLabel(selected.reversed, language);
    return {
      cardId: selected.cardId,
      cardName: language === "ko" ? card.nameKo : card.nameEn,
      positionTitle: selected.positionTitle,
      positionFocus: selected.positionFocus,
      orientation: selected.reversed ? "reversed" : "upright",
      orientationLabel: direction,
      sourceKeywords: meaning.keywords,
      evidence: language === "ko"
        ? [
          `${direction} · ${meaning.keywords.slice(0, 2).join(" · ")}`,
          `자리 · ${selected.positionTitle}`,
        ]
        : [
          `Card meaning · ${direction}`,
          `Position · ${selected.positionTitle}`,
        ],
    };
  });
  const selectedData = cardsToInterpret.map((selected) => {
    const card = getCard(selected.cardId);
    const meaning = card[selected.reversed ? "reversed" : "upright"];
    return {
      placement: {
        id: selected.positionId,
        title: selected.positionTitle,
        focus: selected.positionFocus,
        orientation: selected.reversed ? "reversed" : "upright",
        orientationLabel: orientationLabel(selected.reversed, language),
      },
      card: {
        id: card.id,
        nameKo: card.nameKo,
        nameEn: card.nameEn,
        meaning: {
          keywords: meaning.keywords,
          coreMeaning: meaning.summary,
          cautionTheme: meaning.caution,
        },
      },
    };
  });
  const lengthGuide = language === "ko"
    ? (cardsToInterpret.length === 1
      ? "전체 한국어 본문은 450~850자"
      : cardsToInterpret.length === 2
        ? "전체 한국어 본문은 650~1150자"
        : "전체 한국어 본문은 900~1800자")
    : (previous ? "The complete English response should be about 350–700 words" : "The complete English response should be about 450–1000 words");
  const previousContext = previous ? {
    priorConclusion: previous.summary,
    priorVerdict: previous.verdict,
    priorAxes: previous.axes.map(({ label, score }) => ({ label, score })),
    priorSignals: previous.signals,
  } : null;
  const previousContract = context?.previousContract;
  const sameContractContinuation = Boolean(previous && previousContract
    && previousContract.kind === contract.kind
    && previousContract.subject.trim().toLowerCase() === contract.subject.trim().toLowerCase()
    && JSON.stringify(previousContract.candidates.map((item) => item.trim().toLowerCase()))
      === JSON.stringify(contract.candidates.map((item) => item.trim().toLowerCase())));
  const followupAxesGuide = previous
    ? sameContractContinuation
      ? "추가 질문이 같은 답변 계약을 이어가므로 axes label은 이전 결과와 같게 유지한다."
      : "추가 질문이 새로운 대상이나 답변 계약을 다루므로 axes는 현재 질문에 맞게 새로 만들고, 이전 label을 억지로 재사용하지 않는다."
    : "";
  const contractGuide = `답변 계약: ${JSON.stringify(contract)}
- verdict에는 value와 statement만 출력한다. kind는 서버가 답변 계약에서 보존한다.
- verdict.value에는 질문에 대한 실제 답만 짧게 쓴다. 질문을 되풀이하거나 판단 기준만 답으로 쓰지 않는다.
- verdict.statement는 verdict.value를 포함하고, 현재 질문을 보지 않아도 무엇에 대한 답인지 이해되는 자연스러운 한 문장이다.
- choose_one과 yes_no에서는 candidates 중 정확히 하나를 verdict.value로 고른다. 둘 이상을 합치거나 후보 밖 답을 만들지 않는다.
- outcome에서는 카드가 가리키는 결과 한쪽을 질문에 맞는 말로 바로 답한다.
- recommend_one에서는 모든 카드의 역할과 의미를 해석한 뒤 사용자가 그대로 선택하거나 실행할 수 있는 구체적인 대상 또는 행동 하나를 처음 만든다. 범주·조건·후보 목록으로 대신하지 않는다.
- 어떤 분야든 질문에 답하는 데 필요한 속성이나 상태를 카드 상징에서 자유롭게 추론하고, 그 추정이 어떤 원뜻과 자리에서 나온 것인지 설명한다.
- compare는 핵심 차이를, forecast는 가장 가능성이 큰 방향이나 시기를, advice는 먼저 할 행동을, explain은 중심 원인을, analysis는 가장 중요한 발견을 verdict.value에 직접 쓴다.
- 첫 문장만 읽어도 요청한 답의 형태가 충족되어야 한다. 질문을 다시 말하거나 "살펴본다/확인한다"로 끝내지 않는다.
- choose_one, recommend_one, yes_no, outcome, advice에서는 답을 미루거나 복수 대안을 다시 열지 않는다. 주의 신호는 결론을 취소하는 문장이 아니라 그 결론의 근거로 설명한다.
- 후보 비교형에서도 각 후보 자리에 놓인 카드 원뜻을 후보의 실제 차이와 예상 결과에 연결한다.
- 후보 비교형 axes는 후보마다 하나씩 만들고 각 label을 해당 후보 이름으로 시작한다. 후보가 2개라서 최소 3개 축이 필요할 때는 선택이면 "결론 선명도", compare이면 "비교 선명도" 축 하나만 추가한다. 질문에 없는 별도 평가 속성을 축으로 만들지 않는다.
- recommend_one의 axes는 공개 전 만들지 않은 대안들을 사후에 나열하지 않고, 카드 역할과 질문의 실제 판단 신호를 3~5개 축으로 표시한다.
- 최근 같은 브라우저에서 나온 추천은 ${JSON.stringify(context?.recentRecommendations ?? [])}이다. 카드 조합이 특별히 강하게 지지하지 않는 한 같은 답을 반복하지 않는다.`;
  const prompt = `다음 질문과 카드로 종합 해석을 생성하라.
현재 질문: ${JSON.stringify(question)}
대화 맥락: ${JSON.stringify(context ?? null)}
출력 언어: ${language === "ko" ? "한국어" : "English"}. JSON 키는 스키마 그대로 유지하고 모든 사용자 표시 문자열 값은 이 언어로 작성한다.
${contractGuide}
선택 카드와 참고 데이터: ${JSON.stringify(selectedData)}
이전 결과의 연결 정보(문체를 모방하지 말 것): ${JSON.stringify(previousContext)}

필수 JSON 필드:
- verdict: answerContract를 실행한 직접 답이다. value와 statement를 쓴다. kind는 출력하지 않는다.
- summary: 화면에서 verdict.statement 바로 아래에 표시할 근거 설명만 1~2문장으로 쓴다. verdict.statement를 되풀이하거나 앞에 붙이지 않고, 카드 이름이나 키워드만 나열하지 않으며 결론을 다시 흐리지 않는다.
- cardInterpretations: 정확히 ${expectedCards.length}개이며 중복을 만들지 않는다. 다음 순서와 cardId, positionTitle, orientation 값을 그대로 사용한다: ${JSON.stringify(expectedCards.map(({ cardId, cardName, positionTitle, positionFocus, orientation, orientationLabel: direction, sourceKeywords, evidence }) => ({ cardId, cardName, positionTitle, roleFocus: positionFocus, orientation, orientationLabel: direction, sourceKeywords, evidence })))}.
  - text: 먼저 읽히는 결론이다. 질문에 적용할 판단을 25~90자로 직접 쓴다.
  - reasoning.sourceMeaning: 위 카드의 coreMeaning과 sourceKeywords를 바꾸지 말고 출력 언어의 자연스러운 문장으로 45~140자 안에서 설명한다.
  - reasoning.questionConnection: 왜 그 원뜻이 이 질문의 이 자리에 해당하는지 80~200자로 설명한다. 지정된 자리 이름을 자연스럽게 언급하고 그 자리가 살펴보는 초점과 연결되는 논리를 명시한다. 원뜻과 결론 사이를 건너뛰지 않는다.
  - reasoning.decisionImpact: 이 카드가 전체 결론을 지지하는지 반대하는지, 최종 답에 얼마나 강하게 작용하는지를 45~150자로 설명한다. 이미 내린 결론을 조건부로 다시 열지 않는다.
  - evidence는 서버가 위 카드 데이터에서 직접 넣으므로 JSON에 출력하지 않는다.
- synthesis: 정확히 카드당 한 문장씩 ${expectedCards.length}문장으로 쓴다. 각 문장은 카드 이름으로 시작하고 그 카드가 결론을 뒷받침하는 이유를 질문의 말로 설명한다. 카드를 사람처럼 행동하는 주어로 쓰지 말고, 카드가 어떤 판단의 근거가 되는지 쓴다. 카드 문장 뒤에 전체를 다시 요약하는 결론 문장을 추가하지 않는다.
- guidance: 사용자가 실제로 확인하거나 실행할 수 있는 짧은 항목 2~4개. 카드 데이터 문장을 복사하지 않는다. recommend_one에서는 답 자체를 다시 반복하지 말고, 그 답을 고른 카드 근거에서 나온 실행 방법이나 주의점만 쓴다.
- axes: 질문에 맞는 ${expectedCards.length === 1 ? "정확히 3개" : "3~5개"} 축. 각 항목은 label, score(0~100 정수), evidence(질문에 연결된 한 문장 문자열), evidenceCardIds
- signals: support, caution, uncertainty 정수이며 합계 100

JSON 자료형 예시:
{
  "verdict": { "value": "직접 답", "statement": "직접 답 한 문장" },
  "summary": "문자열",
  "cardInterpretations": [{ "cardId": "문자열", "positionTitle": "문자열", "orientation": "upright", "text": "문자열", "reasoning": { "sourceMeaning": "문자열", "questionConnection": "문자열", "decisionImpact": "문자열" } }],
  "synthesis": "문자열",
  "guidance": ["문자열", "문자열"],
  "axes": [{ "label": "문자열", "score": 50, "evidence": "배열이 아닌 한 문장 문자열", "evidenceCardIds": ["카드 ID"] }],
  "signals": { "support": 50, "caution": 30, "uncertainty": 20 }
}

한국어의 text, questionConnection, decisionImpact를 합쳐 읽었을 때 질문에 나온 대상과 행동이 분명해야 한다. sourceMeaning은 카드 원뜻만 정확히 설명하고, questionConnection에서 원뜻→자리 역할→결론의 이유를 순서대로 연결한다. 추상명사를 세 개 이상 이어 붙이거나 "적절하다", "필요하다"로만 결론내리지 않는다.
recommend_one에서는 카드 공개 전 후보가 없다. 모든 카드를 해석한 뒤 질문에 직접 답하는 구체적인 대상이나 행동 하나를 처음 생성한다. 직접 추천하는 행위와 확인되지 않은 사실을 만드는 행위를 혼동하지 않는다.
질문에 답하기 위해 카드 상징에서 필요한 사실과 가능성을 자유롭게 추론할 수 있다. 추론을 회피하지 말고 카드 원뜻과 자리 역할에서 해당 결론이 나온 과정을 설명한다. 다만 실제 검사 결과, 출처가 있는 통계, 정확한 수치나 진단을 받은 것처럼 가짜 출처를 만들지는 않는다.
추가 질문이면 이전 해석을 반복하지 말고 변화한 판단과 새 카드의 영향에 집중한다.
${followupAxesGuide}
${lengthGuide}를 목표로 하되 카드별 근거, 종합, 행동 기준을 빠뜨리지 않는다.`;
  const provider = createReadingAiProvider(
    ai,
    groqApiKey,
    GROQ_INTERPRETATION_MODEL,
    GROQ_INTERPRETATION_MAX_TOKENS,
    true,
    GROQ_INTERPRETATION_CORRECTION_MODEL,
    GROQ_INTERPRETATION_MAX_TOKENS,
    true,
  );
  let lastStructurallyValid: ReadingResult | undefined;
  return runAiJson("interpret", provider, prompt, (value) => {
    const parsed = readingResultSchema.parse(normalizeReadingShape(value, expectedCards, contract));
    lastStructurallyValid = parsed;
    return enforceReadingQuality(
      parsed,
      { expectedCards, answerContract: contract },
    );
  }, cardsToInterpret.length <= 2 ? 3_200 : 4_000, READING_RESULT_JSON_SCHEMA, 3, 0.45, () => lastStructurallyValid);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = await readSafeJson(request);
    const input = tarotApiRequestSchema.parse(raw);
    if (input.action === "interpret" && input.cards.some((card) => !CARD_BY_ID.has(card.cardId))) {
      throw new ApiError(400, "UNKNOWN_CARD", "알 수 없는 카드가 요청에 포함되어 있습니다.");
    }
    const { env } = await import("cloudflare:workers");
    const runtimeEnv = env as unknown as RuntimeEnv;
    const countAsFollowup = input.action === "plan" && Boolean(input.followup);
    await consumeAiCall(request, runtimeEnv, countAsFollowup);
    if (!runtimeEnv.AI) {
      throw new ApiError(503, "AI_UNAVAILABLE", "AI 해석 서비스를 현재 사용할 수 없습니다. 잠시 후 다시 시도하세요.");
    }

    if (input.action === "plan") {
      const data = await createAiPlan(
        runtimeEnv.AI,
        input.question,
        input.followup,
        input.language,
        input.context,
        runtimeEnv.GROQ_API_KEY,
      );
      if (countAsFollowup) {
        await completeFollowup(request, runtimeEnv, input.context?.previousQuestions?.length ?? 0);
      }
      return Response.json({ data, mode: "ai" }, { headers: { "cache-control": "no-store" } });
    }

    const data = await createAiInterpretation(
      runtimeEnv.AI,
      input.question,
      input.cards,
      input.previous,
      input.language,
      input.answerContract,
      input.context,
      runtimeEnv.GROQ_API_KEY,
    );
    return Response.json({ data, mode: "ai" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

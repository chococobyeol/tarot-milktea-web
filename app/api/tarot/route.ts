import {
  designReading,
  createAnswerContract,
  detectQuestionCategory,
  generateReadingResult,
  getCard,
  orientationLabel,
  toKoreanHaeyo,
  CARD_BY_ID,
  type AnswerContract,
  type ReadingContext,
  type ReadingPlan,
  type ReadingLanguage,
  type ReadingResult,
} from "@/src/lib/tarot";
import {
  concreteWritingGuide,
  detectEverydayDomain,
  enforcePlanQuality,
  enforceReadingQuality,
  groundPositionConnection,
  isPhysicalFoodPosition,
  polishReadingLanguage,
  questionScopeGuide,
  resolveEverydayDomain,
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
const GROQ_PLAN_MODEL = "qwen/qwen3.6-27b";
const GROQ_INTERPRETATION_MODEL = "openai/gpt-oss-120b";
const GROQ_INTERPRETATION_CORRECTION_MODEL = "openai/gpt-oss-20b";
const GROQ_INTERPRETATION_MAX_TOKENS = 2_600;

const SYSTEM_PROMPT = `당신은 타로밀크티 웹의 해석 엔진이다.
- 요청에서 지정한 출력 언어로 중립적이고 분석적인 문장을 쓴다.
- 인사, 위로, 신비주의적 수사, 감탄, 사람처럼 느끼는 표현을 쓰지 않는다.
- 카드, 방향, 자리 역할과 질문의 관계를 근거로 설명한다.
- 질문의 크기에 맞춰 해석 범위를 제한한다. 식사나 오늘의 선택 같은 일상 질문을 인생, 재정, 조직, 타인 관계 문제로 확대하지 않는다.
- 한국어로 쓸 때는 주어와 행동이 드러나는 짧고 자연스러운 문장을 사용한다. 카드 키워드와 자리 이름을 추상명사로 나열하지 않는다.
- 한국어 출력은 자연스러운 "-해요/-이에요" 해요체로 통일한다. "-한다/-이다"나 "-합니다/-입니다" 문체를 섞지 않는다.
- 사용자가 요구한 답의 형태를 가장 먼저 지킨다. 하나를 골라 달라면 하나를 고르고, 추천해 달라면 구체적인 추천 하나를 말하고, 예측·조언·원인 설명을 요청하면 그 결론부터 말한다.
- 직접 답해야 하는 질문에 조건이나 판단 기준만 나열하며 결론을 미루지 않는다. 한계와 예외는 직접 답한 뒤에 쓴다.
- "서로 다른 측면", "요소가 상호작용한다", "균형 잡힌 고려", "분리를 통해 접근" 같은 내용 없는 문장을 쓰지 않는다.
- 요약, 종합 해석, 확인할 점에서 같은 내용을 반복하지 않는다.
- 카드별 sourceMeaning에서는 제공된 원뜻을 정확히 설명하고, 그 밖의 영역에서는 카드 데이터 문장을 그대로 복사하지 말고 질문에 맞는 실제 판단 기준이나 행동으로 바꿔 쓴다.
- 카드 상징을 현실의 인과관계나 영양·건강상의 사실처럼 만들지 않는다.
- 미래 사건, 합격, 성공, 상대의 감정을 확률이나 사실로 단정하지 않는다.
- 수치는 통계 확률이 아닌 AI 해석 지표다.
- 의료·법률·금융 전문 판단을 대신하지 않는다.
- 제공된 카드 의미 데이터의 범위를 벗어난 의미를 확정적으로 추가하지 않는다.
- 카드 상징은 사용자의 판단 방식과 주의점을 해석할 뿐, 음식의 포만감·영양, 날씨, 건강처럼 측정 가능한 현실 속성을 예측하지 못한다. 이런 자리에서는 속성을 단정하지 말고 사용자가 확인할 현실 정보와 판단상의 주의점을 구분한다.
- 추천 요청에서는 질문에 맞는 구체적인 후보를 새로 제안할 수 있다. 다만 그 후보의 맛·영양·효과·가격·상대 감정처럼 확인되지 않은 현실 속성을 추천 근거로 만들어내지 않는다.
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
    if (Array.isArray(record.output)) {
      const collectOutputText = (messageOnly: boolean) => record.output.flatMap((item) => {
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

function normalizeReadingShape(
  value: unknown,
  expectedCards: ExpectedInterpretation[],
  everydayDomain: ReturnType<typeof detectEverydayDomain>,
  language: ReadingLanguage,
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
      const questionConnection = typeof reasoningRecord?.questionConnection === "string"
        ? (language === "ko"
          ? groundPositionConnection(reasoningRecord.questionConnection, expected.positionTitle)
          : reasoningRecord.questionConnection)
        : reasoningRecord?.questionConnection;
      return {
        ...interpretation,
        positionTitle: expected.positionTitle,
        orientation: expected.orientation,
        reasoning: reasoningRecord
          ? {
            ...reasoningRecord,
            questionConnection,
            ...(expected.sourceMeaning ? { sourceMeaning: expected.sourceMeaning } : {}),
          }
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
  const physicalFoodCard = language === "ko"
    && everydayDomain === "food"
    && expectedCards.length === 1
    && isPhysicalFoodPosition(expectedCards[0].positionTitle, expectedCards[0].positionFocus)
    ? expectedCards[0]
    : null;
  const axes = physicalFoodCard && Array.isArray(normalizedAxes) && normalizedAxes.length === 2
    ? [
      ...normalizedAxes,
      {
        label: "식사량 확인",
        score: Math.round(normalizedAxes.reduce((sum, item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return sum + 50;
          const score = (item as Record<string, unknown>).score;
          return sum + (typeof score === "number" && Number.isFinite(score) ? score : 50);
        }, 0) / 2),
        evidence: "타로 카드는 실제 포만감을 알 수 없으므로 현재 배고픔과 사용자가 이미 아는 식사량을 직접 확인한다.",
        evidenceCardIds: [physicalFoodCard.cardId],
      },
    ]
    : normalizedAxes;

  return {
    ...record,
    cardInterpretations,
    axes,
  };
}

export function stabilizeAnswerContractReading(
  result: ReadingResult,
  contract: AnswerContract,
  language: ReadingLanguage,
): ReadingResult {
  const verdict = result.verdict;
  if (!verdict) return result;
  const summary = result.summary.trimStart().startsWith(verdict.statement.trim())
    ? result.summary
    : `${verdict.statement.trim()} ${result.summary.trim()}`;
  if (!contract.decisive) return { ...result, summary };
  const normalizedStatement = verdict.statement.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  const guidanceAlreadyActsOnVerdict = result.guidance.some((item) => (
    item.toLowerCase().replace(/[^0-9a-z가-힣]/g, "").includes(normalizedStatement)
    || item.toLowerCase().replace(/[^0-9a-z가-힣]/g, "").includes(
      verdict.value.toLowerCase().replace(/[^0-9a-z가-힣]/g, ""),
    )
  ));
  return {
    ...result,
    summary,
    guidance: guidanceAlreadyActsOnVerdict
      ? result.guidance
      : [
        verdict.statement,
        ...result.guidance,
        language === "ko"
          ? "확인 가능한 현실 조건이 결론과 충돌할 때만 조정해요."
          : "Adjust only when a verifiable real-world constraint conflicts with the answer.",
      ].slice(0, 4),
  };
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
  provider: AiJsonProvider,
  prompt: string,
  validate: (value: unknown) => T,
  maxTokens: number,
  jsonSchema: AiJsonSchema,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const userPrompt = attempt === 0
        ? prompt
        : `${prompt}\n이전 응답 문제: ${lastError instanceof Error ? lastError.message.replace(/\s+/g, " ").slice(0, 900) : "출력 품질 또는 JSON 형식이 기준에 맞지 않았다."}\n지적된 문제를 모두 고쳐 필수 필드를 포함한 JSON만 다시 출력하라.`;
      const result = await provider.run({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        maxTokens,
        temperature: 0.25,
        jsonSchema,
      });
      const responseText = extractResponseText(result);
      return validate(parseJsonText(responseText));
    } catch (error) {
      lastError = error;
      console.warn("[tarot-ai] response rejected", {
        attempt: attempt + 1,
        category: classifyAiFailure(error),
      });
      if (error instanceof AiProviderError && !error.retryable) {
        throw providerApiError(error);
      }
    }
  }

  if (lastError instanceof AiProviderError) throw providerApiError(lastError);
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
    onFallback: () => {
      console.warn("[tarot-ai] switching provider", {
        from: "workers-ai",
        to: "groq",
        reason: "daily-limit",
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
  const localPlan = designReading(question, followup, language, context);
  const prompt = `다음 질문을 위한 ${followup ? "추가" : "최초"} 타로 리딩 구조를 설계하라.
현재 질문: ${JSON.stringify(question)}
대화 맥락: ${JSON.stringify(context ?? null)}
출력 언어: ${language === "ko" ? "한국어" : "English"}. JSON 키는 스키마 그대로 유지하고 모든 사용자 표시 문자열 값은 이 언어로 작성한다.
질문 범위 지침: ${questionScopeGuide(question, language)}
문장 구체성 지침: ${concreteWritingGuide(question, language)}

먼저 주제가 아니라 사용자가 요구한 답의 형태를 answerContract로 정한다.
문장 안에 다른 질문 표현이 들어 있어도 문장 전체에서 사용자가 최종적으로 요구한 행위를 기준으로 정한다. 어떤 선택을 계속 고민하는 이유를 묻는 문장은 선택 요청이 아니라 explain이다.
- choose_one: 사용자가 제시한 후보 중 하나를 골라 달라는 요청. candidates에는 질문의 후보를 철자 그대로 2~5개 넣고 decisive=true.
- recommend_one: 정해진 후보 없이 구체적인 대상이나 행동 하나를 추천해 달라는 요청. 질문의 제약 안에서 실제로 답이 될 수 있는 구체적 후보 3~5개를 candidates에 짧은 이름으로 만들고 decisive=true. "종류", "범주", "적당한 것" 같은 상위 개념이 아니라 이름만 보고 그대로 선택·실행할 수 있는 특정 항목이나 행동을 쓴다. 후보의 효과나 객관적 속성을 지어내지 않는다.
- yes_no: 해야 하는지, 가능한지처럼 예/아니요 방향을 요청. 출력 언어의 예/아니요 후보 2개와 decisive=true.
- compare: 후보의 차이만 비교하고 선택까지 요구하지 않는 질문. 질문에 나온 후보를 candidates에 넣고 decisive=false.
- forecast: 시기, 가능성, 향후 흐름을 묻는 질문.
- advice: 무엇을 하거나 어떻게 대응할지 먼저 할 행동을 묻는 질문이며 decisive=true.
- explain: 이유나 원인을 묻는 질문이며 decisive=false.
- analysis: 위 유형이 아닌 상태·관계·의미 분석 질문이며 decisive=false.
decisive는 choose_one, recommend_one, yes_no, advice에서만 true이고 compare, forecast, explain, analysis에서는 false이다.
후속 질문이 "그래서", "결국", "정확히", "어느 쪽"처럼 앞선 결론을 가리키면 대화 맥락의 previousContract와 원 질문을 이어서 해석한다. 새 대상을 묻는 질문이면 이전 후보를 상속하지 않는다.
answerContract.subject에는 지금 답해야 할 대상을 현재 질문의 핵심 명사를 직접 사용해 한 문장으로 적고, candidates가 필요 없는 유형은 빈 배열을 쓴다.

카드 수는 질문의 범위에 따라 1~5장이다. 기본 권장 수는 ${localPlan.cardCount}장이지만 질문을 읽고 조정할 수 있다.
choose_one, recommend_one, yes_no, compare는 후보마다 카드 한 장을 배정하므로 cardCount와 positions 길이를 candidates 길이와 같게 한다. 각 position의 title 또는 focus에 해당 후보 이름을 철자 그대로 넣는다.
자리 역할은 질문에 실제로 답하는 구체적인 비교 기준으로 작성한다. title마다 현재 질문의 핵심 명사나 행동을 직접 넣는다. "방향성", "외부 조건", "실행 가능성", "현재 상황", "현재 상태", "핵심 기준", "선택 기준", "조정 방향"처럼 어느 질문에나 붙일 수 있는 제목은 사용하지 않는다.
짧은 일상 질문에서는 질문에 실제로 나온 대상과 행동을 중심으로 쓴다. 질문에 없는 현실 속성을 새 비교 기준으로 만들지 않는다.
응답 JSON 스키마:
{
  "cardCount": 1~5 정수,
  "interpretationFrame": "이번 리딩이 분석할 기준",
  "selectionGuide": "카드 선택 안내 한 문장",
  "positions": [{ "id": "고유 영문 ID", "title": "자리 이름", "focus": "이 자리가 살펴볼 관점" }],
  "answerContract": { "kind": "choose_one|recommend_one|yes_no|compare|forecast|advice|explain|analysis", "subject": "직접 답할 대상", "candidates": ["후보"], "decisive": true }
}
positions 길이는 cardCount와 같아야 한다.
interpretationFrame은 자리 이름을 다시 나열하지 말고, 이번 리딩에서 무엇을 판단할지 한 문장으로 쓴다.`;
  const provider = createReadingAiProvider(ai, groqApiKey, GROQ_PLAN_MODEL, 900, false);
  return runAiJson(provider, prompt, (value) => enforcePlanQuality(
    readingPlanSchema.parse(value),
    { question, language, conversation: context },
  ), 900, READING_PLAN_JSON_SCHEMA);
}

export async function createAiInterpretation(
  ai: WorkersAIBinding,
  question: string,
  cards: Parameters<typeof generateReadingResult>[1],
  previous?: ReadingResult,
  language: ReadingLanguage = "ko",
  answerContract?: AnswerContract,
  context?: ReadingContext,
  groqApiKey?: string,
): Promise<ReadingResult> {
  const contract = answerContract ?? createAnswerContract(question, context, language);
  const scopeQuestion = [
    question,
    contract.subject,
    context?.initialQuestion,
    ...(context?.previousQuestions ?? []),
  ].filter((value): value is string => Boolean(value)).join("\n");
  const currentDomain = detectEverydayDomain(question);
  const everydayDomain = resolveEverydayDomain(question, context);
  const guideQuestion = currentDomain || !everydayDomain ? question : scopeQuestion;
  const category = detectQuestionCategory(question);
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
      sourceMeaning: language === "ko"
        ? toKoreanHaeyo(`${card.nameKo} ${direction}의 핵심은 ${meaning.keywords.slice(0, 3).join("·")}이다. ${meaning.summary}`)
        : "",
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
    const applicationBoundaries: string[] = [];
    if (everydayDomain === "schedule") {
      applicationBoundaries.push(language === "ko"
        ? "카드 원뜻의 장기 목표·장기 회복·안정성은 카드 원뜻 설명에만 남긴다. 적용 문장에서는 오늘 할 일의 순서, 마감, 착수, 일정 정비로 범위를 줄인다. 급한 일보다 먼 미래의 목표를 우선하라고 결론내리지 않는다."
        : "Keep long-term goals, recovery, and stability only in the card's source meaning. In applied prose, narrow them to today's task order, deadlines, starting criteria, and schedule cleanup. Do not prioritize distant goals over today's urgent work.");
    }
    if (everydayDomain === "food" && isPhysicalFoodPosition(selected.positionTitle, selected.positionFocus)) {
      applicationBoundaries.push(language === "ko"
        ? "카드 원뜻은 먹기 전 메뉴 선택 과정에만 적용한다. 카드의 감정·기분 의미를 식사 후 만족감, 포만감, 영양, 소화의 실제 결과로 바꾸지 않는다. 타로 카드만으로 실제 포만감을 알 수 없다고 명시하고 현재 배고픔과 사용자가 이미 아는 식사량을 직접 확인하게 한다."
        : "Apply the card only to the pre-meal decision process. Do not turn emotions or symbolism into claims about post-meal satisfaction, physical fullness, nutrition, or digestion. State that tarot cannot determine physical outcomes and direct the user to information they can verify.");
    }
    return {
      selected: {
        positionId: selected.positionId,
        positionTitle: selected.positionTitle,
        positionFocus: selected.positionFocus,
        orientation: selected.reversed ? "reversed" : "upright",
        orientationLabel: orientationLabel(selected.reversed, language),
        ...(applicationBoundaries.length > 0
          ? { applicationBoundary: applicationBoundaries.join(" ") }
          : {}),
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
        ...(everydayDomain ? {} : { relevantContext: card.contexts[category] }),
      },
    };
  });
  const lengthGuide = language === "ko"
    ? (everydayDomain
      ? (cardsToInterpret.length === 1
        ? "전체 한국어 본문은 450~900자"
        : cardsToInterpret.length === 2
          ? "전체 한국어 본문은 650~1200자"
          : "전체 한국어 본문은 1100~2100자")
      : (previous ? "전체 한국어 본문은 700~1400자" : "전체 한국어 본문은 900~1900자"))
    : (previous ? "The complete English response should be about 350–700 words" : "The complete English response should be about 450–1000 words");
  const sourceSentences = cardsToInterpret.flatMap((selected) => {
    const card = getCard(selected.cardId);
    const meaning = card[selected.reversed ? "reversed" : "upright"];
    return [meaning.caution, meaning.summary];
  });
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
- verdict.kind는 answerContract.kind와 같아야 한다.
- verdict.value에는 질문에 대한 실제 답만 짧게 쓴다. 판단 기준, 질문 재진술, "적당한 것", "상황에 맞는 선택" 같은 범주 표현을 답으로 쓰지 않는다.
- verdict.statement는 verdict.value를 포함한 완결된 직접 답변 한 문장이다. answerContract.subject 또는 현재 질문의 핵심 대상을 문장 안에 직접 밝혀, 다른 질문에도 그대로 붙일 수 있거나 엉뚱한 답이 되지 않게 한다. summary는 이 문장으로 시작한 뒤 카드 근거와 한계를 설명한다.
- choose_one, recommend_one, yes_no에서는 candidates 중 정확히 하나를 verdict.value로 고른다. 둘 이상을 합치거나 후보 밖 답을 만들지 않는다.
- compare는 핵심 차이를, forecast는 가장 가능성이 큰 방향이나 시기를, advice는 먼저 할 행동을, explain은 중심 원인을, analysis는 가장 중요한 발견을 verdict.value에 직접 쓴다.
- explain의 statement는 "중심 원인은 …", forecast는 "예상 시기/가장 가능성이 큰 흐름은 …", advice는 "먼저 할 행동은 …", analysis는 "핵심은 …"처럼 답의 유형이 실제로 충족됐는지 첫 문장만 읽어도 알 수 있게 쓴다. 질문을 다시 말하거나 "살펴본다/확인한다"로 끝내지 않는다.
- decisive=true이면 "상황에 따라", "조건을 더 확인", "판단하기 어렵다", "둘 다"로 답을 미루지 않는다. 확인 사항과 예외는 verdict.statement 뒤에 쓴다.
- 추천이나 선택 자체는 허용되지만, 카드만으로 후보의 맛·영양·효과·가격·타인의 감정·미래 사실을 안다고 주장하지 않는다.
- 후보 비교형에서는 카드 의미를 "이 후보를 선택하는 판단에 지지/주의를 더하는 상징 신호"로만 연결한다. 후보 자체가 감정·성격·효과·결과를 가진 것처럼 쓰거나, 사용자가 말하지 않은 준비 상태·환경·경험을 예측하지 않는다.
- 후보 비교형 axes는 후보마다 하나씩 만들고 각 label을 해당 후보 이름으로 시작한다. 후보가 2개라서 최소 3개 축이 필요할 때는 선택·추천이면 "결론 선명도", compare이면 "비교 선명도" 축 하나만 추가한다. 질문에 없는 별도 평가 속성을 축으로 만들지 않는다.`;
  const prompt = `다음 질문과 카드로 종합 해석을 생성하라.
현재 질문: ${JSON.stringify(question)}
대화 맥락: ${JSON.stringify(context ?? null)}
출력 언어: ${language === "ko" ? "한국어" : "English"}. JSON 키는 스키마 그대로 유지하고 모든 사용자 표시 문자열 값은 이 언어로 작성한다.
질문 범위 지침: ${questionScopeGuide(guideQuestion, language)}
문장 구체성 지침: ${concreteWritingGuide(guideQuestion, language)}
${contractGuide}
선택 카드와 참고 데이터: ${JSON.stringify(selectedData)}
이전 결과의 연결 정보(문체를 모방하지 말 것): ${JSON.stringify(previousContext)}

선택 카드의 selected.applicationBoundary가 있으면 해당 경계를 카드별 해석, 종합, 확인 항목, 그래프 축 전체에 반드시 적용한다.

필수 JSON 필드:
- verdict: answerContract를 실행한 직접 답이다. kind, value, statement를 모두 쓴다.
- summary: verdict.statement를 철자 그대로 첫 문장에 놓고, 그 결론의 핵심 카드 근거와 한계를 이어서 총 2~3문장으로 쓴다. 카드 이름이나 키워드만 나열하지 않는다.
- cardInterpretations: 정확히 ${expectedCards.length}개이며 중복을 만들지 않는다. 다음 순서와 cardId, positionTitle, orientation 값을 그대로 사용한다: ${JSON.stringify(expectedCards.map(({ cardId, cardName, positionTitle, positionFocus, orientation, orientationLabel: direction, sourceKeywords, sourceMeaning, evidence }) => ({ cardId, cardName, positionTitle, positionFocus, orientation, orientationLabel: direction, sourceKeywords, sourceMeaning, evidence })))}.
  - text: 먼저 읽히는 결론이다. 질문에 적용할 판단을 25~90자로 직접 쓴다.
  - reasoning.sourceMeaning: 한국어에서는 위 카드 목록에 제공된 sourceMeaning 문자열을 그대로 쓴다. 서버에서도 이 값을 카드 데이터로 고정한다. 영어에서는 coreMeaning과 sourceKeywords를 정확히 번역해 45~140자로 설명한다. 아직 질문 분야의 메뉴·옷·일정에 적용하지 않는다.
  - reasoning.questionConnection: 왜 그 원뜻이 이 질문의 이 자리에 해당하는지 80~200자로 설명한다. positionTitle을 철자 그대로 쓰고 positionFocus와 연결되는 논리를 명시한다. 원뜻과 결론 사이를 건너뛰지 않는다.
  - reasoning.decisionImpact: 이 카드가 전체 판단을 지지하는지, 주의를 더하는지, 보류하게 하는지와 예외를 45~150자로 설명한다. 카드가 특정 메뉴나 선택을 무조건 금지한다고 단정하지 않는다.
  - evidence: AI가 새 주장을 만들지 말고 위 목록에 지정된 evidence 문자열을 그대로 사용한다.
- synthesis: 정확히 카드당 한 문장씩 ${expectedCards.length}문장으로 쓴다. 각 문장은 카드 이름으로 시작하고 그 카드가 결론을 뒷받침하는 이유를 질문의 말로 설명한다. 카드를 "식사를 한다/옷을 입는다" 같은 사람 행동의 주어로 쓰지 말고 "~을 우선하라는 근거가 된다/~에 무게를 둔다"처럼 쓴다. 카드 문장 뒤에 전체를 다시 요약하는 결론 문장을 추가하지 않는다.
- guidance: 사용자가 실제로 확인하거나 실행할 수 있는 짧은 항목 2~4개. 카드 데이터의 genericCautionTheme 문장을 복사하지 않는다.
- axes: 질문에 맞는 ${expectedCards.length === 1 ? "정확히 3개" : "3~5개"} 축. 각 항목은 label, score(0~100 정수), evidence(질문에 연결된 한 문장 문자열), evidenceCardIds
- signals: support, caution, uncertainty 정수이며 합계 100
- limitation: 확률이나 확정 예측이 아니라는 한계

JSON 자료형 예시:
{
  "verdict": { "kind": "answerContract.kind", "value": "직접 답", "statement": "직접 답 한 문장" },
  "summary": "문자열",
  "cardInterpretations": [{ "cardId": "문자열", "positionTitle": "문자열", "orientation": "upright", "text": "문자열", "reasoning": { "sourceMeaning": "문자열", "questionConnection": "문자열", "decisionImpact": "문자열" }, "evidence": ["문자열", "문자열"] }],
  "synthesis": "문자열",
  "guidance": ["문자열", "문자열"],
  "axes": [{ "label": "문자열", "score": 50, "evidence": "배열이 아닌 한 문장 문자열", "evidenceCardIds": ["카드 ID"] }],
  "signals": { "support": 50, "caution": 30, "uncertainty": 20 },
  "limitation": "문자열"
}

한국어의 text, questionConnection, decisionImpact를 합쳐 읽었을 때 질문에 나온 대상과 행동이 분명해야 한다. sourceMeaning은 카드 원뜻만 정확히 설명하고, questionConnection에서 원뜻→자리 역할→결론의 이유를 순서대로 연결한다. 추상명사를 세 개 이상 이어 붙이거나 "적절하다", "필요하다"로만 결론내리지 않는다.
positionFocus, positionTitle, sourceMeaning, questionConnection, decisionImpact, evidenceCardIds 같은 JSON 키 이름을 사용자에게 보이는 문장에 쓰지 않는다.
recommend_one에서는 candidates가 이미 질문에 맞게 생성된 구체적인 후보이므로 그중 하나를 실제 답으로 말한다. 직접 추천하는 행위와 확인되지 않은 사실을 만드는 행위를 혼동하지 않는다.
질문이나 대화 맥락에 없는 현실 정보는 카드 근거로 새로 만들지 않는다. 특히 신체 상태, 건강·영양, 가격, 날씨, 타인의 속마음, 합격·성공 같은 외부 사실은 사용자가 직접 확인할 정보와 타로 해석을 구분한다.
질문에 없는 속성을 이유로 특정 후보가 객관적으로 더 낫다고 주장하지 않는다. 카드의 의미는 후보를 비교하는 타로 신호나 사용자의 판단 방식으로 설명한다.
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
  return runAiJson(provider, prompt, (value) => {
    const parsed = readingResultSchema.parse(normalizeReadingShape(value, expectedCards, everydayDomain, language));
    const polished = polishReadingLanguage(parsed, question, language, everydayDomain);
    const finalized = readingResultSchema.parse(stabilizeAnswerContractReading(polished, contract, language));
    return enforceReadingQuality(
      finalized,
      { question, language, sourceSentences, expectedCards, answerContract: contract, conversation: context },
    );
  }, everydayDomain ? 3600 : 4000, READING_RESULT_JSON_SCHEMA, 2);
}

async function resolveAiOrLocal<T>(
  ai: WorkersAIBinding | undefined,
  label: "plan" | "interpretation",
  aiTask: (binding: WorkersAIBinding) => Promise<T>,
  localTask: () => T,
): Promise<{ data: T; mode: "ai" | "local" }> {
  if (!ai) return { data: localTask(), mode: "local" };
  try {
    return { data: await aiTask(ai), mode: "ai" };
  } catch (error) {
    if (!(error instanceof ApiError) || error.status < 500) throw error;
    console.warn("[tarot-ai] using validated local fallback", { label, code: error.code });
    try {
      return { data: localTask(), mode: "local" };
    } catch (fallbackError) {
      if (
        ["DAILY_AI_LIMIT", "BACKUP_AI_RATE_LIMIT", "BACKUP_AI_UNAVAILABLE", "INVALID_AI_RESPONSE"].includes(error.code)
        && fallbackError instanceof ApiError
        && /^AI_.*_UNAVAILABLE$/.test(fallbackError.code)
      ) {
        throw error;
      }
      throw fallbackError;
    }
  }
}

function canUseContractFallback(contract: AnswerContract): boolean {
  return ["choose_one", "recommend_one", "yes_no", "compare"].includes(contract.kind)
    && contract.candidates.length >= 2;
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

    if (input.action === "plan") {
      const response = await resolveAiOrLocal(
        runtimeEnv.AI,
        "plan",
        (ai) => createAiPlan(
          ai,
          input.question,
          input.followup,
          input.language,
          input.context,
          runtimeEnv.GROQ_API_KEY,
        ),
        () => {
          const plan = readingPlanSchema.parse(designReading(input.question, input.followup, input.language, input.context));
          if (!canUseContractFallback(plan.answerContract)) {
            throw new ApiError(503, "AI_PLANNING_UNAVAILABLE", "질문에 맞는 카드 구성을 만들 AI를 현재 사용할 수 없습니다. 잠시 후 다시 시도하세요.");
          }
          return plan;
        },
      );
      if (countAsFollowup) {
        await completeFollowup(request, runtimeEnv, input.context?.previousQuestions?.length ?? 0);
      }
      return Response.json(response, { headers: { "cache-control": "no-store" } });
    }

    const effectiveContract = input.answerContract
      ?? createAnswerContract(input.question, input.context, input.language);
    const response = await resolveAiOrLocal(
      runtimeEnv.AI,
      "interpretation",
      (ai) => createAiInterpretation(
        ai,
        input.question,
        input.cards,
        input.previous,
        input.language,
        effectiveContract,
        input.context,
        runtimeEnv.GROQ_API_KEY,
      ),
      () => {
        if (!canUseContractFallback(effectiveContract)) {
          throw new ApiError(503, "AI_INTERPRETATION_UNAVAILABLE", "질문을 충분히 해석할 AI를 현재 사용할 수 없습니다. 잠시 후 다시 시도하세요.");
        }
        return readingResultSchema.parse(generateReadingResult(input.question, input.cards, input.previous, input.language, effectiveContract));
      },
    );
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

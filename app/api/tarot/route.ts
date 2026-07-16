import {
  designReading,
  detectQuestionCategory,
  generateReadingResult,
  getCard,
  orientationLabel,
  CARD_BY_ID,
  type ReadingPlan,
  type ReadingLanguage,
  type ReadingResult,
} from "@/src/lib/tarot";
import {
  concreteWritingGuide,
  detectEverydayDomain,
  enforcePlanQuality,
  enforceReadingQuality,
  polishReadingLanguage,
  questionScopeGuide,
  type ExpectedInterpretation,
} from "@/src/lib/reading-quality";
import {
  readingPlanSchema,
  readingResultSchema,
  tarotApiRequestSchema,
} from "@/src/lib/schemas";
import {
  ApiError,
  apiErrorResponse,
  consumeAiCall,
  readSafeJson,
  type RuntimeEnv,
  type WorkersAIBinding,
} from "@/src/server/security";

const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `당신은 타로밀크티 웹의 해석 엔진이다.
- 요청에서 지정한 출력 언어로 중립적이고 분석적인 문장을 쓴다.
- 인사, 위로, 신비주의적 수사, 감탄, 사람처럼 느끼는 표현을 쓰지 않는다.
- 카드, 방향, 자리 역할과 질문의 관계를 근거로 설명한다.
- 질문의 크기에 맞춰 해석 범위를 제한한다. 식사나 오늘의 선택 같은 일상 질문을 인생, 재정, 조직, 타인 관계 문제로 확대하지 않는다.
- 한국어로 쓸 때는 주어와 행동이 드러나는 짧고 자연스러운 문장을 사용한다. 카드 키워드와 자리 이름을 추상명사로 나열하지 않는다.
- 한국어 출력은 "-한다/-이다" 문체로 통일한다. "-합니다/-하십시오/-하세요" 높임말을 섞지 않는다.
- "서로 다른 측면", "요소가 상호작용한다", "균형 잡힌 고려", "분리를 통해 접근" 같은 내용 없는 문장을 쓰지 않는다.
- 요약, 종합 해석, 확인할 점에서 같은 내용을 반복하지 않는다.
- 카드별 sourceMeaning에서는 제공된 원뜻을 정확히 설명하고, 그 밖의 영역에서는 카드 데이터 문장을 그대로 복사하지 말고 질문에 맞는 실제 판단 기준이나 행동으로 바꿔 쓴다.
- 카드 상징을 현실의 인과관계나 영양·건강상의 사실처럼 만들지 않는다.
- 미래 사건, 합격, 성공, 상대의 감정을 확률이나 사실로 단정하지 않는다.
- 수치는 통계 확률이 아닌 AI 해석 지표다.
- 의료·법률·금융 전문 판단을 대신하지 않는다.
- 제공된 카드 의미 데이터의 범위를 벗어난 의미를 확정적으로 추가하지 않는다.
- 카드 상징은 사용자의 판단 방식과 주의점을 해석할 뿐, 음식의 포만감·영양, 날씨, 건강처럼 측정 가능한 현실 속성을 예측하지 못한다. 이런 자리에서는 속성을 단정하지 말고 사용자가 확인할 현실 정보와 판단상의 주의점을 구분한다.
- 질문에 없는 메뉴, 음식 특성, 감각, 영양 성분, 상황을 예시로도 만들어내지 않는다.
- 반드시 JSON 객체만 출력한다.`;

function extractResponseText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.response === "string") return record.response;
    if (record.response && typeof record.response === "object") return JSON.stringify(record.response);
    if (typeof record.result === "string") return record.result;
    if (record.result && typeof record.result === "object") return JSON.stringify(record.result);
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

function normalizeReadingShape(value: unknown, expectedCards: ExpectedInterpretation[]): unknown {
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
  const orderedInterpretations = Array.isArray(normalizedInterpretations)
    ? expectedCards.map((expected) => normalizedInterpretations.find((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const interpretation = item as Record<string, unknown>;
      return interpretation.cardId === expected.cardId
        && interpretation.positionTitle === expected.positionTitle
        && interpretation.orientation === expected.orientation;
    }))
    : [];
  const orderedOrOriginal = orderedInterpretations.length === expectedCards.length
    && orderedInterpretations.every(Boolean)
    ? orderedInterpretations
    : normalizedInterpretations;
  const cardInterpretations = Array.isArray(orderedOrOriginal)
    ? orderedOrOriginal.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const interpretation = item as Record<string, unknown>;
      const expected = expectedCards.find((candidate) => candidate.cardId === interpretation.cardId
        && candidate.positionTitle === interpretation.positionTitle
        && candidate.orientation === interpretation.orientation);
      if (!expected) return interpretation;
      const reasoning = interpretation.reasoning;
      return {
        ...interpretation,
        reasoning: reasoning && typeof reasoning === "object" && !Array.isArray(reasoning)
          ? {
            ...(reasoning as Record<string, unknown>),
            ...(expected.sourceMeaning ? { sourceMeaning: expected.sourceMeaning } : {}),
          }
          : reasoning,
        evidence: expected.evidence,
      };
    })
    : orderedOrOriginal;

  return {
    ...record,
    cardInterpretations,
    axes: Array.isArray(record.axes)
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
      : record.axes,
  };
}

function classifyAiFailure(error: unknown): string {
  if (error instanceof SyntaxError) return "INVALID_JSON";
  if (error && typeof error === "object" && "issues" in error) return "SCHEMA_VALIDATION_FAILED";

  const message = error instanceof Error ? error.message : "";
  if (/quota|neuron|daily limit|usage limit/i.test(message)) return "PROVIDER_LIMIT";
  if (/비어|empty response/i.test(message)) return "EMPTY_RESPONSE";
  if (/network|fetch|timeout|connection/i.test(message)) return "PROVIDER_REQUEST_FAILED";
  return "QUALITY_VALIDATION_FAILED";
}

async function runAiJson<T>(
  ai: WorkersAIBinding,
  prompt: string,
  validate: (value: unknown) => T,
  maxTokens: number,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await ai.run(MODEL, {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: attempt === 0
              ? prompt
              : `${prompt}\n이전 응답 문제: ${lastError instanceof Error ? lastError.message.replace(/\s+/g, " ").slice(0, 900) : "출력 품질 또는 JSON 형식이 기준에 맞지 않았다."}\n지적된 문제를 모두 고쳐 필수 필드를 포함한 JSON만 다시 출력하라.`,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.25,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false },
      });
      const responseText = extractResponseText(result);
      return validate(parseJsonText(responseText));
    } catch (error) {
      lastError = error;
      console.warn("[tarot-ai] response rejected", {
        attempt: attempt + 1,
        category: classifyAiFailure(error),
      });
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  if (/quota|neuron|daily limit|usage limit/i.test(message)) {
    throw new ApiError(503, "DAILY_AI_LIMIT", "오늘 AI 사용 한도를 모두 사용했습니다. 한국 시간 오전 9시 이후 다시 시도하세요.");
  }
  throw new ApiError(502, "INVALID_AI_RESPONSE", "AI 응답 형식을 확인하지 못했습니다. 현재 상태를 유지하고 다시 시도하세요.");
}

async function createAiPlan(ai: WorkersAIBinding, question: string, followup: boolean, language: ReadingLanguage): Promise<ReadingPlan> {
  const localPlan = designReading(question, followup, language);
  const prompt = `다음 질문을 위한 ${followup ? "추가" : "최초"} 타로 리딩 구조를 설계하라.
질문: ${JSON.stringify(question)}
출력 언어: ${language === "ko" ? "한국어" : "English"}. JSON 키는 스키마 그대로 유지하고 모든 사용자 표시 문자열 값은 이 언어로 작성한다.
질문 범위 지침: ${questionScopeGuide(question, language)}
문장 구체성 지침: ${concreteWritingGuide(question, language)}
카드 수는 질문의 범위에 따라 1~5장이다. 기본 권장 수는 ${localPlan.cardCount}장이지만 질문을 읽고 조정할 수 있다.
자리 역할은 질문에 실제로 답하는 구체적인 비교 기준으로 작성한다. "방향성", "외부 조건", "실행 가능성", "현재 상황"처럼 어느 질문에나 붙일 수 있는 제목은 피한다.
짧은 일상 질문에서는 배고픔, 일정, 준비 부담처럼 바로 확인 가능한 말로 쓴다.
응답 JSON 스키마:
{
  "cardCount": 1~5 정수,
  "interpretationFrame": "이번 리딩이 분석할 기준",
  "selectionGuide": "카드 선택 안내 한 문장",
  "positions": [{ "id": "고유 영문 ID", "title": "자리 이름", "focus": "이 자리가 살펴볼 관점" }]
}
positions 길이는 cardCount와 같아야 한다.
interpretationFrame은 자리 이름을 다시 나열하지 말고, 이번 리딩에서 무엇을 판단할지 한 문장으로 쓴다.`;
  return runAiJson(ai, prompt, (value) => enforcePlanQuality(
    readingPlanSchema.parse(value),
    { question, language },
  ), 900);
}

async function createAiInterpretation(
  ai: WorkersAIBinding,
  question: string,
  cards: Parameters<typeof generateReadingResult>[1],
  previous?: ReadingResult,
  language: ReadingLanguage = "ko",
): Promise<ReadingResult> {
  const everydayDomain = detectEverydayDomain(question);
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
        ? `${card.nameKo} ${direction}의 핵심은 ${meaning.keywords.slice(0, 3).join("·")}이다. ${meaning.summary}`
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
    return {
      selected: {
        positionId: selected.positionId,
        positionTitle: selected.positionTitle,
        positionFocus: selected.positionFocus,
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
        ...(everydayDomain ? {} : { relevantContext: card.contexts[category] }),
      },
    };
  });
  const lengthGuide = language === "ko"
    ? (everydayDomain
      ? (cardsToInterpret.length <= 2 ? "전체 한국어 본문은 750~1400자" : "전체 한국어 본문은 1100~2100자")
      : (previous ? "전체 한국어 본문은 700~1400자" : "전체 한국어 본문은 900~1900자"))
    : (previous ? "The complete English response should be about 350–700 words" : "The complete English response should be about 450–1000 words");
  const sourceSentences = cardsToInterpret.flatMap((selected) => {
    const card = getCard(selected.cardId);
    const meaning = card[selected.reversed ? "reversed" : "upright"];
    return [meaning.caution, meaning.summary];
  });
  const previousContext = previous ? {
    priorConclusion: previous.summary,
    priorAxes: previous.axes.map(({ label, score }) => ({ label, score })),
    priorSignals: previous.signals,
  } : null;
  const prompt = `다음 질문과 카드로 종합 해석을 생성하라.
질문: ${JSON.stringify(question)}
출력 언어: ${language === "ko" ? "한국어" : "English"}. JSON 키는 스키마 그대로 유지하고 모든 사용자 표시 문자열 값은 이 언어로 작성한다.
질문 범위 지침: ${questionScopeGuide(question, language)}
문장 구체성 지침: ${concreteWritingGuide(question, language)}
선택 카드와 참고 데이터: ${JSON.stringify(selectedData)}
이전 결과의 연결 정보(문체를 모방하지 말 것): ${JSON.stringify(previousContext)}

필수 JSON 필드:
- summary: 질문에 대한 직접적인 결론과 우선할 선택 기준을 2~3문장으로 쓴다. 카드 이름이나 키워드를 나열하지 않는다.
- cardInterpretations: 정확히 ${expectedCards.length}개이며 중복을 만들지 않는다. 다음 순서와 cardId, positionTitle, orientation 값을 그대로 사용한다: ${JSON.stringify(expectedCards.map(({ cardId, cardName, positionTitle, positionFocus, orientation, orientationLabel: direction, sourceKeywords, sourceMeaning, evidence }) => ({ cardId, cardName, positionTitle, positionFocus, orientation, orientationLabel: direction, sourceKeywords, sourceMeaning, evidence })))}.
  - text: 먼저 읽히는 결론이다. 질문에 적용할 판단을 25~90자로 직접 쓴다.
  - reasoning.sourceMeaning: 한국어에서는 위 카드 목록에 제공된 sourceMeaning 문자열을 그대로 쓴다. 서버에서도 이 값을 카드 데이터로 고정한다. 영어에서는 coreMeaning과 sourceKeywords를 정확히 번역해 45~140자로 설명한다. 아직 질문 분야의 메뉴·옷·일정에 적용하지 않는다.
  - reasoning.questionConnection: 왜 그 원뜻이 이 질문의 이 자리에 해당하는지 80~200자로 설명한다. positionTitle을 철자 그대로 쓰고 positionFocus와 연결되는 논리를 명시한다. 원뜻과 결론 사이를 건너뛰지 않는다.
  - reasoning.decisionImpact: 이 카드가 전체 판단을 지지하는지, 주의를 더하는지, 보류하게 하는지와 예외를 45~150자로 설명한다. 카드가 특정 메뉴나 선택을 무조건 금지한다고 단정하지 않는다.
  - evidence: AI가 새 주장을 만들지 말고 위 목록에 지정된 evidence 문자열을 그대로 사용한다.
- synthesis: 정확히 카드당 한 문장씩 ${expectedCards.length}문장으로 쓴다. 각 문장은 카드 이름으로 시작하고 그 카드가 결론을 뒷받침하는 이유를 질문의 말로 설명한다. 카드를 "식사를 한다/옷을 입는다" 같은 사람 행동의 주어로 쓰지 말고 "~을 우선하라는 근거가 된다/~에 무게를 둔다"처럼 쓴다. 카드 문장 뒤에 전체를 다시 요약하는 결론 문장을 추가하지 않는다.
- guidance: 사용자가 실제로 확인하거나 실행할 수 있는 짧은 항목 2~4개. 카드 데이터의 genericCautionTheme 문장을 복사하지 않는다.
- axes: 질문에 맞는 3~5개 축. 각 항목은 label, score(0~100 정수), evidence(질문에 연결된 한 문장 문자열), evidenceCardIds
- signals: support, caution, uncertainty 정수이며 합계 100
- limitation: 확률이나 확정 예측이 아니라는 한계

JSON 자료형 예시:
{
  "summary": "문자열",
  "cardInterpretations": [{ "cardId": "문자열", "positionTitle": "문자열", "orientation": "upright", "text": "문자열", "reasoning": { "sourceMeaning": "문자열", "questionConnection": "문자열", "decisionImpact": "문자열" }, "evidence": ["문자열", "문자열"] }],
  "synthesis": "문자열",
  "guidance": ["문자열", "문자열"],
  "axes": [{ "label": "문자열", "score": 50, "evidence": "배열이 아닌 한 문장 문자열", "evidenceCardIds": ["카드 ID"] }],
  "signals": { "support": 50, "caution": 30, "uncertainty": 20 },
  "limitation": "문자열"
}

한국어의 text, questionConnection, decisionImpact에는 질문에 나온 대상과 행동을 명시한다. sourceMeaning은 카드 원뜻만 정확히 설명하고, questionConnection에서 원뜻→자리 역할→결론의 이유를 순서대로 연결한다. 추상명사를 세 개 이상 이어 붙이거나 "적절하다", "필요하다"로만 결론내리지 않는다.
positionFocus, positionTitle, sourceMeaning, questionConnection, decisionImpact, evidenceCardIds 같은 JSON 키 이름을 사용자에게 보이는 문장에 쓰지 않는다.
질문에 구체적인 선택지가 없으면 임의의 메뉴나 사실을 만들어내지 말고 선택 기준과 다음 행동을 제시한다.
식사 질문에서는 알레르기, 질환, 식단 제한, 메뉴, 맛의 특성, 영양 사실, 평소 습관을 추정하지 않는다. 질문과 자리 초점에 없는 "자극적인 메뉴", "화려한 음식", "든든한 재료", "미리 정한 식단", "활동량", "과식" 같은 표현도 만들지 않는다. 포만감과 기분상의 만족감은 같은 뜻이 아니다. 조리 부담이 적거나 메뉴가 익숙하다는 이유만으로 포만감이 높아진다고 주장하지 않는다. 심리·감정에 관한 카드 원뜻은 사용자의 식욕 판단이나 메뉴 선택 과정에만 연결하고, 음식의 물리적 결과로 바꾸지 않는다. 예를 들어 기분 변화는 먹고 싶은 마음이 흔들릴 수 있다는 주의이지, 실제로 금방 허기지거나 포만감이 낮거나 식사 후 만족감이 예상과 달라진다는 예측이 아니다. 메뉴 자체를 "식욕이나 마음이 변한다"의 주어로 쓰지 않는다.
positionTitle 또는 positionFocus가 포만감·영양·소화·에너지처럼 신체적으로 확인해야 하는 속성이면 questionConnection이나 decisionImpact에 "카드는 실제 포만감을 예측할 수 없다"와 같은 한계를 명시한다. 그 뒤 현재 배고픔, 사용자가 이미 아는 식사량, 오전 일정처럼 직접 확인할 정보와 연결한다.
특히 심리 카드가 이런 신체 속성 자리에 있으면, 그 속성의 결과를 예측하지 말고 "먹고 싶은 마음"과 "실제 배고픔·사용자가 아는 식사량"처럼 혼동하기 쉬운 판단 기준을 구분하는 역할만 설명한다. 구체적인 선택지가 없는 질문에는 특정 음식을 고른 척하지 말고, 무엇을 확인하면 고를 수 있는지 직접 답한다.
guidance와 axes도 같은 규칙을 따른다. 카드 상징에서 과식·영양·에너지 필요량 같은 신체 결과를 새로 만들지 말고, 사용자가 직접 확인할 정보가 무엇인지 쓴다.
추가 질문이면 이전 해석을 반복하지 말고 변화한 판단과 새 카드의 영향에 집중한다.
추가 질문의 axes는 비교가 가능하도록 이전 결과와 같은 label을 사용한다.
${lengthGuide}를 목표로 하되 카드별 근거, 종합, 행동 기준을 빠뜨리지 않는다.`;
  return runAiJson(ai, prompt, (value) => {
    const parsed = readingResultSchema.parse(normalizeReadingShape(value, expectedCards));
    return enforceReadingQuality(
      polishReadingLanguage(parsed, question, language),
      { question, language, sourceSentences, expectedCards },
    );
  }, everydayDomain ? 3600 : 4000, 3);
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
      const data = runtimeEnv.AI
        ? await createAiPlan(runtimeEnv.AI, input.question, input.followup, input.language)
        : designReading(input.question, input.followup, input.language);
      return Response.json({ data, mode: runtimeEnv.AI ? "ai" : "local" }, { headers: { "cache-control": "no-store" } });
    }

    const data = runtimeEnv.AI
      ? await createAiInterpretation(runtimeEnv.AI, input.question, input.cards, input.previous, input.language)
      : generateReadingResult(input.question, input.cards, input.previous, input.language);
    return Response.json({ data, mode: runtimeEnv.AI ? "ai" : "local" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

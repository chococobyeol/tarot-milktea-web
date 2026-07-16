import type {
  Orientation,
  ReadingLanguage,
  ReadingPlan,
  ReadingResult,
} from "@/src/lib/tarot";

type EverydayDomain = "food" | "outfit" | "schedule";

export interface ExpectedInterpretation {
  cardId: string;
  cardName: string;
  positionTitle: string;
  positionFocus: string;
  orientation: Orientation;
  orientationLabel: string;
  sourceMeaning: string;
  sourceKeywords: string[];
  evidence: string[];
}

const DOMAIN_PATTERNS: Record<EverydayDomain, RegExp> = {
  food: /아침|점심|저녁|식사|메뉴|음식|먹|간식|끼니|배달|요리|장보기|breakfast|lunch|dinner|meal|menu|food|snack|cook|delivery/i,
  outfit: /옷|코디|입을|입고|신발|겉옷|복장|outfit|clothes|wear|shoes|jacket/i,
  schedule: /오늘\s*(?:뭐|무엇|할\s*일)|주말\s*일정|할\s*일|일정|약속|today(?:'s)?\s*(?:task|plan)|weekend\s*(?:plan|schedule)|to-?do/i,
};

const KOREAN_DOMAIN_ANCHORS: Record<EverydayDomain, RegExp> = {
  food: /아침|점심|저녁|오전|식사|메뉴|음식|먹|간식|끼니|배달|요리|조리|재료|포만|영양|에너지|식욕|설거지|배고픔|허기|식사량/,
  outfit: /옷|코디|입|신발|겉옷|복장|소재|기온|날씨|외출/,
  schedule: /오늘|주말|할 일|일정|약속|마감|순서|시간|휴식|외출/,
};

const KOREAN_AXIS_ANCHORS: Record<EverydayDomain, string[]> = {
  food: ["준비", "포만", "영양", "조리", "가격", "비용", "에너지", "피로", "시간", "소화", "간편", "선택", "허기", "식사량", "만족", "입맛"],
  outfit: ["기온", "날씨", "활동", "이동", "편안", "보온", "통풍", "외출", "격식", "세탁"],
  schedule: ["시간", "마감", "순서", "집중", "피로", "휴식", "이동", "약속", "소요", "우선"],
};

const EVERYDAY_FORBIDDEN_WORDS = /방향성|안정성|지속 가능성|자원|성과|책임|장기적|외부 조건|실행 가능성|요소|종합적으로/g;

const KOREAN_VAGUE_PATTERNS: RegExp[] = [
  /균형 잡힌 (?:고려|접근|검토)/,
  /서로 다른 측면/,
  /각각 다른 측면/,
  /(?:요소|측면)(?:가|이) 상호작용/,
  /(?:세|여러|각각)(?: 가지)? (?:요소|기준|측면|관점).{0,35}(?:결합|종합|상호작용|작용)/,
  /(?:종합적|복합적)으로 (?:고려|판단|검토|접근)/,
  /(?:여러|다양한) (?:측면|관점)에서/,
  /단순한 결과(?:보다|보다는)/,
  /분리를 통해 접근/,
  /(?:접근|고려|검토)하는 것이 (?:적절|필요)/,
  /방향성.{0,45}안정성.{0,45}지속성/,
  /추진력.{0,45}안정성.{0,45}지속/,
  /각 카드의 의미.{0,45}(?:역할|기준)/,
  /선택 기준을 구체화.{0,45}역할/,
];

const GENERIC_PLAN_TITLE = /^(?:방향성|외부 조건|실행 가능성|현재 상황|현재 상태|핵심 기준|선택 기준|조정 방향)$/;

const SCOPE_EXPANSIONS: Array<{ output: RegExp; allowedByQuestion: RegExp }> = [
  { output: /장기(?:적|적인|적으로)?/, allowedByQuestion: /장기|오래|지속/ },
  { output: /재정|자산|수익|성과|경제적|자원|책임/, allowedByQuestion: /재정|돈|가격|비용|예산|수익|자산|경제|성과|자원|책임/ },
  { output: /조직|운영 구조|책임 범위/, allowedByQuestion: /조직|회사|직장|사업|운영|책임/ },
  { output: /타인의 신호|인간관계|상대방|주변의 도움/, allowedByQuestion: /타인|상대|관계|도움|함께|주변/ },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function appliedProseSections(result: ReadingResult): string[] {
  return [
    result.summary,
    result.synthesis,
    ...result.guidance,
    ...result.cardInterpretations.flatMap((item) => [
      item.text,
      item.reasoning?.questionConnection ?? "",
      item.reasoning?.decisionImpact ?? "",
    ]),
    ...result.axes.flatMap((axis) => [axis.label, axis.evidence]),
    result.limitation,
  ].filter(Boolean);
}

const KOREAN_POLITE_ENDING = /합니다|하십시오|하세요|됩니다|있습니다|없습니다|입니다/;
const INTERNAL_SCHEMA_TERM = /positionFocus|positionTitle|sourceMeaning|questionConnection|decisionImpact|cardInterpretations|evidenceCardIds/;

const UNSUPPORTED_FOOD_CAUSALITY: RegExp[] = [
  /조리(?:가| 과정| 시간| 부담).{0,35}(?:포만감|든든함).{0,25}(?:높|늘|증가|보장|확보)/,
  /(?:조리|준비) 부담이 (?:적|낮|작).{0,30}(?:포만감|든든함)/,
  /(?:간단|익숙)한 (?:음식|메뉴|식사).{0,30}(?:포만감|든든함).{0,20}(?:높|늘|보장|확보)/,
  /(?:금방|곧) (?:허기|배가 고)/,
  /실제 배를 채워.{0,25}(?:못|않|어렵)/,
  /포만감(?:은|이|을)?.{0,25}(?:낮|높|부족|지속되지|이어지기 어렵)/,
  /식사(?: 직후| 후).{0,25}(?:만족감|포만감).{0,35}(?:유지되지|떨어|낮|사라)/,
  /식사(?: 직후| 후).{0,25}만족감.{0,30}(?:예상과 다|다를 수)/,
  /기분.{0,25}(?:과식|불충분한 식사)/,
];

const FOOD_SPECIFIC_ASSUMPTIONS: Array<{ output: RegExp; allowedByQuestion: RegExp }> = [
  { output: /자극적(?:인|이다|으로)?/, allowedByQuestion: /자극/ },
  { output: /화려한|화려하다/, allowedByQuestion: /화려/ },
  { output: /든든한 재료/, allowedByQuestion: /든든|재료/ },
  { output: /단백질|탄수화물|지방|식이섬유|칼로리/, allowedByQuestion: /단백질|탄수화물|지방|식이섬유|칼로리/ },
  { output: /미리 정한 식단|평소 식단|식단을 따른다/, allowedByQuestion: /식단/ },
  { output: /활동량/, allowedByQuestion: /활동|운동/ },
  { output: /과식|불충분한 식사/, allowedByQuestion: /과식|폭식|소식|식사량|양이 (?:적|많)/ },
  { output: /강하게 당기는/, allowedByQuestion: /강하게|너무 먹고 싶|당기/ },
];

const PHYSICAL_FOOD_POSITION = /포만|영양|소화|에너지|식욕|건강/;
const PHYSICAL_LIMIT_STATEMENT = /(?:카드|타로|상징).{0,45}(?:포만감|영양|소화|에너지|식욕|신체).{0,45}(?:예측|판단|측정|보장).{0,20}(?:않|아니|못|할 수 없)/;

export function detectEverydayDomain(question: string): EverydayDomain | null {
  for (const [domain, pattern] of Object.entries(DOMAIN_PATTERNS) as Array<[EverydayDomain, RegExp]>) {
    if (pattern.test(question)) return domain;
  }
  return null;
}

export function questionScopeGuide(question: string, language: ReadingLanguage): string {
  const domain = detectEverydayDomain(question);
  if (!domain) {
    return language === "ko"
      ? "질문에 적힌 범위 안에서만 해석하고, 언급되지 않은 상황이나 선택지를 만들어내지 않는다."
      : "Stay within the scope of the question and do not invent unmentioned circumstances or options.";
  }

  if (language !== "ko") {
    return "This is a small everyday choice. Use only concrete criteria and actions that apply today; do not expand it into unrelated long-term issues.";
  }

  return ({
    food: "식사에 관한 작은 일상 질문이다. 메뉴, 재료, 준비 시간, 조리 부담, 포만감처럼 오늘 식사에 바로 적용할 말만 사용한다. 인생·재정·조직·인간관계 이야기로 확대하지 않는다.",
    outfit: "옷차림에 관한 작은 일상 질문이다. 날씨, 외출 목적, 활동량, 편안함처럼 오늘 옷을 고르는 데 바로 적용할 말만 사용한다.",
    schedule: "일정에 관한 작은 일상 질문이다. 시간, 순서, 마감, 이동, 휴식처럼 오늘 실행에 바로 적용할 말만 사용한다.",
  })[domain];
}

export function concreteWritingGuide(question: string, language: ReadingLanguage): string {
  if (language !== "ko") return "Use concrete nouns and actions from the question in every interpretation section.";
  const domain = detectEverydayDomain(question);
  if (domain === "food") {
    return `sourceMeaning에는 카드 원뜻을 보존한다. 그 밖의 결론과 적용 문장에서는 카드의 추상어를 식사 용어로 번역한다. 적용 문장에는 "방향성, 안정성, 지속 가능한, 자원, 성과, 책임, 장기적, 외부 조건, 실행 가능성, 요소, 종합적으로"를 쓰지 않는다. 대신 메뉴 결정, 재료, 준비 시간, 조리 부담, 포만감처럼 쓴다. 각 적용 문장에는 식사 관련 명사와 고른다·확인한다·피한다 같은 실제 행동을 함께 쓴다.`;
  }
  if (domain === "outfit") {
    return "카드의 추상어를 옷차림 용어로 번역한다. 각 문장에는 옷·신발·기온·외출 목적 중 하나와 고른다·입는다·챙긴다 같은 실제 행동을 함께 쓴다.";
  }
  if (domain === "schedule") {
    return "카드의 추상어를 일정 용어로 번역한다. 각 문장에는 시간·순서·마감·이동·휴식 중 하나와 시작한다·미룬다·확인한다 같은 실제 행동을 함께 쓴다.";
  }
  return "질문의 명사를 되풀이하기만 하지 말고, 카드가 어떤 판단 기준이나 행동으로 이어지는지 구체적으로 쓴다.";
}

export function enforcePlanQuality(
  plan: ReadingPlan,
  context: { question: string; language: ReadingLanguage },
): ReadingPlan {
  if (context.language !== "ko") return plan;

  if (plan.positions.some((position) => GENERIC_PLAN_TITLE.test(position.title.trim()))) {
    throw new Error("자리 이름이 질문과 무관한 일반 명사로만 작성되었다.");
  }

  const domain = detectEverydayDomain(context.question);
  if (domain) {
    const anchor = KOREAN_DOMAIN_ANCHORS[domain];
    if (!anchor.test(plan.interpretationFrame)) {
      throw new Error("리딩 구성이 일상 질문의 대상을 직접 언급하지 않는다.");
    }
    if (plan.positions.some((position) => !anchor.test(`${position.title} ${position.focus}`))) {
      throw new Error("각 카드 자리가 일상 질문에 맞는 구체적인 기준으로 작성되지 않았다.");
    }
  }

  return plan;
}

export function polishReadingLanguage(
  result: ReadingResult,
  question: string,
  language: ReadingLanguage,
): ReadingResult {
  if (language !== "ko") return result;
  const food = detectEverydayDomain(question) === "food";
  const polish = (value: string): string => {
    const base = value
    .replace(/positionFocus(?:인|은|는|:)?\s*/g, "")
    .replaceAll("positionTitle", "자리 이름")
    .replaceAll("sourceMeaning", "카드 원뜻")
    .replaceAll("questionConnection", "질문 연결")
    .replaceAll("decisionImpact", "판단 영향")
    .replaceAll("evidenceCardIds", "근거 카드");
    if (!food) return base;
    return base
    .replaceAll("오전 동안 지속 가능한 포만감", "오전까지 오래가는 포만감")
    .replaceAll("지속 가능한 포만감", "오래가는 포만감")
    .replaceAll("오전 동안 지속 가능한 에너지", "오전 일정에 필요한 에너지")
    .replaceAll("지속 가능한 에너지", "오래 유지되는 에너지");
  };

  return {
    ...result,
    summary: polish(result.summary),
    synthesis: polish(result.synthesis),
    guidance: result.guidance.map(polish),
    cardInterpretations: result.cardInterpretations.map((item) => ({
      ...item,
      text: polish(item.text),
      reasoning: item.reasoning ? {
        sourceMeaning: polish(item.reasoning.sourceMeaning),
        questionConnection: polish(item.reasoning.questionConnection),
        decisionImpact: polish(item.reasoning.decisionImpact),
      } : undefined,
      evidence: item.evidence.map(polish),
    })),
    axes: result.axes.map((axis) => ({
      ...axis,
      label: polish(axis.label),
      evidence: polish(axis.evidence),
    })),
    limitation: polish(result.limitation),
  };
}

export function enforceReadingQuality(
  result: ReadingResult,
  context: {
    question: string;
    language: ReadingLanguage;
    sourceSentences: string[];
    expectedCards?: ExpectedInterpretation[];
  },
): ReadingResult {
  const issues: string[] = [];
  const expectedCards = context.expectedCards;
  if (expectedCards) {
    if (result.cardInterpretations.length !== expectedCards.length) {
      issues.push(`cardInterpretations는 중복 없이 정확히 ${expectedCards.length}개여야 한다.`);
    }
    expectedCards.forEach((expected, index) => {
      const actual = result.cardInterpretations[index];
      if (
        !actual
        || actual.cardId !== expected.cardId
        || actual.positionTitle !== expected.positionTitle
        || actual.orientation !== expected.orientation
      ) {
        issues.push(`cardInterpretations[${index}]의 카드 ID, 자리 이름, 방향을 요청에 적힌 값 그대로 작성해야 한다.`);
      }

      if (!actual?.reasoning) {
        issues.push(`${expected.cardName} 해석에 카드 원뜻, 질문 연결 이유, 판단 영향을 모두 작성해야 한다.`);
        return;
      }

      if (actual.text.trim().length < 18) {
        issues.push(`${expected.cardName}의 한 줄 결론을 판단 기준이 드러나도록 더 구체적으로 작성해야 한다.`);
      }

      const { sourceMeaning, questionConnection, decisionImpact } = actual.reasoning;
      if (sourceMeaning.trim().length < 25) {
        issues.push(`${expected.cardName}의 ${expected.orientationLabel} 원뜻을 한 문장 이상 설명해야 한다.`);
      }
      if (questionConnection.trim().length < 45) {
        issues.push(`${expected.cardName}의 원뜻이 질문과 연결되는 이유를 두 문장 정도로 설명해야 한다.`);
      }
      if (decisionImpact.trim().length < 30) {
        issues.push(`${expected.cardName}이 실제 판단에 미치는 영향과 한계를 설명해야 한다.`);
      }
    });
  }

  if (context.language !== "ko") {
    if (issues.length > 0) throw new Error(issues.join(" "));
    return result;
  }

  const sections = appliedProseSections(result);
  const visibleText = sections.join("\n");
  const vagueMatch = KOREAN_VAGUE_PATTERNS
    .map((pattern) => visibleText.match(pattern)?.[0])
    .find(Boolean);
  if (vagueMatch) {
    issues.push(`추상 표현 "${vagueMatch}"을 삭제하고 질문에 맞는 실제 기준으로 바꿔야 한다.`);
  }
  if (KOREAN_POLITE_ENDING.test(visibleText)) {
    issues.push("한국어 해석은 높임말을 섞지 말고 '-한다/-이다' 문체로 통일해야 한다.");
  }
  const leakedSchemaTerm = visibleText.match(INTERNAL_SCHEMA_TERM)?.[0];
  if (leakedSchemaTerm) {
    issues.push(`내부 JSON 키 "${leakedSchemaTerm}"를 사용자에게 보이는 문장에 쓰지 말아야 한다.`);
  }

  const normalizedSections = sections.map(normalize);
  const normalizedSources = context.sourceSentences.map(normalize).filter(Boolean);
  const copiedCaution = normalizedSections.some((section) => normalizedSources.some((source) => section.includes(source)));
  if (copiedCaution) {
    issues.push("카드 데이터의 일반 주의문을 질문 맥락에 맞게 바꾸지 않고 복사했다.");
  }

  const domain = detectEverydayDomain(context.question);
  if (domain) {
    const forbiddenWords = [...new Set(visibleText.match(EVERYDAY_FORBIDDEN_WORDS) ?? [])];
    if (forbiddenWords.length > 0) {
      issues.push(`일상 질문에서는 추상어 ${forbiddenWords.map((word) => `"${word}"`).join(", ")}를 쓰지 말고 질문 분야의 말로 바꿔야 한다.`);
    }
    for (const expansion of SCOPE_EXPANSIONS) {
      const expansionMatches = [...new Set(visibleText.match(new RegExp(expansion.output.source, "g")) ?? [])];
      if (expansionMatches.length > 0 && !expansion.allowedByQuestion.test(context.question)) {
        issues.push(`일상 질문에 없는 표현 ${expansionMatches.map((word) => `"${word}"`).join(", ")}을 쓰지 말고 질문 분야의 구체적인 말로 바꿔야 한다.`);
      }
    }

    const anchor = KOREAN_DOMAIN_ANCHORS[domain];
    if (!anchor.test(result.summary) || !anchor.test(result.synthesis)) {
      issues.push("summary와 synthesis 모두 식사·옷·일정 등 질문 대상을 직접 언급해야 한다.");
    }
    const ungroundedGuidance = result.guidance
      .map((item, index) => (anchor.test(item) ? -1 : index))
      .filter((index) => index >= 0);
    if (ungroundedGuidance.length > 0) {
      issues.push(`guidance ${ungroundedGuidance.join(", ")}번 항목을 질문 대상에 직접 연결해야 한다.`);
    }
    const ungroundedCards = result.cardInterpretations
      .filter((item) => !anchor.test(item.text)
        || !item.reasoning
        || !anchor.test(item.reasoning.questionConnection)
        || !anchor.test(item.reasoning.decisionImpact))
      .map((item) => item.cardId);
    if (ungroundedCards.length > 0) {
      issues.push(`카드 ${ungroundedCards.join(", ")}의 결론, 질문 연결 이유, 판단 영향을 질문 대상에 직접 연결해야 한다.`);
    }

    if (domain === "food") {
      const unsupportedClaim = UNSUPPORTED_FOOD_CAUSALITY
        .map((pattern) => visibleText.match(pattern)?.[0])
        .find(Boolean);
      if (unsupportedClaim) {
        issues.push(`근거 없는 식사 인과관계 "${unsupportedClaim}"을 만들지 말아야 한다. 준비 편의와 포만감은 별도 기준으로 설명한다.`);
      }
      const suppliedFoodContext = [
        context.question,
        ...(expectedCards?.flatMap((card) => [card.positionTitle, card.positionFocus]) ?? []),
      ].join(" ");
      for (const assumption of FOOD_SPECIFIC_ASSUMPTIONS) {
        const match = visibleText.match(assumption.output)?.[0];
        if (match && !assumption.allowedByQuestion.test(suppliedFoodContext)) {
          issues.push(`질문에 없는 음식 특성 "${match}"을 만들어내지 말아야 한다.`);
        }
      }
    }

    const axisText = result.axes.map((axis) => `${axis.label} ${axis.evidence}`).join(" ");
    const matchedAxisAnchors = KOREAN_AXIS_ANCHORS[domain].filter((word) => axisText.includes(word));
    if (new Set(matchedAxisAnchors).size < 2) {
      issues.push("그래프 축을 일상 질문에 맞는 서로 다른 실제 기준으로 작성해야 한다.");
    }
  }

  if (expectedCards && expectedCards.length > 0) {
    expectedCards.forEach((expected, index) => {
      const actual = result.cardInterpretations[index];
      if (!actual?.reasoning) return;

      if (expected.sourceMeaning && actual.reasoning.sourceMeaning !== expected.sourceMeaning) {
        issues.push(`${expected.cardName}의 원뜻은 서버가 제공한 카드 문장을 그대로 사용해야 한다.`);
      }
      if (!actual.reasoning.questionConnection.includes(expected.positionTitle)) {
        issues.push(`${expected.cardName}의 질문 연결 이유에 자리 이름 "${expected.positionTitle}"을 직접 써야 한다.`);
      }
      if (
        detectEverydayDomain(context.question) === "food"
        && PHYSICAL_FOOD_POSITION.test(`${expected.positionTitle} ${expected.positionFocus}`)
      ) {
        const physicalReasoning = `${actual.reasoning.questionConnection} ${actual.reasoning.decisionImpact}`;
        if (!PHYSICAL_LIMIT_STATEMENT.test(physicalReasoning)) {
          issues.push(`${expected.cardName} 해석에서 카드가 실제 포만감·영양 상태를 예측할 수 없다는 경계를 명시해야 한다.`);
        }
      }
    });

    const mentionedCardCount = expectedCards.filter((card) => result.synthesis.includes(card.cardName)).length;
    if (mentionedCardCount < Math.min(2, expectedCards.length)) {
      issues.push("종합 해석에서 카드 이름과 질문의 관계를 근거로 설명해야 한다.");
    }
    const synthesisSentences = result.synthesis
      .split(/[.!?]\s*/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    if (
      synthesisSentences.length !== expectedCards.length
      || expectedCards.some((card, index) => !synthesisSentences[index]?.startsWith(card.cardName))
    ) {
      issues.push(`synthesis는 요청 순서대로 카드 이름으로 시작하는 문장 ${expectedCards.length}개만 작성해야 한다.`);
    }
    const cardAsPerson = expectedCards.find((card) => new RegExp(`${card.cardName}.{0,80}(?:식사를 한다|메뉴를 (?:고른다|선택한다)|음식을 먹는다|옷을 입는다|일정을 실행한다)`).test(result.synthesis));
    if (cardAsPerson) {
      issues.push(`${cardAsPerson.cardName}을 사람 행동의 주어로 쓰지 말고, 그 카드가 어떤 선택의 근거가 되는지 설명해야 한다.`);
    }
  }

  const summary = normalize(result.summary);
  const synthesis = normalize(result.synthesis);
  if (summary.length > 40 && synthesis.length > 40 && (summary.includes(synthesis) || synthesis.includes(summary))) {
    issues.push("요약과 종합 해석이 같은 내용을 반복한다.");
  }

  if (issues.length > 0) throw new Error(issues.join(" "));

  return result;
}

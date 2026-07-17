import {
  createAnswerContract,
  extractBinaryChoices,
  extractChoiceCandidates,
  isOpenRecommendationQuestion,
  toKoreanHaeyo,
  type AnswerContract,
  type BinaryChoices,
  type Orientation,
  type ReadingLanguage,
  type ReadingContext,
  type ReadingPlan,
  type ReadingResult,
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
  outfit: /옷|코디|입(?:을|고|는|지|어)|신발|겉옷|복장|outfit|clothes|wear|shoes|jacket/i,
  schedule: /오늘\s*(?:뭐|무엇|할\s*일)|주말\s*일정|할\s*일|일정|약속|today(?:'s)?\s*(?:task|plan)|weekend\s*(?:plan|schedule)|to-?do/i,
};

const KOREAN_DOMAIN_ANCHORS: Record<EverydayDomain, RegExp> = {
  food: /아침|점심|저녁|오전|식사|메뉴|음식|먹|간식|끼니|배달|요리|조리|재료|포만|영양|에너지|식욕|설거지|배고픔|허기|식사량/,
  outfit: /옷|코디|입|신발|겉옷|복장|소재|기온|날씨|외출/,
  schedule: /오늘|주말|할 일|일정|약속|마감|기한|순서|우선|업무|작업|과제|처리|중요|긴급|착수|시작|완료|집중|시간|휴식|외출/,
};

const KOREAN_AXIS_ANCHORS: Record<EverydayDomain, string[]> = {
  food: ["메뉴", "준비", "포만", "영양", "조리", "가격", "비용", "에너지", "피로", "시간", "소화", "간편", "선택", "식욕", "배고픔", "허기", "식사량", "만족", "입맛"],
  outfit: ["기온", "날씨", "활동", "이동", "편안", "보온", "통풍", "외출", "격식", "세탁"],
  schedule: ["시간", "마감", "기한", "순서", "집중", "피로", "휴식", "이동", "약속", "소요", "우선", "업무", "작업", "과제", "처리", "중요", "긴급", "착수", "시작", "완료", "실행", "속도", "목표", "영향"],
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
  { output: /재정(?!립|비)|자산|수익|성과|경제적|자원|책임/, allowedByQuestion: /재정(?!립|비)|돈|가격|비용|예산|수익|자산|경제|성과|자원|책임/ },
  { output: /조직|운영 구조|책임 범위/, allowedByQuestion: /조직|회사|직장|사업|운영|책임/ },
  { output: /타인의 신호|인간관계|상대방|주변의 도움/, allowedByQuestion: /타인|상대|관계|도움|함께|주변/ },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

const TOPIC_STOPWORD = /^(?:나|내|저|제|우리|오늘|지금|요즘|이번|현재|자꾸|계속|그냥|정확히|먼저|다음|행동|질문|답|결론|무엇|무슨|어떤|어느|뭐|왜|어째서|이유|원인|어떻게|언제|알려|말해|봐|봐줘|해줘|하|해|해요|되|돼|있|없|좋|나을|할|될|일까|할까|될까|what|which|who|where|when|why|how|should|would|could|please|tell|show|question|answer|current|now|today|about)$/i;

function topicalTokens(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[가-힣a-z0-9]+/g) ?? [])
    .map((token) => token
      .replace(/(?:에서|으로|에게|부터|까지|처럼|보다|하고|이며|이라면|라면|인가|인지|일까|할까|될까|좋을까|나을까|해야|하면|하는|의|을|를|은|는|이|가|에|로|와|과|도|만)$/u, "")
      .trim())
    .filter((token) => token.length > 0 && !TOPIC_STOPWORD.test(token)))];
}

function hasTopicalConnection(value: string, subject: string): boolean {
  const anchors = topicalTokens(subject);
  if (anchors.length === 0) return true;
  const normalizedValue = normalize(value);
  return anchors.some((anchor) => normalizedValue.includes(normalize(anchor)));
}

function axisRepresentsCandidate(label: string, candidate: string): boolean {
  const normalizedLabel = label.trim().toLowerCase();
  const normalizedCandidate = candidate.trim().toLowerCase();
  if (!normalizedLabel.startsWith(normalizedCandidate)) return false;
  const remainder = normalizedLabel.slice(normalizedCandidate.length);
  return remainder.length === 0
    || /^(?:\s|[·:|/()[\]_-]|신호|선택|후보|signal|option)/iu.test(remainder);
}

function findDirectChoiceVerdict(summary: string, choices: BinaryChoices): string | null {
  const firstSentence = normalize(summary.split(/[.!?\n]/u)[0] ?? "");
  const selected = choices.filter((choice) => {
    const choiceLabel = normalize(choice);
    const choiceOffset = firstSentence.indexOf(choiceLabel);
    if (choiceOffset < 0) return false;
    const tail = firstSentence.slice(choiceOffset + choiceLabel.length, choiceOffset + choiceLabel.length + 24);
    return /^(?:(?:을|를|쪽을)(?:바로|먼저|우선)?|(?:이|가))?(?:골라요|선택해요|추천해요|우선해요|먹어요|더나아요)/u.test(tail);
  });
  return selected.length === 1 ? selected[0] : null;
}

const CONTRACT_FIXED_CHOICE_KINDS = new Set<AnswerContract["kind"]>(["choose_one", "yes_no"]);
const CONTRACT_DECISIVE_CHOICE_KINDS = new Set<AnswerContract["kind"]>([...CONTRACT_FIXED_CHOICE_KINDS, "recommend_one"]);
const CONTRACT_CANDIDATE_KINDS = new Set<AnswerContract["kind"]>([...CONTRACT_FIXED_CHOICE_KINDS, "compare"]);
const CONTRACT_DECISIVENESS: Record<AnswerContract["kind"], boolean> = {
  choose_one: true,
  recommend_one: true,
  yes_no: true,
  outcome: true,
  compare: false,
  forecast: false,
  advice: true,
  explain: false,
  analysis: false,
};
const EXPLICIT_ANSWER_SHAPE: Partial<Record<AnswerContract["kind"], RegExp>> = {
  choose_one: /골라|선택|하나만|pick|choose|which\s+(?:one|option)/iu,
  yes_no: /할까\s*말까|예(?:\s*\/\s*|\s*아니면\s*)아니요|yes\s+or\s+no/iu,
  outcome: /성공|실패|합격|불합격|붙을까|통과|탈락|당첨|성사|달성|회복|완료|해낼|잘\s*될|이루어질|succeed|fail|pass|accepted|rejected|win|recover|work\s+out|happen/iu,
  compare: /비교|차이|장단점|compare|difference|pros?\s*(?:and|&)\s*cons?/iu,
  forecast: /언제|시기|전망|향후|when|forecast|outlook/iu,
  advice: /조언|방법|어떻게\s+(?:해야|하면)|what\s+should\s+i\s+do|advice|next\s+step/iu,
  explain: /왜|이유|원인|어째서|why|reason|cause/iu,
};
const DEFERRED_ANSWER = /상황에 따라|조건(?:을|부터)? (?:더 )?확인|판단하기 어렵|결정하기 어렵|둘 다|경우에 따라|불확실|반반|알 수 없|모르겠|아직 정해지지|it depends|need more (?:context|information)|cannot (?:decide|tell|know)|both options|uncertain|fifty[- ]?fifty|50\s*[/:-]\s*50/i;
const DIRECT_OUTCOME_ASSERTION = /(?:성공|실패|합격|불합격|통과|탈락|당첨|낙첨|성사|무산|달성|미달|회복|악화|완료|미완료|이루어짐|불발)(?:할|될)?\s*(?:가능성(?:이|은)?\s*(?:높|낮|크|작)|쪽|할\s*거|될\s*거|것으로\s*(?:보|예상)|로\s*(?:보|예상))|(?:성공|합격|통과|당첨|성사|달성|회복|완료)(?:하|되|할|될|할\s*수\s*있|될\s*수\s*있)|(?:실패|불합격|탈락|낙첨|무산|악화|미완료)(?:하|되|할|될)|(?:성공|합격|통과|성사|달성|회복|완료)(?:하지|되지|하지\s*못|되지\s*못)\s*않|(?:연락|답장|기회|결과).{0,18}(?:올|오지\s*않|나올|나오지\s*않|생길|생기지\s*않)\s*(?:가능성|거|것)|(?:will|likely|unlikely|expected\s+to|points?\s+to).{0,32}(?:succeed|fail|pass|reject|win|lose|recover|complete|happen|arrive)|(?:success|failure|acceptance|rejection|passing|failing)\s+(?:is|looks|seems|appears)/iu;
const POSITIVE_OUTCOME_TOKEN = /성공|합격|통과|당첨|성사|달성|회복|완료|이루어|해낼|succeed|success|pass|accept|win|recover|complete/iu;
const NEGATIVE_OUTCOME_TOKEN = /실패|불합격|탈락|낙첨|무산|악화|미완료|불발|fail|failure|reject|lose|decline|worsen|incomplete/iu;
const OUTCOME_REOPENING_CONNECTOR = /하지만|그렇지만|다만|반면|한편|더라도|수도\s*있|가능성도|\bbut\b|\bhowever\b|\bon the other hand\b|\bcould also\b|\bmight still\b/iu;
const GENERIC_RECOMMENDATION = /^(?:(?:적당한|알맞은|괜찮은|좋은|무난한|상황에 맞는|조건에 맞는|추천할 만한|따뜻한|차가운|매운|가벼운|든든한|간단한|부드러운|자극적(?:인)?|편한|재미있는|조용한)\s*)*(?:것|선택|선택지|방법|메뉴|음식|요리|식사|아침|한식|중식|일식|양식|국물(?:\s*요리)?|면(?:\s*요리)?|밥(?:\s*요리)?|옷|옷차림|작품|영화|책|장소|곳|행동|활동|제품|물건|대안|옵션|option|choice|something|whatever fits)$/i;
const GENERIC_NAMED_CATEGORY = /^(?:[가-힣a-z0-9]+\s+){1,4}(?:요리|음식|메뉴|식사|옷|옷차림|작품|장소|활동|제품|물건|dish|food|meal|outfit|work|place|activity|product|item)$/iu;
const GENERIC_ANSWER_TOKEN = /^(?:먼저|우선|현재|지금|이번|조금|좀|더|다음|천천히|신중한|신중하게|차분한|차분하게|그냥|일단|상황|흐름|조건|문제|부분|요소|방향|방향성|접근|상태|가능성|전체|전반|필요|중요|적절|다시|이후|그다음|게|것|수|current|situation|flow|condition|issue|factor|direction|approach|carefully|slowly|review|check|consider|decide|decision)$/i;
const GENERIC_ANSWER_VERB = /^(?:살펴|확인|점검|고려|검토|파악|접근|결정|판단|생각|보여|좋|나)(?:[가-힣]*)$/u;
const NOVELTY_GENERIC_TOKEN = /^(?:살펴|확인|점검|고려|검토|파악|접근|판단|생각|질문|답변|답|결론|가능|가능성|전망|시기|흐름|방향|변화|결과|상태|상황|조건|문제|원인|이유|핵심|중심|발견|행동|패턴|필요|중요|적절|신중|차분|확실|불확실|있|없|보이|나타나|무언가|뭔가)(?:[가-힣]*)$/u;
const KIND_SEMANTIC_PATTERN: Partial<Record<AnswerContract["kind"], RegExp>> = {
  explain: /원인|이유|때문|비롯|영향으로|because|reason|cause|stems?\s+from|driven\s+by|due\s+to/i,
  forecast: /(?:\d+\s*(?:일|주|개월|달|년)|(?:이번|다음)\s*(?:주|달|주말)|봄|여름|가을|겨울|상반기|하반기|예상\s*시기|전망(?:은|이)|가장\s*가능성(?:이|은)\s*(?:큰|높은)|흐름(?:은|이).{0,40}(?:쪽|방향|증가|감소|이어|바뀌)|\blikely\b|\bexpected\b|\bwithin\b|\bnext\s+(?:week|month|year)\b|\btoward\b|\bincreas|\bdecreas)/iu,
  outcome: /성공|실패|합격|불합격|통과|탈락|당첨|성사|달성|회복|완료|이루어|해낼|될\s*가능성|가능성(?:이|은)?\s*(?:높|낮)|일어날|오지\s*않|올\s*가능성|succeed|fail|pass|reject|win|recover|complete|likely|unlikely|will|won't|will\s+not/iu,
  advice: /(?:먼저|우선)\s*(?:할|해야|해볼)\s*(?:일|행동)(?:은|이)|\bfirst(?:\s+(?:action|step))?\b|start\s+by|you\s+should/i,
  analysis: /핵심|중심|가장\s*중요|두드러진|main\s+(?:finding|pattern|issue)|key\s+(?:finding|pattern|issue)|central\s+(?:finding|pattern|issue)|most\s+important/i,
};

function hasSpecificAnswerContent(value: string): boolean {
  if (/(?:\d+\s*(?:일|주|개월|달|년)|(?:이번|다음)\s*(?:주|달|주말)|봄|여름|가을|겨울|상반기|하반기)/u.test(value)) {
    return true;
  }
  const tokens = value.match(/[가-힣A-Za-z0-9]+/g) ?? [];
  return tokens.some((token) => {
    const withoutParticle = token.replace(/(?:에서|으로|에게|부터|까지|처럼|보다|하고|이며|의|을|를|은|는|이|가|에|로|와|과|도|만)$/u, "");
    return withoutParticle.length >= 2
      && !GENERIC_ANSWER_TOKEN.test(withoutParticle)
      && !GENERIC_ANSWER_VERB.test(withoutParticle);
  });
}

function hasNovelAnswerContent(value: string, input: string): boolean {
  const normalizedInput = normalize(input);
  return topicalTokens(value).some((token) => (
    !NOVELTY_GENERIC_TOKEN.test(token)
    && !normalizedInput.includes(normalize(token))
  ));
}

function answerContractIssues(
  result: ReadingResult,
  contract: AnswerContract,
  question: string,
): string[] {
  const issues: string[] = [];
  const verdict = result.verdict;
  if (!verdict) return ["질문에 대한 직접 답을 verdict에 작성해야 한다."];
  if (verdict.kind !== contract.kind) {
    issues.push(`verdict.kind는 답변 계약의 ${contract.kind}와 같아야 한다.`);
  }
  const normalizedValue = normalize(verdict.value);
  if (!normalizedValue || GENERIC_RECOMMENDATION.test(verdict.value.trim())) {
    issues.push("verdict.value에는 범주나 판단 기준이 아니라 질문에 대한 구체적인 답을 써야 한다.");
  }
  if (!normalize(verdict.statement).includes(normalizedValue)) {
    issues.push("verdict.statement에는 verdict.value를 직접 포함해야 한다.");
  }
  const firstSentence = result.summary.split(/[.!?\n]/u)[0] ?? "";
  if (!normalize(firstSentence).includes(normalizedValue)) {
    issues.push("summary 첫 문장에서 verdict.value를 직접 말해야 한다.");
  }
  if (!normalize(result.summary).startsWith(normalize(verdict.statement))) {
    issues.push("summary는 verdict.statement로 시작해야 한다.");
  }
  if (contract.decisive && DEFERRED_ANSWER.test(`${verdict.statement} ${firstSentence}`)) {
    issues.push("직접 결론을 요구한 질문에서 조건부 표현으로 답을 미루지 말아야 한다.");
  }
  if (contract.kind === "outcome" && !DIRECT_OUTCOME_ASSERTION.test(verdict.statement)) {
    issues.push("결과 질문은 불확실하다고 미루지 말고 성공·실패처럼 긍정 또는 부정 한쪽을 직접 말해야 한다.");
  }
  if (
    contract.kind === "outcome"
    && POSITIVE_OUTCOME_TOKEN.test(verdict.statement)
    && NEGATIVE_OUTCOME_TOKEN.test(verdict.statement)
    && OUTCOME_REOPENING_CONNECTOR.test(verdict.statement)
  ) {
    issues.push("결과 첫 문장에서 한쪽을 고른 뒤 반대 결과의 가능성을 다시 열지 말아야 한다.");
  }
  if (
    !CONTRACT_CANDIDATE_KINDS.has(contract.kind)
    && (!hasSpecificAnswerContent(verdict.value) || (contract.kind === "recommend_one" && GENERIC_NAMED_CATEGORY.test(verdict.value.trim())))
  ) {
    issues.push(contract.kind === "recommend_one"
      ? "verdict.value에는 범주가 아니라 바로 선택할 수 있는 구체적인 답 하나를 써야 한다."
      : "verdict.value에는 어느 질문에나 붙일 수 있는 태도나 절차가 아니라 구체적인 원인·흐름·행동·발견을 써야 한다.");
  }
  if (
    !CONTRACT_CANDIDATE_KINDS.has(contract.kind)
    && !hasTopicalConnection(verdict.statement, `${contract.subject} ${question}`)
  ) {
    issues.push("verdict.statement에는 질문의 대상이나 문제를 직접 언급해 답이 무엇에 관한 것인지 분명히 해야 한다.");
  }
  if (
    !CONTRACT_CANDIDATE_KINDS.has(contract.kind)
    && contract.kind !== "outcome"
    && !hasNovelAnswerContent(verdict.value, `${contract.subject} ${question}`)
  ) {
    issues.push("verdict.value는 질문을 다시 말하거나 확인하겠다고만 하지 말고, 질문에 없던 실제 원인·방향·행동·발견을 답으로 제시해야 한다.");
  }
  const semanticPattern = KIND_SEMANTIC_PATTERN[contract.kind];
  if (semanticPattern && !semanticPattern.test(verdict.statement)) {
    issues.push(`${contract.kind} 답변의 첫 문장은 해당 유형이 요구하는 원인·전망·우선 행동·핵심 발견을 명시해야 한다.`);
  }
  if (CONTRACT_FIXED_CHOICE_KINDS.has(contract.kind)) {
    const matches = contract.candidates.filter((candidate) => normalize(candidate) === normalizedValue);
    if (matches.length !== 1) {
      issues.push("명시 선택 답은 답변 계약의 후보 중 정확히 하나여야 한다.");
    }
    const selectedCandidate = matches[0];
    const additionalStatementCandidates = contract.candidates.filter((candidate) => (
      candidate !== selectedCandidate
      && !normalize(selectedCandidate ?? "").includes(normalize(candidate))
      && normalize(verdict.statement).includes(normalize(candidate))
    ));
    if (!selectedCandidate || additionalStatementCandidates.length > 0) {
      issues.push("직접 답 문장에는 후보를 하나만 말해야 한다.");
    }
    if (!normalize(result.guidance.join(" ")).includes(normalizedValue)) {
      issues.push("guidance에서도 이미 정한 답을 직접 실행하도록 써야 한다.");
    }
    const verdictAxis = result.axes.find((axis) => axisRepresentsCandidate(axis.label, verdict.value));
    const otherCandidateScores = result.axes
      .filter((axis) => contract.candidates.some((candidate) => (
        normalize(candidate) !== normalizedValue && axisRepresentsCandidate(axis.label, candidate)
      )))
      .map((axis) => axis.score);
    if (verdictAxis && otherCandidateScores.some((score) => score > verdictAxis.score)) {
      issues.push("그래프에서는 최종 선택의 카드 신호가 다른 후보보다 낮게 표시되지 않아야 한다.");
    }
  } else if (contract.kind === "recommend_one") {
    if (
      verdict.value.trim().length > 28
      || /평소|자주|늘\s|새로운\s*종류|종류의|계열의|스타일의|느낌의|상황에\s*맞는|조건에\s*맞는|usually|normally|often|a\s+kind\s+of|a\s+type\s+of/iu.test(verdict.value)
    ) {
      issues.push("열린 추천의 verdict.value에는 설명이나 조건을 붙이지 말고 바로 고를 수 있는 짧은 대상·행동 이름만 써야 한다.");
    }
    const supplementalText = `${result.synthesis} ${result.guidance.join(" ")}`;
    if (/(?:아니면|또는|혹은|대신).{0,36}(?:괜찮|추천|먹|입|고르|선택|해도|할 수)|(?:another|alternatively|or instead).{0,36}(?:recommend|choose|pick|eat|wear|also)/iu.test(supplementalText)) {
      issues.push("열린 추천은 결론 뒤에 다른 대안을 다시 제시하지 말고 정한 답 하나만 유지해야 한다.");
    }
    const unlinkedAlternative = supplementalText
      .split(/[.!?\n]/u)
      .find((sentence) => /(?:도\s*(?:괜찮|좋|추천)|역시\s*(?:괜찮|좋|추천))/u.test(sentence)
        && !normalize(sentence).includes(normalizedValue));
    if (unlinkedAlternative) {
      issues.push("열린 추천의 종합과 확인 항목에서 정한 답이 아닌 다른 대안을 덧붙이지 말아야 한다.");
    }
  } else if (contract.kind === "compare") {
    const representedCandidates = contract.candidates.filter((candidate) => (
      normalize(result.verdict?.statement ?? "").includes(normalize(candidate))
      || normalize(result.summary).includes(normalize(candidate))
    ));
    if (representedCandidates.length !== contract.candidates.length) {
      issues.push("비교 답변의 첫 부분에서 모든 비교 후보를 직접 언급해야 한다.");
    }
  }
  if (CONTRACT_CANDIDATE_KINDS.has(contract.kind)) {
    const candidateAxisCounts = contract.candidates.map((candidate) => (
      result.axes.filter((axis) => axisRepresentsCandidate(axis.label, candidate)).length
    ));
    if (candidateAxisCounts.some((count) => count !== 1)) {
      issues.push("그래프에는 후보마다 후보 이름을 쓴 카드 신호 축을 정확히 하나씩 만들어야 한다.");
    }
    if (result.axes.some((axis) => contract.candidates.filter((candidate) => axisRepresentsCandidate(axis.label, candidate)).length > 1)) {
      issues.push("한 그래프 축에 여러 후보를 합치지 말아야 한다.");
    }
  }
  return issues;
}

export function groundPositionConnection(value: string, positionTitle: string): string {
  if (normalize(value).includes(normalize(positionTitle))) return value;
  const positionLabel = positionTitle.trim().endsWith("자리")
    ? positionTitle.trim()
    : `${positionTitle.trim()} 자리`;
  const connection = value.trim().replace(/^(?:이|해당)\s*자리(?:에서는|에서|에선)\s*/u, "");
  return `${positionLabel}에서는 ${connection}`;
}

function appliedProseSections(result: ReadingResult): string[] {
  return [
    result.verdict?.statement ?? "",
    result.summary,
    result.synthesis,
    ...result.guidance,
    ...result.cardInterpretations.flatMap((item) => [
      item.text,
      item.reasoning?.questionConnection ?? "",
      item.reasoning?.decisionImpact ?? "",
    ]),
    ...result.axes.flatMap((axis) => [axis.label, axis.evidence]),
  ].filter(Boolean);
}

const KOREAN_FORMAL_ENDING = /합니다|하십시오|됩니다|있습니다|없습니다|않습니다|못합니다|입니다/;
const INTERNAL_SCHEMA_TERM = /position[_ ]?focus|position[_ ]?title|source[_ ]?meaning|question[_ ]?connection|decision[_ ]?impact|card[_ ]?interpretations|evidence[_ ]?card[_ ]?ids/i;

export function detectEverydayDomain(question: string): EverydayDomain | null {
  for (const [domain, pattern] of Object.entries(DOMAIN_PATTERNS) as Array<[EverydayDomain, RegExp]>) {
    if (pattern.test(question)) return domain;
  }
  return null;
}

export function resolveEverydayDomain(
  question: string,
  conversation?: ReadingContext,
): EverydayDomain | null {
  const currentDomain = detectEverydayDomain(question);
  if (currentDomain) return currentDomain;
  if (!conversation) return null;

  const refersToEarlierAnswer = /^(?:그래서|결국)(?:\s|[,.:!?]|$)|(?:이|그|앞선|방금)\s*(?:결론|답|선택|해석)|추가로\s*(?:조심|주의|확인|볼|알)/u.test(question.trim());
  if (!refersToEarlierAnswer) return null;

  const priorScope = [
    conversation.initialQuestion,
    ...(conversation.previousQuestions ?? []),
  ].filter((value): value is string => Boolean(value)).join("\n");
  return detectEverydayDomain(priorScope);
}

export function questionScopeGuide(question: string, language: ReadingLanguage): string {
  const domain = detectEverydayDomain(question);
  if (!domain) {
    return language === "ko"
      ? "질문에 적힌 범위 안에서 해석한다. 열린 추천은 카드 공개 전 후보를 만들지 않고, 카드 해석 뒤 구체적인 답 하나만 제시한다. 카드 상징에서 읽히는 취향·감정·결과·상황은 질문에 맞게 자유롭게 추론한다."
      : "Stay within the question's scope. For an open recommendation, do not create candidates before the cards are revealed; name one concrete answer only after interpreting the cards. Freely infer preferences, emotions, outcomes, and circumstances from the card symbolism when they answer the question.";
  }

  if (language !== "ko") {
    return "This is a small everyday choice. Use only concrete criteria and actions that apply today; do not expand it into unrelated long-term issues.";
  }

  return ({
    food: "식사에 관한 작은 일상 질문이다. 요청한 메뉴 선택이나 추천을 먼저 직접 답하고, 카드 상징을 맛·취향·포만감·영양·몸 상태와 자연스럽게 연결해 해석한다.",
    outfit: "옷차림에 관한 작은 일상 질문이다. 요청한 선택이나 추천을 먼저 직접 답하고, 카드 상징을 날씨·일정·분위기·착용감과 자연스럽게 연결해 해석한다.",
    schedule: "일정에 관한 작은 일상 질문이다. 요청한 우선순위나 행동을 먼저 직접 답하고, 카드 상징을 마감·약속·집중도·외부 조건과 자연스럽게 연결해 해석한다.",
  })[domain];
}

export function concreteWritingGuide(question: string, language: ReadingLanguage): string {
  if (language !== "ko") return "Use concrete nouns and actions from the question in every interpretation section.";
  const domain = detectEverydayDomain(question);
  if (domain === "food") {
    return "sourceMeaning에는 카드 원뜻을 보존한다. 그 밖의 문장에서는 추상어를 줄이고, 질문의 식사 대상과 고른다·먹는다 같은 실제 행동을 사용한다. 카드 상징을 맛·취향·포만감·영양·몸 상태와 구체적으로 연결할 수 있다.";
  }
  if (domain === "outfit") {
    return "카드의 추상어를 질문에 나온 옷차림 대상과 고른다·입는다·챙긴다 같은 실제 행동으로 바꿔 쓴다. 카드 상징을 날씨·외출 목적·분위기·착용감과 구체적으로 연결할 수 있다.";
  }
  if (domain === "schedule") {
    return "카드의 추상어를 질문에 나온 일정 대상과 시작한다·미룬다·확인한다 같은 실제 행동으로 바꿔 쓴다. 카드 상징을 마감·약속·집중도·외부 조건과 구체적으로 연결할 수 있다.";
  }
  return "질문의 명사를 되풀이하기만 하지 말고, 카드가 어떤 판단 기준이나 행동으로 이어지는지 구체적으로 쓴다.";
}

export function enforcePlanQuality(
  plan: ReadingPlan,
  context: { question: string; language: ReadingLanguage; conversation?: ReadingContext },
): ReadingPlan {
  let contract = plan.answerContract ?? createAnswerContract(context.question, undefined, context.language);
  const expectedContract = createAnswerContract(context.question, context.conversation, context.language);
  // Candidate-like phrases inside a cause, forecast, or advice question are not choices.
  // Only let extraction override the model when the deterministic answer contract itself
  // says this is a candidate-based question.
  const candidatesWrittenInCurrentQuestion = CONTRACT_CANDIDATE_KINDS.has(expectedContract.kind)
    ? extractChoiceCandidates(context.question)
    : null;
  const inheritedCandidates = !candidatesWrittenInCurrentQuestion
    && (expectedContract.kind === "choose_one" || expectedContract.kind === "compare")
    ? expectedContract.candidates
    : null;
  const userSuppliedCandidates = candidatesWrittenInCurrentQuestion ?? inheritedCandidates;
  if (userSuppliedCandidates?.length) {
    const comparisonOnly = expectedContract.kind === "compare";
    contract = {
      ...contract,
      kind: comparisonOnly ? "compare" : "choose_one",
      candidates: [...userSuppliedCandidates],
      decisive: !comparisonOnly,
    };
  }

  if (expectedContract.kind === "recommend_one" && contract.candidates.length > 0) {
    throw new Error("열린 추천은 카드 공개 전에 후보를 만들지 말고 candidates를 빈 배열로 두어야 한다.");
  }

  const explicitExpectedShape = expectedContract.kind === "recommend_one"
    ? isOpenRecommendationQuestion(context.question)
    : EXPLICIT_ANSWER_SHAPE[expectedContract.kind]?.test(context.question) ?? false;
  if (!userSuppliedCandidates && explicitExpectedShape && contract.kind !== expectedContract.kind) {
    throw new Error(`질문이 요구한 답변 유형은 ${expectedContract.kind}이며 ${contract.kind}로 바꾸지 말아야 한다.`);
  }
  if (contract.kind === "choose_one" && !userSuppliedCandidates) {
    throw new Error("사용자가 후보를 제시하지 않은 질문은 choose_one 후보를 만들지 말고 recommend_one으로 분류해야 한다.");
  }
  if (contract.decisive !== CONTRACT_DECISIVENESS[contract.kind]) {
    throw new Error(`${contract.kind} 답변의 decisive 값이 답변 유형과 일치하지 않는다.`);
  }
  if (!CONTRACT_CANDIDATE_KINDS.has(contract.kind) && contract.candidates.length > 0) {
    throw new Error(`${contract.kind} 답변에는 선택 후보를 임의로 추가하지 말아야 한다.`);
  }
  if (
    !CONTRACT_CANDIDATE_KINDS.has(contract.kind)
    && !hasTopicalConnection(contract.subject, context.question)
  ) {
    throw new Error("answerContract.subject에는 현재 질문의 대상이나 문제를 직접 포함해야 한다.");
  }
  if (contract.kind === "yes_no") {
    const expectedYesNo = context.language === "ko" ? ["예", "아니요"] : ["yes", "no"];
    if (contract.candidates.map(normalize).join("|") !== expectedYesNo.map(normalize).join("|")) {
      throw new Error("yes_no 답변 후보는 출력 언어의 예·아니오 두 개여야 한다.");
    }
  }

  const candidateMode = CONTRACT_CANDIDATE_KINDS.has(contract.kind);
  const choiceMode = CONTRACT_DECISIVE_CHOICE_KINDS.has(contract.kind);
  let orderedPositions = plan.positions;
  if (choiceMode && !contract.decisive) {
    throw new Error("선택·추천 답변은 직접 결론을 내리도록 decisive=true여야 한다.");
  }
  if (contract.kind === "compare" && contract.decisive) {
    throw new Error("비교만 요청한 답변은 한 후보를 강제로 고르지 않도록 decisive=false여야 한다.");
  }
  if (candidateMode) {
    if (contract.candidates.length < 2 || contract.candidates.length > 5) {
      throw new Error("선택·예/아니오·비교 답변은 서로 다른 구체적 후보를 2~5개 포함해야 한다.");
    }
    if (new Set(contract.candidates.map(normalize)).size !== contract.candidates.length) {
      throw new Error("답변 후보를 중복해서 만들지 말아야 한다.");
    }
    if (contract.candidates.some((candidate) => candidate.length > 28)) {
      throw new Error("답변 후보 이름은 카드 자리에 표시할 수 있도록 28자 이하로 짧게 써야 한다.");
    }
    if (contract.candidates.some((candidate) => GENERIC_RECOMMENDATION.test(candidate.trim()))) {
      throw new Error("답변 후보는 범주나 조건이 아니라 실제로 선택할 수 있는 구체적 대상이어야 한다.");
    }
    orderedPositions = contract.candidates.map((candidate, index) => ({
      id: plan.positions[index]?.id || `candidate-${index + 1}`,
      title: context.language === "ko" ? `${candidate} 선택` : `${candidate} option`,
      focus: context.language === "ko"
        ? `${candidate} 선택에 카드가 주는 지지와 주의 신호`
        : `Support and caution signals for choosing ${candidate}`,
    }));
  }

  if (context.language === "ko" && !candidateMode && plan.positions.some((position) => GENERIC_PLAN_TITLE.test(position.title.trim()))) {
    throw new Error("자리 이름이 질문과 무관한 일반 명사로만 작성되었다.");
  }
  if (
    contract.kind === "recommend_one"
    && plan.positions.some((position) => /(?:선택|option)$/iu.test(position.title.trim()))
  ) {
    throw new Error("열린 추천의 카드 자리에 구체 후보를 미리 배정하지 말고 질문에 맞는 해석 역할만 작성해야 한다.");
  }
  if (contract.kind === "recommend_one") {
    const preselectedOptionText = [
      plan.interpretationFrame,
      plan.selectionGuide,
      ...plan.positions.flatMap((position) => [position.title, position.focus]),
    ].join(" ");
    if (/(?:후보|선택지)(?:인|은|는|로)\s*\S+|(?:candidates?|options?)\s*(?:are|include|:|such\s+as)/iu.test(preselectedOptionText)) {
      throw new Error("열린 추천의 구성 문구 전체에서 카드 공개 전 후보나 선택지를 제시하지 말아야 한다.");
    }
    const roleMarker = context.language === "ko"
      ? /신호|단서|주의|흐름|기준|영향|상황|가능성|보정|결정|선택|관점|조건|도움|지원|핵심|최종/
      : /signal|clue|caution|flow|criterion|impact|situation|possibility|adjustment|decision|choice|focus|condition|support|final/i;
    if (plan.positions.some((position) => !roleMarker.test(position.title))) {
      throw new Error("열린 추천의 카드 자리 이름은 구체 후보명이 아니라 해석할 역할임을 드러내야 한다.");
    }
  }

  const domain = detectEverydayDomain(context.question);
  if (context.language === "ko" && domain && !candidateMode) {
    const anchor = KOREAN_DOMAIN_ANCHORS[domain];
    if (!anchor.test(plan.interpretationFrame)) {
      throw new Error("리딩 구성이 일상 질문의 대상을 직접 언급하지 않는다.");
    }
    if (orderedPositions.some((position) => !anchor.test(`${position.title} ${position.focus}`))) {
      throw new Error("각 카드 자리가 일상 질문에 맞는 구체적인 기준으로 작성되지 않았다.");
    }
  }

  if (candidateMode) {
    return {
      ...plan,
      answerContract: contract,
      cardCount: contract.candidates.length,
      interpretationFrame: context.language === "ko"
        ? contract.kind === "compare"
          ? "후보별 카드 신호를 비교해 핵심 차이를 설명해요."
          : "후보별 카드 신호를 비교해 질문에 대한 답 하나를 정해요."
        : contract.kind === "compare"
          ? "Compare the card signal for each candidate and explain the key difference."
          : "Compare the card signal for each candidate and choose one answer.",
      selectionGuide: context.language === "ko"
        ? "각 후보에 놓을 카드를 한 장씩 선택해요."
        : "Select one card for each candidate.",
      positions: orderedPositions,
    };
  }
  return contract === plan.answerContract ? plan : { ...plan, answerContract: contract };
}

export function polishReadingLanguage(
  result: ReadingResult,
  question: string,
  language: ReadingLanguage,
  domainOverride?: EverydayDomain | null,
): ReadingResult {
  const domain = language === "ko"
    ? (domainOverride === undefined ? detectEverydayDomain(question) : domainOverride)
    : null;
  const food = domain === "food";
  const concreteDirectionTerm = domain ? ({
    food: "메뉴 선택 기준",
    outfit: "옷 선택 기준",
    schedule: "목표 설정",
  } as const)[domain] : null;
  const polish = (value: string): string => {
    let base = value.replace(/\*\*|__|`/g, "");
    if (language !== "ko") return base;
    base = base
    .replace(/sourceMeaning의\s*([^.!?\n]{1,60}?)이라는\s*원뜻/gi, "$1이라는 카드 원뜻")
    .replace(/카드 원뜻의\s*([^.!?\n]{1,60}?)이라는\s*원뜻/g, "$1이라는 카드 원뜻")
    .replace(/positionFocus인/gi, "이 자리에서 살필")
    .replace(/자리 초점인/g, "이 자리에서 살필")
    .replace(/positionFocus(?:을|를)/gi, "자리 초점을")
    .replace(/positionFocus(?:은|는)/gi, "자리 초점은")
    .replace(/positionFocus(?:이|가)/gi, "자리 초점이")
    .replace(/positionFocus/gi, "자리 초점")
    .replace(/positionTitle/gi, "자리 이름")
    .replace(/sourceMeaning/gi, "카드 원뜻")
    .replace(/questionConnection/gi, "질문 연결")
    .replace(/decisionImpact/gi, "판단 영향")
    .replace(/evidenceCardIds/gi, "근거 카드");
    if (concreteDirectionTerm) {
      if (domain === "schedule") {
        base = base
          .replace(/장기적(?:인)?\s*회복(?:으로|로)/g, "오늘 일정의 재정비로")
          .replace(/장기적(?:인)?\s*회복(?:을|를)/g, "오늘 일정의 재정비를")
          .replace(/장기적(?:인)?\s*회복(?:이|가)/g, "오늘 일정의 재정비가")
          .replace(/장기적(?:인)?\s*회복(?:은|는)/g, "오늘 일정의 재정비는")
          .replace(/장기적(?:인)?\s*회복(?:과|와)/g, "오늘 일정의 재정비와")
          .replace(/장기적(?:인)?\s*회복/g, "오늘 일정의 재정비")
          .replace(/장기적(?:인)?\s*계획/g, "오늘 일정")
          .replace(/장기적(?:인)?\s*목표/g, "오늘의 핵심 목표")
          .replace(/장기적(?:인)?\s*방향성/g, "오늘의 우선 기준")
          .replace(/일정(?:의)?\s*안정성(?:으로|로)/g, "일정 유지로")
          .replace(/일정(?:의)?\s*안정성을/g, "일정 유지를")
          .replace(/일정(?:의)?\s*안정성이/g, "일정 유지가")
          .replace(/일정(?:의)?\s*안정성은/g, "일정 유지는")
          .replace(/일정(?:의)?\s*안정성과/g, "일정 유지와")
          .replace(/일정(?:의)?\s*안정성/g, "일정 유지")
          .replace(/목표를\s*향한\s*방향성/g, "우선 기준")
          .replace(/방향성을\s*설정/g, "목표를 설정")
          .replace(/방향성\s*설정/g, "목표 설정")
          .replace(/방향성을\s*정하/g, "목표를 정하")
          .replace(/방향성을\s*잡/g, "작업 순서를 정");
      }
      base = base.replaceAll("방향성", concreteDirectionTerm);
    }
    base = base.replace(/우선 기준(?:을|를)\s*기준으로/g, "우선 기준으로");
    if (!food) return toKoreanHaeyo(base);
    return toKoreanHaeyo(base
      .replaceAll("종합적으로", "전체 카드에서")
      .replaceAll("장기적으로", "오늘 식사에서는")
      .replaceAll("장기적인", "오늘 식사에 적용할")
      .replaceAll("장기적", "오늘 식사의")
      .replaceAll("지속 가능성", "반복 선택 가능성")
      .replaceAll("외부 조건", "실제 조건")
      .replaceAll("실행 가능성", "선택 가능성")
      .replaceAll("안정성", "선택 확실성")
      .replaceAll("자원", "준비 여건")
      .replaceAll("성과", "선택 결과")
      .replaceAll("책임", "확인 사항")
      .replaceAll("요소", "잣대")
      .replaceAll("오전 동안 지속 가능한 포만감", "오전까지 오래가는 포만감")
      .replaceAll("지속 가능한 포만감", "오래가는 포만감")
      .replaceAll("오전 동안 지속 가능한 에너지", "오전 일정에 필요한 에너지")
      .replaceAll("지속 가능한 에너지", "오래 유지되는 에너지"));
  };
  const polishSourceMeaning = (value: string): string => {
    const plain = value.replace(/\*\*|__|`/g, "");
    return language === "ko" ? toKoreanHaeyo(plain) : plain;
  };

  return {
    ...result,
    verdict: result.verdict ? {
      ...result.verdict,
      value: result.verdict.value.replace(/\*\*|__|`/g, "").trim(),
      statement: polish(result.verdict.statement),
    } : undefined,
    summary: polish(result.summary),
    synthesis: polish(result.synthesis),
    guidance: result.guidance.map(polish),
    cardInterpretations: result.cardInterpretations.map((item) => ({
      ...item,
      text: polish(item.text),
      reasoning: item.reasoning ? {
        sourceMeaning: polishSourceMeaning(item.reasoning.sourceMeaning),
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
  };
}

export function enforceReadingQuality(
  result: ReadingResult,
  context: {
    question: string;
    language: ReadingLanguage;
    sourceSentences: string[];
    expectedCards?: ExpectedInterpretation[];
    answerContract?: AnswerContract;
    conversation?: ReadingContext;
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
        issues.push(`${expected.cardName}이 실제 판단에 미치는 방향과 강도를 설명해야 한다.`);
      }
    });
  }

  if (context.answerContract) {
    issues.push(...answerContractIssues(result, context.answerContract, context.question));
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
  if (KOREAN_FORMAL_ENDING.test(visibleText)) {
    issues.push("한국어 해석은 딱딱한 '-합니다'체를 섞지 말고 자연스러운 해요체로 통일해야 한다.");
  }
  const leakedSchemaTerm = visibleText.match(INTERNAL_SCHEMA_TERM)?.[0];
  if (leakedSchemaTerm) {
    issues.push(`내부 JSON 키 "${leakedSchemaTerm}"를 사용자에게 보이는 문장에 쓰지 말아야 한다.`);
  }

  const normalizedSections = sections.map(normalize);
  const normalizedSources = context.sourceSentences.map(normalize).filter(Boolean);
  const copiedCaution = normalizedSections.some((section) => normalizedSources.some((source) => section.includes(source)));
  if (copiedCaution) {
    issues.push("카드 데이터 문장을 질문 맥락에 맞게 바꾸지 않고 복사했다.");
  }

  const scopeQuestion = [
    context.question,
    context.answerContract?.subject,
    context.conversation?.initialQuestion,
    ...(context.conversation?.previousQuestions ?? []),
  ].filter((value): value is string => Boolean(value)).join("\n");
  const domain = resolveEverydayDomain(context.question, context.conversation);
  const binaryChoices = context.answerContract ? null : extractBinaryChoices(context.question);
  if (binaryChoices) {
    const verdict = findDirectChoiceVerdict(result.summary, binaryChoices);
    if (!verdict) {
      issues.push(`summary 첫 문장에서 "${binaryChoices[0]}"와 "${binaryChoices[1]}" 중 하나만 직접 골라야 한다.`);
    } else {
      const losingChoice = binaryChoices.find((choice) => choice !== verdict) ?? "";
      const guidance = normalize(result.guidance.join(" "));
      const losingLabel = normalize(losingChoice);
      if (!guidance.includes(normalize(verdict))) {
        issues.push(`guidance에서도 이미 고른 "${verdict}"를 실행하는 방법을 직접 써야 한다.`);
      }
      if (
        guidance.includes("두메뉴중")
        || guidance.includes(`${losingLabel}를고른다면`)
        || guidance.includes(`${losingLabel}을고른다면`)
        || guidance.includes(`${losingLabel}쪽을고른다면`)
      ) {
        issues.push("guidance에서 결론을 다시 양쪽 선택이나 조건부 선택으로 되돌리지 말아야 한다.");
      }
    }
  }
  if (domain) {
    const forbiddenWords = [...new Set(visibleText.match(EVERYDAY_FORBIDDEN_WORDS) ?? [])];
    if (forbiddenWords.length > 0) {
      issues.push(`일상 질문에서는 추상어 ${forbiddenWords.map((word) => `"${word}"`).join(", ")}를 쓰지 말고 질문 분야의 말로 바꿔야 한다.`);
    }
    for (const expansion of SCOPE_EXPANSIONS) {
      const expansionMatches = [...new Set(visibleText.match(new RegExp(expansion.output.source, "g")) ?? [])];
      if (expansionMatches.length > 0 && !expansion.allowedByQuestion.test(scopeQuestion)) {
        issues.push(`일상 질문에 없는 표현 ${expansionMatches.map((word) => `"${word}"`).join(", ")}을 쓰지 말고 질문 분야의 구체적인 말로 바꿔야 한다.`);
      }
    }

    const anchor = KOREAN_DOMAIN_ANCHORS[domain];
    const contractCandidates = context.answerContract?.candidates ?? [];
    const groundedInQuestion = (value: string) => (
      anchor.test(value)
      || contractCandidates.some((candidate) => normalize(value).includes(normalize(candidate)))
    );
    if (!groundedInQuestion(result.summary) || !groundedInQuestion(result.synthesis)) {
      issues.push("summary와 synthesis 모두 식사·옷·일정 등 질문 대상을 직접 언급해야 한다.");
    }
    if (!groundedInQuestion(result.guidance.join(" "))) {
      issues.push("guidance를 질문 대상에 직접 연결해야 한다.");
    }
    const ungroundedCards = result.cardInterpretations
      .filter((item) => !item.reasoning || !groundedInQuestion([
        item.text,
        item.reasoning.questionConnection,
        item.reasoning.decisionImpact,
      ].join(" ")))
      .map((item) => item.cardId);
    if (ungroundedCards.length > 0) {
      issues.push(`카드 ${ungroundedCards.join(", ")}의 결론, 질문 연결 이유, 판단 영향을 질문 대상에 직접 연결해야 한다.`);
    }

    const axisText = result.axes.map((axis) => `${axis.label} ${axis.evidence}`).join(" ");
    if (context.answerContract && CONTRACT_CANDIDATE_KINDS.has(context.answerContract.kind)) {
      const representedCandidates = contractCandidates.filter((candidate) => normalize(axisText).includes(normalize(candidate)));
      if (representedCandidates.length < Math.min(2, contractCandidates.length)) {
        issues.push("그래프 축에 서로 다른 답변 후보의 카드 신호를 표시해야 한다.");
      }
    } else {
      const matchedAxisAnchors = KOREAN_AXIS_ANCHORS[domain].filter((word) => axisText.includes(word));
      if (new Set(matchedAxisAnchors).size < 2) {
        issues.push("그래프 축을 일상 질문에 맞는 서로 다른 실제 기준으로 작성해야 한다.");
      }
    }
  }

  if (expectedCards && expectedCards.length > 0) {
    expectedCards.forEach((expected, index) => {
      const actual = result.cardInterpretations[index];
      if (!actual?.reasoning) return;

      if (expected.sourceMeaning && actual.reasoning.sourceMeaning !== expected.sourceMeaning) {
        issues.push(`${expected.cardName}의 원뜻은 서버가 제공한 카드 문장을 그대로 사용해야 한다.`);
      }
      if (!normalize(actual.reasoning.questionConnection).includes(normalize(expected.positionTitle))) {
        issues.push(`${expected.cardName}의 질문 연결 이유에 자리 이름 "${expected.positionTitle}"을 직접 써야 한다.`);
      }
    });

    const mentionedCardCount = expectedCards.filter((card) => result.synthesis.includes(card.cardName)).length;
    if (mentionedCardCount < Math.min(2, expectedCards.length)) {
      issues.push("종합 해석에서 카드 이름과 질문의 관계를 근거로 설명해야 한다.");
    }
    const normalizedSynthesis = normalize(result.synthesis);
    let previousCardOffset = -1;
    const cardsOutOfOrder = expectedCards.some((card) => {
      const offset = normalizedSynthesis.indexOf(normalize(card.cardName), previousCardOffset + 1);
      if (offset < 0) return true;
      previousCardOffset = offset;
      return false;
    });
    if (cardsOutOfOrder) {
      issues.push("synthesis에서 요청 순서대로 모든 카드 이름과 질문의 관계를 설명해야 한다.");
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

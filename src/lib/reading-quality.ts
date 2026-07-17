import type {
  AnswerContract,
  ReadingContext,
  ReadingLanguage,
  ReadingPlan,
  ReadingResult,
} from "@/src/lib/tarot";

export interface ExpectedInterpretation {
  cardId: string;
  cardName: string;
  positionTitle: string;
  positionFocus: string;
  orientation: "upright" | "reversed";
  orientationLabel: string;
  sourceKeywords?: string[];
  evidence: string[];
}

const CANDIDATE_KINDS = new Set<AnswerContract["kind"]>(["choose_one", "yes_no", "compare"]);
const INTERNAL_SCHEMA_TERM = /position[_ ]?focus|position[_ ]?title|source[_ ]?meaning|question[_ ]?connection|decision[_ ]?impact|card[_ ]?interpretations|evidence[_ ]?card[_ ]?ids/i;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
}

function unique(values: string[]): boolean {
  return new Set(values.map(normalize)).size === values.length;
}

function candidateHasSource(
  candidate: string,
  question: string,
  conversation?: ReadingContext,
): boolean {
  const normalizedCandidate = normalize(candidate);
  if (!normalizedCandidate) return false;
  const writtenContext = [
    question,
    conversation?.initialQuestion,
    ...(conversation?.previousQuestions ?? []),
  ].filter((value): value is string => Boolean(value)).join("\n");
  if (normalize(writtenContext).includes(normalizedCandidate)) return true;
  return (conversation?.previousContract?.candidates ?? [])
    .some((previous) => normalize(previous) === normalizedCandidate);
}

/**
 * The planner owns all semantic decisions. This function only checks that the
 * returned structure is internally consistent and that explicit candidates
 * came from user-visible conversation text rather than being invented early.
 */
export function enforcePlanQuality(
  plan: ReadingPlan,
  context: { question: string; language: ReadingLanguage; conversation?: ReadingContext },
): ReadingPlan {
  const { answerContract: contract } = plan;
  if (!unique(plan.positions.map((position) => position.id))) {
    throw new Error("positions의 id는 서로 달라야 한다.");
  }
  if (!unique(plan.positions.map((position) => position.title))) {
    throw new Error("각 카드 자리는 서로 다른 역할을 가져야 한다.");
  }
  if (!unique(contract.candidates)) {
    throw new Error("answerContract.candidates에 중복된 후보를 넣지 말아야 한다.");
  }

  if (!CANDIDATE_KINDS.has(contract.kind)) return plan;

  if (plan.cardCount !== contract.candidates.length) {
    throw new Error("명시 후보형 질문은 후보마다 카드 한 장을 배정해야 한다.");
  }
  if (contract.kind !== "yes_no") {
    const unsourced = contract.candidates.find((candidate) => (
      !candidateHasSource(candidate, context.question, context.conversation)
    ));
    if (unsourced) {
      throw new Error(`후보 "${unsourced}"는 현재 질문이나 앞선 대화에서 사용자가 제시한 표현이어야 한다.`);
    }
  }
  contract.candidates.forEach((candidate, index) => {
    const position = plan.positions[index];
    if (!position || !normalize(`${position.title} ${position.focus}`).includes(normalize(candidate))) {
      throw new Error(`후보 "${candidate}"에 대응하는 카드 자리에는 해당 후보 이름을 포함해야 한다.`);
    }
  });
  return plan;
}

function contractIssues(
  result: ReadingResult,
  contract: AnswerContract,
): string[] {
  const issues: string[] = [];
  const verdict = result.verdict;
  if (!verdict) return ["answerContract를 실행한 verdict가 필요하다."];
  if (verdict.kind !== contract.kind) {
    issues.push("verdict.kind는 plan의 answerContract.kind와 같아야 한다.");
  }
  if (result.summary.trim().startsWith(verdict.statement.trim())) {
    issues.push("summary는 별도 표시되는 verdict.statement를 되풀이하지 말아야 한다.");
  }
  if ((contract.kind === "choose_one" || contract.kind === "yes_no")
    && !contract.candidates.some((candidate) => normalize(candidate) === normalize(verdict.value))) {
    issues.push("명시 선택의 verdict.value는 제공된 후보 중 정확히 하나여야 한다.");
  }
  if (contract.kind === "compare") {
    const comparisonText = normalize(`${verdict.statement} ${result.summary}`);
    if (contract.candidates.some((candidate) => !comparisonText.includes(normalize(candidate)))) {
      issues.push("비교 답변의 첫 부분에는 모든 후보를 직접 언급해야 한다.");
    }
  }
  return issues;
}

function visibleSections(result: ReadingResult): string[] {
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

/**
 * Runtime validation is deliberately domain-neutral. It verifies references,
 * answer-contract execution and schema hygiene; it never decides what the
 * user's question means or which vocabulary belongs to a topic.
 */
export function enforceReadingQuality(
  result: ReadingResult,
  context: {
    expectedCards?: ExpectedInterpretation[];
    answerContract?: AnswerContract;
  },
): ReadingResult {
  const issues: string[] = [];
  const expectedCards = context.expectedCards ?? [];

  if (expectedCards.length > 0 && result.cardInterpretations.length !== expectedCards.length) {
    issues.push(`cardInterpretations는 정확히 ${expectedCards.length}개여야 한다.`);
  }
  expectedCards.forEach((expected, index) => {
    const actual = result.cardInterpretations[index];
    if (!actual
      || actual.cardId !== expected.cardId
      || actual.positionTitle !== expected.positionTitle
      || actual.orientation !== expected.orientation) {
      issues.push(`cardInterpretations[${index}]의 카드 ID, 자리, 방향이 plan과 일치해야 한다.`);
      return;
    }
    if (!actual.reasoning) {
      issues.push(`${expected.cardName} 해석에는 원뜻, 질문 연결, 결론 영향이 모두 필요하다.`);
      return;
    }
    if (actual.text.trim().length < 10
      || actual.reasoning.questionConnection.trim().length < 20
      || actual.reasoning.decisionImpact.trim().length < 15) {
      issues.push(`${expected.cardName}의 카드 원뜻과 질문 결론 사이의 연결을 구체적으로 설명해야 한다.`);
    }
  });

  if (context.answerContract) issues.push(...contractIssues(result, context.answerContract));

  const expectedIds = new Set(expectedCards.map((card) => card.cardId));
  for (const axis of result.axes) {
    if (axis.evidenceCardIds.some((cardId) => !expectedIds.has(cardId))) {
      issues.push("axes.evidenceCardIds에는 이번 해석에 사용된 카드 ID만 넣어야 한다.");
      break;
    }
  }

  const sections = visibleSections(result);
  const visibleText = sections.join("\n");
  const leaked = visibleText.match(INTERNAL_SCHEMA_TERM)?.[0];
  if (leaked) issues.push(`내부 JSON 키 "${leaked}"를 사용자 문장에 쓰지 말아야 한다.`);
  const normalizedSummary = normalize(result.summary);
  const normalizedSynthesis = normalize(result.synthesis);
  if (normalizedSummary.length > 40
    && normalizedSummary === normalizedSynthesis) {
    issues.push("summary와 synthesis에 같은 문장을 그대로 반복하지 말아야 한다.");
  }

  if (issues.length > 0) throw new Error(issues.join(" "));
  return result;
}

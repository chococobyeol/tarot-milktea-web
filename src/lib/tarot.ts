import cardData from "@/src/data/tarot-cards.ko.json";
import imageManifest from "@/assets/cards/manifest.json";

export type Arcana = "major" | "minor";
export type Orientation = "upright" | "reversed";

export interface CardMeaning {
  keywords: string[];
  summary: string;
  caution: string;
}

export interface TarotCard {
  id: string;
  nameKo: string;
  nameEn: string;
  arcana: Arcana;
  number?: number;
  suit?: "wands" | "cups" | "swords" | "pentacles";
  rank?: string;
  upright: CardMeaning;
  reversed: CardMeaning;
  contexts: {
    relationship: string;
    work: string;
    decision: string;
    self: string;
  };
  imageUrl: string;
}

export interface DeckCard {
  cardId: string;
  reversed: boolean;
  order: number;
}

export interface ReadingPosition {
  id: string;
  title: string;
  focus: string;
}

export interface ReadingPlan {
  cardCount: number;
  interpretationFrame: string;
  selectionGuide: string;
  positions: ReadingPosition[];
}

export interface SelectedCard {
  cardId: string;
  reversed: boolean;
  positionId: string;
  positionTitle: string;
  positionFocus: string;
  round: number;
}

export interface CardInterpretation {
  cardId: string;
  positionTitle: string;
  orientation: Orientation;
  text: string;
  reasoning?: {
    sourceMeaning: string;
    questionConnection: string;
    decisionImpact: string;
  };
  evidence: string[];
}

export interface ReadingAxis {
  label: string;
  score: number;
  evidence: string;
  evidenceCardIds: string[];
}

export interface ReadingSignals {
  support: number;
  caution: number;
  uncertainty: number;
}

export interface ReadingResult {
  summary: string;
  cardInterpretations: CardInterpretation[];
  synthesis: string;
  guidance: string[];
  axes: ReadingAxis[];
  signals: ReadingSignals;
  limitation: string;
}

export interface FollowupRecord {
  id: string;
  question: string;
  addedCards: SelectedCard[];
  previousResult: ReadingResult;
  result: ReadingResult;
  createdAt: string;
}

export type QuestionCategory = "relationship" | "work" | "decision" | "self";
export type ReadingLanguage = "ko" | "en";

const fileByTitle = new Map(
  imageManifest.assets
    .filter((asset) => asset.title !== "밀크티")
    .map((asset) => [asset.title, asset.fileName]),
);

export const TAROT_CARDS: TarotCard[] = cardData.cards.map((raw) => {
  const fileName = fileByTitle.get(raw.nameKo);
  if (!fileName) throw new Error(`카드 이미지가 없습니다: ${raw.nameKo}`);

  return {
    ...(raw as Omit<TarotCard, "imageUrl">),
    imageUrl: `/cards/by-id/${raw.id}.png`,
  };
});

export const CARD_BY_ID = new Map(TAROT_CARDS.map((card) => [card.id, card]));

export const MILK_TEA_IMAGE = "/milk-tea.png";

export function getCard(cardId: string): TarotCard {
  const card = CARD_BY_ID.get(cardId);
  if (!card) throw new Error(`알 수 없는 카드 ID: ${cardId}`);
  return card;
}

function randomUnit(): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] / 0x1_0000_0000;
  }
  return Math.random();
}

export function createSessionDeck(): DeckCard[] {
  const deck = TAROT_CARDS.map((card, index) => ({
    cardId: card.id,
    reversed: randomUnit() < 0.5,
    order: index,
  }));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }

  return deck.map((item, order) => ({ ...item, order }));
}

export function detectQuestionCategory(question: string): QuestionCategory {
  const normalized = question.toLowerCase();
  if (/관계|연애|사랑|상대|친구|가족|마음|연락|재회|relationship|romance|love|partner|friend|family|reconnect/.test(normalized)) return "relationship";
  if (/직장|이직|취업|일|진로|학업|시험|프로젝트|사업|돈|재정|career|job|work|study|exam|project|business|money|finance/.test(normalized)) return "work";
  if (/선택|결정|비교|어느|할까|해야|고려|장단점|진행|choose|choice|decision|compare|option|pros|cons/.test(normalized)) return "decision";
  return "self";
}

function requestedCardCount(question: string, followup: boolean): number {
  const trimmed = question.trim();
  let count = 2;
  if (trimmed.length >= 35) count = 3;
  if (trimmed.length >= 80) count = 4;
  if (trimmed.length >= 150) count = 5;
  if (/둘|두 가지|비교|선택지|A와|B와|vs|어느 쪽|two|compare|option|which/i.test(trimmed)) count = Math.max(count, 4);
  if (/전체|복합|장기|여러|동시에|전반|overall|complex|long.?term|multiple/i.test(trimmed)) count = Math.max(count, 3);
  if (/한 가지|하나만|핵심만|오늘|one thing|single|today/i.test(trimmed)) count = 1;
  if (followup && trimmed.length < 45 && !/비교|여러|전체|compare|multiple|overall/i.test(trimmed)) count = Math.min(count, 2);
  return Math.max(1, Math.min(5, count));
}

const POSITION_LIBRARY: Record<QuestionCategory, ReadingPosition[]> = {
  relationship: [
    { id: "pattern", title: "현재 관계의 패턴", focus: "지금 반복되는 상호작용과 감정의 구조" },
    { id: "other", title: "상대·외부 영향", focus: "상대의 반응 또는 관계에 개입하는 외부 조건" },
    { id: "self", title: "질문자의 대응", focus: "현재 선택과 태도가 관계에 미치는 영향" },
    { id: "friction", title: "핵심 마찰", focus: "관계를 어렵게 만드는 불일치와 주의점" },
    { id: "direction", title: "조정 방향", focus: "관계를 현실적으로 다루기 위한 다음 기준" },
  ],
  work: [
    { id: "status", title: "현재 조건", focus: "일·진로 문제에서 이미 확보한 자원과 제약" },
    { id: "opportunity", title: "활용할 가능성", focus: "성장이나 변화에 도움이 되는 기회" },
    { id: "risk", title: "주의할 위험", focus: "성과를 방해할 수 있는 내부·외부 변수" },
    { id: "environment", title: "외부 환경", focus: "조직, 일정, 사람과 시장 조건의 영향" },
    { id: "action", title: "다음 행동", focus: "지금 실행할 수 있는 우선순위와 준비" },
  ],
  decision: [
    { id: "criterion", title: "핵심 판단 기준", focus: "이번 선택에서 가장 먼저 비교해야 할 요소" },
    { id: "gain", title: "선택이 주는 이점", focus: "진행했을 때 얻을 수 있는 변화와 자원" },
    { id: "cost", title: "선택의 비용", focus: "감수해야 할 부담과 포기해야 하는 요소" },
    { id: "unknown", title: "숨은 변수", focus: "현재 판단에서 빠져 있거나 불확실한 조건" },
    { id: "action", title: "실행 기준", focus: "결정 전 확인할 정보와 다음 행동" },
  ],
  self: [
    { id: "state", title: "현재 상태", focus: "질문에 반영된 감정과 현실 조건" },
    { id: "cause", title: "주요 원인", focus: "현재 상태를 유지시키는 패턴이나 외부 요인" },
    { id: "resource", title: "활용할 자원", focus: "회복과 변화에 사용할 수 있는 강점" },
    { id: "adjustment", title: "조정할 부분", focus: "줄이거나 다르게 다뤄야 할 태도와 환경" },
    { id: "direction", title: "다음 방향", focus: "현실적으로 시도할 수 있는 다음 단계" },
  ],
};

const POSITION_LIBRARY_EN: Record<QuestionCategory, ReadingPosition[]> = {
  relationship: [
    { id: "pattern", title: "Current pattern", focus: "Repeated interactions and the present emotional structure" },
    { id: "other", title: "Other influences", focus: "The other person's response or outside conditions affecting the relationship" },
    { id: "self", title: "Your response", focus: "How current choices and attitude affect the relationship" },
    { id: "friction", title: "Core friction", focus: "Misalignment and cautions making the relationship difficult" },
    { id: "direction", title: "Adjustment", focus: "The next practical criterion for handling the relationship" },
  ],
  work: [
    { id: "status", title: "Current conditions", focus: "Resources and constraints already present in work or career" },
    { id: "opportunity", title: "Usable opportunity", focus: "Opportunities that could support growth or change" },
    { id: "risk", title: "Risk to watch", focus: "Internal or external variables that could obstruct progress" },
    { id: "environment", title: "External environment", focus: "Effects of the organization, schedule, people, and market" },
    { id: "action", title: "Next action", focus: "A practical priority and preparation step" },
  ],
  decision: [
    { id: "criterion", title: "Decision criterion", focus: "The first factor to compare in this decision" },
    { id: "gain", title: "Potential gain", focus: "Change and resources the choice could provide" },
    { id: "cost", title: "Cost of the choice", focus: "The burden or tradeoff that must be accepted" },
    { id: "unknown", title: "Hidden variable", focus: "Missing or uncertain conditions in the current judgment" },
    { id: "action", title: "Action threshold", focus: "Information to confirm and the next step before deciding" },
  ],
  self: [
    { id: "state", title: "Current state", focus: "Emotional and practical conditions reflected in the question" },
    { id: "cause", title: "Primary cause", focus: "Patterns or outside factors maintaining the current state" },
    { id: "resource", title: "Available resource", focus: "Strengths available for recovery and change" },
    { id: "adjustment", title: "What to adjust", focus: "Attitudes and conditions to reduce or handle differently" },
    { id: "direction", title: "Next direction", focus: "A realistic next step to try" },
  ],
};

export function designReading(question: string, followup = false, language: ReadingLanguage = "ko"): ReadingPlan {
  const category = detectQuestionCategory(question);
  const cardCount = requestedCardCount(question, followup);
  const positions = (language === "ko" ? POSITION_LIBRARY : POSITION_LIBRARY_EN)[category].slice(0, cardCount).map((position, index) => ({
    ...position,
    id: `${followup ? "followup" : "initial"}-${index + 1}-${position.id}`,
  }));

  const categoryFrame = (language === "ko" ? {
    relationship: "관계의 상호작용과 조정 가능성을 중심으로",
    work: "현실 조건, 성장 가능성과 실행 위험을 중심으로",
    decision: "선택의 이점·비용과 확인할 변수를 중심으로",
    self: "현재 상태, 원인과 조정 방향을 중심으로",
  } : {
    relationship: "Focusing on relationship dynamics and practical adjustment",
    work: "Focusing on current conditions, growth potential, and execution risk",
    decision: "Focusing on benefits, costs, and variables that still need confirmation",
    self: "Focusing on the current state, causes, and possible adjustment",
  })[category];

  return {
    cardCount,
    interpretationFrame: language === "ko" ? `${categoryFrame} ${cardCount}장의 카드를 분석합니다.` : `${categoryFrame}, using ${cardCount} card${cardCount === 1 ? "" : "s"}.`,
    selectionGuide: language === "ko" ? `아래 카드 중 ${cardCount}장을 선택하세요. 선택 순서대로 각 자리에 배치됩니다.` : `Select ${cardCount} card${cardCount === 1 ? "" : "s"} below. Cards are assigned by selection order.`,
    positions,
  };
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clampScore(value: number): number {
  return Math.max(12, Math.min(92, Math.round(value)));
}

function contextFor(card: TarotCard, category: QuestionCategory): string {
  return card.contexts[category];
}

function withParticle(value: string, withFinal: string, withoutFinal: string): string {
  const last = value.trim().at(-1);
  if (!last) return value;
  const code = last.charCodeAt(0) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${value}${hasFinal ? withFinal : withoutFinal}`;
}

function axisLabels(category: QuestionCategory, language: ReadingLanguage): string[] {
  return (language === "ko" ? {
    relationship: ["상호성", "소통 명확성", "관계 안정성", "변화 압력"],
    work: ["실행 가능성", "성장성", "기반 안정성", "외부 변수"],
    decision: ["실행성", "장기 안정", "변화 효과", "불확실성"],
    self: ["회복 자원", "상황 인식", "행동 여력", "조정 필요도"],
  } : {
    relationship: ["Reciprocity", "Communication", "Stability", "Pressure to change"],
    work: ["Feasibility", "Growth", "Foundation", "External variables"],
    decision: ["Feasibility", "Long-term stability", "Impact", "Uncertainty"],
    self: ["Recovery resources", "Situation awareness", "Capacity to act", "Need to adjust"],
  })[category];
}

export function generateReadingResult(
  question: string,
  selectedCards: SelectedCard[],
  previous?: ReadingResult,
  language: ReadingLanguage = "ko",
): ReadingResult {
  const category = detectQuestionCategory(question);
  const latestRound = Math.max(...selectedCards.map((card) => card.round));
  const latestCards = previous
    ? selectedCards.filter((card) => card.round === latestRound)
    : selectedCards;
  const cardInterpretations = latestCards.map((selected) => {
    const card = getCard(selected.cardId);
    const orientation: Orientation = selected.reversed ? "reversed" : "upright";
    const meaning = card[orientation];
    return language === "ko" ? {
      cardId: card.id,
      positionTitle: selected.positionTitle,
      orientation,
      text: `${selected.positionTitle}에서는 ${meaning.keywords[0]} 신호를 기준으로 ${selected.positionFocus}을 확인한다.`,
      reasoning: {
        sourceMeaning: `${card.nameKo} ${orientation === "upright" ? "정방향" : "역방향"}은 ${meaning.summary}`,
        questionConnection: `${selected.positionTitle} 자리는 ${selected.positionFocus}을 살핀다. 이 카드의 ${meaning.keywords.slice(0, 2).join("·")} 신호를 질문과 연결하면 ${withParticle(contextFor(card, category), "을", "를")} 사실과 구분해 확인해야 한다.`,
        decisionImpact: `${meaning.caution} 이 주의점을 확인하기 전에는 카드 한 장만으로 질문의 결과를 확정하지 않는다.`,
      },
      evidence: [`${orientation === "upright" ? "정방향" : "역방향"} · ${meaning.keywords.slice(0, 2).join(" · ")}`, `자리 · ${selected.positionTitle}`],
    } : {
      cardId: card.id,
      positionTitle: selected.positionTitle,
      orientation,
      text: `${card.nameEn} in the ${selected.positionTitle} position indicates that ${selected.positionFocus.toLowerCase()} should be checked against concrete conditions rather than treated as a fixed prediction.`,
      reasoning: {
        sourceMeaning: `${card.nameEn} ${orientation === "upright" ? "upright" : "reversed"}: ${meaning.summary}`,
        questionConnection: `The ${selected.positionTitle} position examines ${selected.positionFocus.toLowerCase()}. The card's ${meaning.keywords.slice(0, 2).join(" and ")} themes identify what must be checked in the question.`,
        decisionImpact: `${meaning.caution} Treat this as a condition on the decision, not a fixed prediction.`,
      },
      evidence: [`${orientation === "upright" ? "Upright" : "Reversed"} · ${meaning.keywords.slice(0, 2).join(" · ")}`, `Position · ${selected.positionTitle}`],
    };
  });

  const uprightCount = latestCards.filter((card) => !card.reversed).length;
  const reversedCount = latestCards.length - uprightCount;
  const baseSupport = 38 + (uprightCount / Math.max(latestCards.length, 1)) * 32;
  const uncertaintySeed = hashText(question) % 13;
  const uncertainty = Math.max(12, Math.min(32, 18 + uncertaintySeed + reversedCount * 2));
  const support = Math.max(20, Math.min(68, Math.round(baseSupport - reversedCount * 2)));
  const caution = 100 - support - uncertainty;

  const firstSelected = latestCards[0];
  const lastSelected = latestCards[latestCards.length - 1];
  const first = getCard(firstSelected.cardId);
  const last = getCard(lastSelected.cardId);
  const firstMeaning = first[firstSelected.reversed ? "reversed" : "upright"];
  const lastMeaning = last[lastSelected.reversed ? "reversed" : "upright"];
  const leaning = language === "ko"
    ? (support >= caution + 12 ? "진행을 지지하는 신호가 상대적으로 크다" : caution > support ? "주의 신호를 먼저 다뤄야 한다" : "진행과 주의 신호가 비슷해 조건 확인이 우선이다")
    : (support >= caution + 12 ? "Signals supporting progress are relatively stronger" : caution > support ? "Caution signals should be handled first" : "Support and caution are close, so conditions should be verified first");

  const summary = language === "ko" ? (latestCards.length === 1
    ? `${leaning}. ${first.nameKo}의 ${firstMeaning.keywords[0]} 신호를 중심으로, 결과 예측보다 현재 확인할 기준과 실행 조건을 분리하는 해석이 적절하다.`
    : `${leaning}. ${first.nameKo}의 ${firstMeaning.keywords[0]}과 ${last.nameKo}의 ${lastMeaning.keywords[0]}이 함께 나타나므로, 단순한 결과 예측보다 질문에서 확인해야 할 기준과 실행 조건을 분리하는 해석이 적절하다.`)
    : (latestCards.length === 1
      ? `${leaning}. ${first.nameEn} suggests separating the criteria to verify from the conditions required for action instead of treating the card as an outcome prediction.`
      : `${leaning}. ${first.nameEn} and ${last.nameEn} appear together, so the reading should separate the criteria to verify from the conditions required for action instead of predicting a simple result.`);

  const synthesis = language === "ko" ? (latestCards.length === 1
    ? `${firstMeaning.summary} 이 카드가 맡은 ${firstSelected.positionTitle}의 관점에서, 현재 상황을 유지할지 바꿀지보다 어떤 조건이 충족될 때 움직일지를 먼저 정하는 편이 일관된다.`
    : `카드 흐름은 ${first.nameKo}에서 시작해 ${last.nameKo}로 이어진다. 초반에는 ${firstMeaning.summary} 이후에는 ${lastMeaning.summary} 따라서 현재 상황을 유지할지 바꿀지보다, 어떤 조건이 충족될 때 움직일지를 먼저 정하는 편이 일관된다.`)
    : (latestCards.length === 1
      ? `${first.nameEn} occupies the ${firstSelected.positionTitle} position. Define the conditions that would justify action before deciding whether to maintain or change the current situation.`
      : `The sequence moves from ${first.nameEn} to ${last.nameEn}. Define the conditions that would justify action before deciding whether to maintain or change the current situation.`);

  const labels = previous?.axes.map((axis) => axis.label) ?? axisLabels(category, language);
  const axes = labels.slice(0, 5).map((label, index) => {
    const card = latestCards[index % latestCards.length];
    const tarot = getCard(card.cardId);
    const directionFactor = card.reversed ? -9 : 7;
    const previousBase = previous?.axes.find((axis) => axis.label === label)?.score;
    const raw = previousBase == null
      ? 46 + (hashText(`${question}-${label}-${tarot.id}`) % 31) + directionFactor
      : previousBase + (hashText(`${label}-${tarot.id}-${selectedCards.length}`) % 19) - 9 + directionFactor / 2;
    const score = clampScore(raw);
    return {
      label,
      score,
      evidence: language === "ko"
        ? `${tarot.nameKo} ${card.reversed ? "역방향" : "정방향"}의 ${tarot[card.reversed ? "reversed" : "upright"].keywords[0]} 신호를 중심으로 산정했다.`
        : `Calculated from ${tarot.nameEn} in the ${card.reversed ? "reversed" : "upright"} orientation and its position in the spread.`,
      evidenceCardIds: [tarot.id],
    };
  });

  const guidance = language === "ko" ? latestCards
    .map((selected) => getCard(selected.cardId)[selected.reversed ? "reversed" : "upright"].caution)
    .filter((item, index, array) => array.indexOf(item) === index)
    .slice(0, 4) : [
      "Separate facts already confirmed from assumptions that still require evidence.",
      "Set an action threshold before treating a favorable signal as a decision.",
      "Review the reversed cards as constraints or delays rather than fixed negative outcomes.",
    ].slice(0, Math.max(2, Math.min(4, latestCards.length + 1)));

  return {
    summary,
    cardInterpretations,
    synthesis,
    guidance,
    axes,
    signals: { support, caution, uncertainty },
    limitation: language === "ko" ? "이 수치는 실제 사건의 확률이 아니라 질문과 카드 관계를 정규화한 AI 해석 지표다. 확인되지 않은 타인의 감정이나 미래 결과를 사실로 확정하지 않는다." : "These values are normalized AI interpretation indicators, not probabilities of real events. They do not establish another person's unverified feelings or a future outcome as fact.",
  };
}

export function orientationLabel(reversed: boolean, language: ReadingLanguage = "ko"): string {
  if (language === "en") return reversed ? "Reversed" : "Upright";
  return reversed ? "역방향" : "정방향";
}

export function createRecordId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

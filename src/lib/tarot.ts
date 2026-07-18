import cardData from "@/src/data/tarot-cards.ko.json";
import imageManifest from "@/assets/cards/manifest.json";

export type Arcana = "major" | "minor";
export type Orientation = "upright" | "reversed";
export type ReadingLanguage = "ko" | "en";
export type AnswerKind =
  | "choose_one"
  | "recommend_one"
  | "yes_no"
  | "outcome"
  | "compare"
  | "forecast"
  | "advice"
  | "explain"
  | "analysis";

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

export interface AnswerContract {
  kind: AnswerKind;
  subject: string;
  candidates: string[];
  constraints?: string[];
  answerInstruction?: string;
}

export interface ReadingPlan {
  cardCount: number;
  interpretationFrame: string;
  selectionGuide: string;
  positions: ReadingPosition[];
  answerContract: AnswerContract;
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

export interface ReadingVerdict {
  kind: AnswerKind;
  value: string;
  statement: string;
}

export interface ReadingResult {
  verdict?: ReadingVerdict;
  summary: string;
  cardInterpretations: CardInterpretation[];
  synthesis: string;
  guidance: string[];
  axes: ReadingAxis[];
  signals: ReadingSignals;
}

export interface FollowupRecord {
  id: string;
  question: string;
  addedCards: SelectedCard[];
  previousResult: ReadingResult;
  result: ReadingResult;
  plan?: ReadingPlan;
  createdAt: string;
}

export interface ReadingContext {
  initialQuestion?: string;
  previousQuestions?: string[];
  previousAnswer?: string;
  previousContract?: AnswerContract;
  recentRecommendations?: string[];
}

const imageTitles = new Set(
  imageManifest.assets
    .filter((asset) => asset.title !== "밀크티")
    .map((asset) => asset.title),
);

export const TAROT_CARDS: TarotCard[] = cardData.cards.map((raw) => {
  if (!imageTitles.has(raw.nameKo)) throw new Error(`카드 이미지가 없습니다: ${raw.nameKo}`);
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

export function orientationLabel(reversed: boolean, language: ReadingLanguage = "ko"): string {
  if (language === "en") return reversed ? "Reversed" : "Upright";
  return reversed ? "역방향" : "정방향";
}

export function createRecordId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

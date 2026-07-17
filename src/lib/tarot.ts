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

export type QuestionCategory = "relationship" | "work" | "decision" | "self";
export type ReadingLanguage = "ko" | "en";
export type BinaryChoices = [string, string];
export type AnswerKind = "choose_one" | "recommend_one" | "yes_no" | "outcome" | "compare" | "forecast" | "advice" | "explain" | "analysis";

export interface AnswerContract {
  kind: AnswerKind;
  subject: string;
  candidates: string[];
  decisive: boolean;
}

export interface ReadingVerdict {
  kind: AnswerKind;
  value: string;
  statement: string;
}

export interface ReadingContext {
  initialQuestion?: string;
  previousQuestions?: string[];
  previousAnswer?: string;
  previousContract?: AnswerContract;
}

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

function cleanChoiceLabel(value: string): string {
  return value
    .trim()
    .replace(/^["'“”‘’([{]+|["'“”‘’\])}]+$/g, "")
    .replace(/^(?:or|또는|혹은|아니면)\s+/iu, "")
    .replace(/^(?:오늘|지금|이번(?:에는|엔)?|나는|내가|제가)\s+/u, "")
    .replace(/(?:을|를|은|는)$/u, "")
    .trim();
}

function questionSegments(question: string): string[] {
  return question
    .split(/\n(?:추가 질문\s*\d+|follow-up question\s*\d+)\s*:\s*/iu)
    .map((segment) => segment.replace(/^(?:처음 질문|initial question)\s*:\s*/iu, "").trim())
    .filter(Boolean);
}

function koreanCopula(value: string): string {
  const last = value.at(-1);
  if (!last) return `${value}예요`;
  const code = last.charCodeAt(0) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${value}${hasFinal ? "이에요" : "예요"}`;
}

function extractBinaryChoicesFromSegment(scope: string): BinaryChoices | null {
  const repeatedPredicate = scope.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,35}?)(?:을|를)?\s+(먹을지|고를지|선택할지|할지)\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,35}?)(?:을|를)?\s+\2/u,
  );
  const repeatedQuestion = scope.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,35}?)(?:을|를)?\s+(먹을까|고를까|선택할까|할까)\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,35}?)(?:을|를)?\s+\2/u,
  );
  const amongChoices = scope.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)(?:이랑|랑|와|과)\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)\s+중/u,
  );
  const comparisonChoices = scope.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)(?:이랑|랑|와|과)\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)(?:의)?\s+(?:차이|장단점|비교)/u,
  );
  const alternativeChoices = scope.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)\s+아니면\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)\s+(?:뭐|무엇|어느|어떤)/u,
  );
  const versusChoices = scope.match(
    /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)\s+(?:vs\.?|대)\s+([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&+_-]{0,29}?)(?:[?.!]|$)/iu,
  );
  const englishChoices = scope.match(
    /\b(?:choose|pick|have|eat)\s+([^?.,]{1,30}?)\s+or\s+([^?.,]{1,30}?)(?:[?.!]|$)/iu,
  );
  const englishShouldChoices = scope.match(
    /\b(?:should|shall)\s+i\s+([^?.,:;—–-]{1,30}?)\s+or\s+([^?.,:;—–-]{1,30}?)(?:[?.!]|$)/iu,
  );
  const englishTrailingChoices = scope.match(
    /(?:^|[?:]\s*)([^?.,:;—–-]{1,30}?)\s+or\s+([^?.,:;—–-]{1,30}?)\s*(?:[—–,:-]\s*)?which(?:\s+one)?\s+(?:should\s+i\s+)?(?:choose|pick)/iu,
  );
  const englishComparisonChoices = scope.match(
    /\bcompare\s+([^?.,:;—–-]{1,30}?)\s+(?:and|with|versus|vs\.?)\s+([^?.,:;—–-]{1,30}?)(?:[?.!]|$)/iu,
  );
  const matched = repeatedPredicate
    ? [repeatedPredicate[1], repeatedPredicate[3]]
    : repeatedQuestion
      ? [repeatedQuestion[1], repeatedQuestion[3]]
      : amongChoices
        ? [amongChoices[1], amongChoices[2]]
        : comparisonChoices
          ? [comparisonChoices[1], comparisonChoices[2]]
          : alternativeChoices
            ? [alternativeChoices[1], alternativeChoices[2]]
            : versusChoices
              ? [versusChoices[1], versusChoices[2]]
              : englishShouldChoices
                ? [englishShouldChoices[1], englishShouldChoices[2]]
                : englishTrailingChoices
                  ? [englishTrailingChoices[1], englishTrailingChoices[2]]
                  : englishComparisonChoices
                    ? [englishComparisonChoices[1], englishComparisonChoices[2]]
                    : englishChoices
                      ? [englishChoices[1], englishChoices[2]]
                      : null;
  if (!matched) return null;

  const choices = matched.map(cleanChoiceLabel) as BinaryChoices;
  if (choices.some((choice) => choice.length < 1 || choice.length > 24) || choices[0] === choices[1]) return null;
  return choices;
}

function extractListedChoicesFromSegment(scope: string): string[] | null {
  const koreanList = scope.match(
    /(?:^|[?:]\s*)([^?!\n]{3,140}?)\s+중(?:에서)?\s*(?:하나|한 가지|어느|어떤|어디|뭐|무엇|골라|선택|추천|비교|차이)/iu,
  );
  const englishList = scope.match(
    /\b(?:choose|pick|compare|which(?:\s+one)?(?:\s+of)?)\s+(?:between\s+)?([^?!\n]{3,140}?)(?:[?.!]|$)/iu,
  );
  const englishTrailingList = scope.match(
    /(?:^|[?:]\s*)([^?!\n]{3,140}?)\s*:\s*which(?:\s+one)?\s+(?:should\s+i\s+)?(?:choose|pick)/iu,
  );
  const raw = koreanList?.[1] ?? englishTrailingList?.[1] ?? englishList?.[1];
  if (!raw) return null;
  const separators = /\s*(?:,|\/|·|;|\s+(?:또는|혹은|아니면|or)\s+)\s*/iu;
  let pieces = raw.split(separators);
  if (pieces.length < 2 && /(?:와|과)\s+/u.test(raw)) {
    pieces = raw.split(/(?:와|과)\s+/u);
  }
  const choices = pieces
    .map((piece, index) => cleanChoiceLabel(index === 0
      ? piece
        .replace(/^.*?:\s*/u, "")
        .replace(/^[^,;/·]{1,30}?(?:은|는)\s+/u, "")
      : piece))
    .filter((choice) => choice.length >= 1 && choice.length <= 28);
  if (choices.length < 2 || choices.length > 5) return null;
  if (new Set(choices.map((choice) => choice.toLowerCase())).size !== choices.length) return null;
  return choices;
}

export function extractChoiceCandidates(question: string): string[] | null {
  const segments = questionSegments(question);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const choices = extractListedChoicesFromSegment(segments[index])
      ?? extractBinaryChoicesFromSegment(segments[index]);
    if (choices) return choices;
  }
  return null;
}

export function extractBinaryChoices(question: string): BinaryChoices | null {
  const choices = extractChoiceCandidates(question);
  return choices?.length === 2 ? [choices[0], choices[1]] : null;
}

function latestQuestion(question: string): string {
  return questionSegments(question).at(-1) ?? question.trim();
}

function refersToPriorDecision(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  const explicitReference = /결론(?:은|이)?|(?:뭐|무엇|어느)\s*(?:가|이)?\s*답|정확히.{0,12}하나만|하나만\s*(?:말|골라|정해)|둘 중|그중|어느\s*(?:쪽|걸|것)|뭘\s*(?:골라|선택|정해)|무엇으로|뭘로|(?:먹|입|고르|선택|하)라는\s*(?:거|것)|which one|so which|exactly which|between them/iu.test(normalized);
  const introducesNewTarget = /(?:새로운|새|다른|별도(?:의|로)?|이번엔|이번에는).{0,24}(?:추천|골라|선택|정해|뭐|무엇|무슨|어떤|메뉴|식사|책|작품|영화|노래|옷|코디|장소|선물)|(?:추천|골라|선택|정해).{0,18}(?:새로운|새|다른|별도)/u.test(normalized);
  if (introducesNewTarget) return false;
  if (explicitReference) return true;
  const startsAsContinuation = /^(?:그래서|그럼|그러면|결국)(?:\s|[,.:!?]|$)/u.test(normalized);
  const asksAboutAnotherTimeOrDomain = /(?:내일|모레|다음\s*(?:날|주|달)).{0,24}(?:뭐|무엇|무슨|어떤)|(?:뭐|무엇|무슨|어떤).{0,18}(?:입|읽|살|갈|할).{0,10}(?:좋|추천)/u.test(normalized);
  return startsAsContinuation && !asksAboutAnotherTimeOrDomain;
}

export function isOpenRecommendationQuestion(question: string): boolean {
  const normalized = question.trim().toLowerCase();
  return /추천(?:해|해줘|해주세요|받|할)/iu.test(normalized)
    || /(?:뭐|뭘|뭐를|무엇|무슨|어떤).{0,36}(?:좋을까|나을까|먹(?:을까|어|지|으라(?:는)?(?:\s*건데)?)|입(?:을까|어|지)|살까|사야|읽(?:을까|어|지)|보(?:을까|자)|볼까|봐야|듣(?:어|지|자)|들(?:을까|어|을지|으면|자)|갈까|가야|고를까|골라|선택할까|선택해|주문할까|주문해|하(?:지|자|면\s*좋|는\s*게\s*좋)|할까|해야)/iu.test(normalized)
    || /어디(?:로|를|에)?\s*(?:갈까|가야|갈지|가면\s*좋|가자|추천)/iu.test(normalized)
    || /recommend|(?:what|which)\s+(?:book|movie|menu|meal|outfit|option|one)?\s*should\s+i\s+(?:eat|wear|buy|read|watch|choose|pick)|what\s+should\s+i\s+(?:eat|wear|buy|read|watch)|where\s+should\s+i\s+go|pick\s+(?:for|me)/iu.test(normalized);
}

export function createAnswerContract(
  question: string,
  context?: ReadingContext,
  language: ReadingLanguage = "ko",
): AnswerContract {
  const current = latestQuestion(question);
  const inherited = context?.previousContract;
  const contextualQuestions = [
    context?.initialQuestion,
    ...(context?.previousQuestions ?? []),
  ].filter((value): value is string => Boolean(value));
  const inheritedCandidates = inherited
    && ["choose_one", "yes_no", "compare"].includes(inherited.kind)
    && inherited.candidates.length
    && inherited.candidates.length <= 5
    ? [...inherited.candidates]
    : null;
  const explicitChoices = extractChoiceCandidates(current)
    ?? (refersToPriorDecision(current)
      ? (inheritedCandidates ?? extractChoiceCandidates(contextualQuestions.join("\n")))
      : null);
  const normalized = current.toLowerCase();
  const asksForExplanation = /왜|이유|원인|어째서|why|reason|cause/iu.test(normalized);
  const asksForChoice = /골라|선택|정해|어느\s*쪽|뭘로|무엇으로|하나만|pick|choose|which\s+(?:one|option)|decide/iu.test(normalized);
  const asksToCompare = /비교|차이|장단점|compare|difference|pros?\s*(?:and|&)\s*cons?/iu.test(normalized);
  const asksForTiming = /언제|시기|몇\s*(?:일|주|달|개월|년)|when|what\s+time|how\s+soon/iu.test(normalized);

  // A sentence-level request such as "why do I keep wondering what to eat?"
  // is asking for a cause, not for the embedded food choice to be made.
  if (asksForExplanation) {
    return { kind: "explain", subject: current.slice(0, 100), candidates: [], decisive: false };
  }

  if (explicitChoices && (asksForChoice || !asksToCompare)) {
    return {
      kind: "choose_one",
      subject: language === "ko" ? "제시된 선택지 중 최종 선택" : "the final choice among the supplied options",
      candidates: [...explicitChoices],
      decisive: true,
    };
  }
  if (explicitChoices && asksToCompare) {
    return {
      kind: "compare",
      subject: language === "ko" ? "제시된 선택지의 차이" : "the difference between the supplied options",
      candidates: [...explicitChoices],
      decisive: false,
    };
  }
  const englishOpenQuestion = /\b(?:what|how|where|when|which)\s+should\s+i\b/iu.test(normalized);
  const asksForOpenRecommendation = isOpenRecommendationQuestion(normalized);
  if (asksForOpenRecommendation) {
    return {
      kind: "recommend_one",
      subject: current.slice(0, 100),
      candidates: [],
      decisive: true,
    };
  }
  if (!asksForTiming && /(?:성공|실패|합격|불합격|붙(?:을|게|겠|나|었)|통과|탈락|당첨|성사|달성|회복|완료|해낼|잘\s*될|이루어질|이뤄질).{0,20}(?:까|까요|가능성|전망|것\s*같|수\s*있)|(?:연락|답장|기회|결과).{0,12}(?:올까|나올까|생길까)|(?:succeed|fail|pass|accepted|rejected|win|recover|work\s+out|happen).{0,24}(?:\?|likely|chance|will|would|could)/iu.test(normalized)) {
    return { kind: "outcome", subject: current.slice(0, 100), candidates: [], decisive: true };
  }
  if (/할까\s*말까|해도\s*될까|맞을까|아닐까|가능할까|될까요|(?:하는|가는|사는)\s*(?:게|것이)\s*(?:좋을|나을)까|(?:연락|이직|지원|신청|구매|시작|중단|계속)(?:을|를)?\s*할까|(?:만날|보낼|갈|먹을|입을|살)까|will\s+it|is\s+it\s+(?:right|okay)|yes\s+or\s+no/iu.test(normalized)
    || (!englishOpenQuestion && /\bshould\s+i\b/iu.test(normalized))) {
    return {
      kind: "yes_no",
      subject: current.slice(0, 100),
      candidates: language === "ko" ? ["예", "아니요"] : ["Yes", "No"],
      decisive: true,
    };
  }
  if (/언제|시기|될까|어떻게\s+될|가능성|전망|미래|앞으로|향후|다음.{0,12}흐름|when|likely|forecast|outlook|what\s+will/iu.test(normalized)) {
    return { kind: "forecast", subject: current.slice(0, 100), candidates: [], decisive: false };
  }
  if (/어떻게|방법|해야\s*해|하면\s*좋|조언|다음\s*행동|how|what\s+should\s+i\s+do|advice|next\s+step/iu.test(normalized)) {
    return { kind: "advice", subject: current.slice(0, 100), candidates: [], decisive: true };
  }
  return { kind: "analysis", subject: current.slice(0, 100), candidates: [], decisive: false };
}

export function toKoreanHaeyo(value: string): string {
  const sentenceEnd = "(?=[.!?]|$)";
  return value
    .replace(new RegExp(`않습니다${sentenceEnd}`, "g"), "않아요")
    .replace(new RegExp(`못합니다${sentenceEnd}`, "g"), "못해요")
    .replace(new RegExp(`않았다${sentenceEnd}`, "g"), "않았어요")
    .replace(new RegExp(`필요해진다${sentenceEnd}`, "g"), "필요해져요")
    .replace(new RegExp(`줄어든다${sentenceEnd}`, "g"), "줄어들어요")
    .replace(new RegExp(`생긴다${sentenceEnd}`, "g"), "생겨요")
    .replace(new RegExp(`만든다${sentenceEnd}`, "g"), "만들어요")
    .replace(new RegExp(`일관된다${sentenceEnd}`, "g"), "일관돼요")
    .replace(new RegExp(`산정했다${sentenceEnd}`, "g"), "산정했어요")
    .replace(new RegExp(`어렵다${sentenceEnd}`, "g"), "어려워요")
    .replace(new RegExp(`낫다${sentenceEnd}`, "g"), "나아요")
    .replace(new RegExp(`크다${sentenceEnd}`, "g"), "커요")
    .replace(new RegExp(`(?:합니다|한다)${sentenceEnd}`, "g"), "해요")
    .replace(new RegExp(`(?:됩니다|된다)${sentenceEnd}`, "g"), "돼요")
    .replace(new RegExp(`(?:있습니다|있다)${sentenceEnd}`, "g"), "있어요")
    .replace(new RegExp(`(?:없습니다|없다)${sentenceEnd}`, "g"), "없어요")
    .replace(new RegExp(`않는다${sentenceEnd}`, "g"), "않아요")
    .replace(new RegExp(`필요하다${sentenceEnd}`, "g"), "필요해요")
    .replace(new RegExp(`가능하다${sentenceEnd}`, "g"), "가능해요")
    .replace(new RegExp(`적절하다${sentenceEnd}`, "g"), "적절해요")
    .replace(new RegExp(`([가-힣]+)하다${sentenceEnd}`, "g"), "$1해요")
    .replace(new RegExp(`안정적이다${sentenceEnd}`, "g"), "안정적이에요")
    .replace(new RegExp(`흐름이다${sentenceEnd}`, "g"), "흐름이에요")
    .replace(new RegExp(`상황이다${sentenceEnd}`, "g"), "상황이에요")
    .replace(new RegExp(`시점이다${sentenceEnd}`, "g"), "시점이에요")
    .replace(new RegExp(`우선이다${sentenceEnd}`, "g"), "우선이에요")
    .replace(new RegExp(`아니다${sentenceEnd}`, "g"), "아니에요")
    .replace(new RegExp(`단계다${sentenceEnd}`, "g"), "단계예요")
    .replace(new RegExp(`상태다${sentenceEnd}`, "g"), "상태예요")
    .replace(new RegExp(`별개다${sentenceEnd}`, "g"), "별개예요")
    .replace(new RegExp(`시기다${sentenceEnd}`, "g"), "시기예요")
    .replace(new RegExp(`([가-힣]+)이다${sentenceEnd}`, "g"), (_, noun: string) => koreanCopula(noun))
    .replace(new RegExp(`입니다${sentenceEnd}`, "g"), "이에요")
    .replace(new RegExp(`하십시오${sentenceEnd}`, "g"), "하세요");
}

export function detectQuestionCategory(question: string): QuestionCategory {
  const normalized = question.toLowerCase();
  if (extractBinaryChoices(question)) return "decision";
  if (/관계|연애|사랑|상대|친구|가족|마음|연락|재회|relationship|romance|love|partner|friend|family|reconnect/.test(normalized)) return "relationship";
  if (/직장|이직|취업|일|진로|학업|시험|프로젝트|사업|돈|재정|career|job|work|study|exam|project|business|money|finance/.test(normalized)) return "work";
  if (/선택|결정|비교|어느|할까|해야|고려|장단점|진행|choose|choice|decision|compare|option|pros|cons/.test(normalized)) return "decision";
  return "self";
}

function requestedCardCount(question: string, followup: boolean): number {
  if (extractBinaryChoices(question)) return 2;
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

type RecommendationDomain = "food" | "outfit" | "schedule" | "media" | "place" | "purchase" | "general";

function detectRecommendationDomain(question: string): RecommendationDomain {
  if (/아침|점심|저녁|식사|메뉴|음식|먹|간식|끼니|배달|요리|breakfast|lunch|dinner|meal|menu|food|snack|eat|cook|delivery/i.test(question)) return "food";
  if (/옷|코디|입(?:을|고|는|지|어)|신발|겉옷|복장|outfit|clothes|wear|shoes|jacket/i.test(question)) return "outfit";
  if (/오늘\s*(?:뭐|무엇|할\s*일)|주말\s*일정|할\s*일|일정|약속|today(?:'s)?\s*(?:task|plan)|weekend\s*(?:plan|schedule)|to-?do/i.test(question)) return "schedule";
  if (/책|소설|만화|영화|드라마|영상|음악|노래|게임|book|novel|comic|movie|show|music|song|game/i.test(question)) return "media";
  if (/어디|장소|여행|가볼|갈까|where|place|trip|travel|visit/i.test(question)) return "place";
  if (/사다|살까|구매|선물|제품|buy|purchase|gift|product/i.test(question)) return "purchase";
  return "general";
}

function recommendationPositions(
  question: string,
  language: ReadingLanguage,
  cardCount: number,
  followup: boolean,
): ReadingPosition[] {
  const domain = detectRecommendationDomain(question);
  const korean: Record<RecommendationDomain, ReadingPosition[]> = {
    food: [
      { id: "signal", title: "메뉴의 핵심 신호", focus: "카드의 핵심 의미가 이번 식사에서 어떤 메뉴를 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 메뉴 흐름", focus: "이번 식사 메뉴를 정할 때 카드가 경고하는 선택 방식을 살펴봐요." },
      { id: "support", title: "추천을 돕는 메뉴 신호", focus: "구체적인 식사 메뉴 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "메뉴 추천의 보정", focus: "서로 다른 카드 신호를 합칠 때 메뉴 추천에서 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 메뉴 단서", focus: "전체 카드 의미를 합쳐 실제로 먹을 메뉴 하나를 정할 마지막 단서를 살펴봐요." },
    ],
    outfit: [
      { id: "signal", title: "옷 선택의 핵심 신호", focus: "카드의 핵심 의미가 이번 옷차림에서 어떤 선택을 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 옷 선택", focus: "이번 옷차림을 정할 때 카드가 경고하는 선택 방식을 살펴봐요." },
      { id: "support", title: "코디를 돕는 신호", focus: "구체적인 옷차림 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "옷 추천의 보정", focus: "서로 다른 카드 신호를 합칠 때 옷 추천에서 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 코디 단서", focus: "전체 카드 의미를 합쳐 실제로 입을 옷차림 하나를 정할 마지막 단서를 살펴봐요." },
    ],
    schedule: [
      { id: "signal", title: "할 일의 핵심 신호", focus: "카드의 핵심 의미가 이번 일정에서 어떤 일을 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 일정 흐름", focus: "이번 일정을 정할 때 카드가 경고하는 행동 방식을 살펴봐요." },
      { id: "support", title: "실행을 돕는 일정 신호", focus: "구체적인 할 일 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "일정 추천의 보정", focus: "서로 다른 카드 신호를 합칠 때 일정 추천에서 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 행동 단서", focus: "전체 카드 의미를 합쳐 이번 일정에서 할 행동 하나를 정할 마지막 단서를 살펴봐요." },
    ],
    media: [
      { id: "signal", title: "작품 선택 신호", focus: "카드의 핵심 의미가 어떤 작품을 고르라고 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 선택 흐름", focus: "작품을 정할 때 카드가 경고하는 선택 방식을 살펴봐요." },
      { id: "support", title: "추천을 돕는 신호", focus: "구체적인 작품 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "작품 추천의 보정", focus: "서로 다른 카드 신호를 합칠 때 추천에서 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 작품 단서", focus: "전체 카드 의미를 합쳐 실제 작품 하나를 정할 마지막 단서를 살펴봐요." },
    ],
    place: [
      { id: "signal", title: "장소 선택 신호", focus: "카드의 핵심 의미가 어떤 장소를 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 선택 흐름", focus: "갈 곳을 정할 때 카드가 경고하는 선택 방식을 살펴봐요." },
      { id: "support", title: "장소 추천 신호", focus: "구체적인 장소 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "장소 추천의 보정", focus: "서로 다른 카드 신호를 합칠 때 장소 추천에서 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 행선지 단서", focus: "전체 카드 의미를 합쳐 실제로 갈 장소 하나를 정할 마지막 단서를 살펴봐요." },
    ],
    purchase: [
      { id: "signal", title: "구매 선택 신호", focus: "카드의 핵심 의미가 어떤 구매 대상을 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 구매 흐름", focus: "구매 대상을 정할 때 카드가 경고하는 선택 방식을 살펴봐요." },
      { id: "support", title: "구매 추천 신호", focus: "구체적인 구매 대상 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "구매 추천의 보정", focus: "서로 다른 카드 신호를 합칠 때 구매 추천에서 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 구매 단서", focus: "전체 카드 의미를 합쳐 실제로 고를 대상 하나를 정할 마지막 단서를 살펴봐요." },
    ],
    general: [
      { id: "signal", title: "추천의 핵심 신호", focus: "카드의 핵심 의미가 질문에 맞는 어떤 구체적인 답을 가리키는지 살펴봐요." },
      { id: "caution", title: "피할 선택 흐름", focus: "구체적인 답을 정할 때 카드가 경고하는 선택 방식을 살펴봐요." },
      { id: "support", title: "추천을 돕는 신호", focus: "답 하나를 정하는 데 카드가 더하는 지지를 살펴봐요." },
      { id: "adjustment", title: "추천의 보정 신호", focus: "서로 다른 카드 신호를 합칠 때 조정할 부분을 살펴봐요." },
      { id: "verdict", title: "최종 추천 단서", focus: "전체 카드 의미를 합쳐 실행할 수 있는 답 하나를 정할 마지막 단서를 살펴봐요." },
    ],
  };
  const english: Record<RecommendationDomain, ReadingPosition[]> = {
    food: [
      { id: "signal", title: "Core menu signal", focus: "What kind of specific meal the central card meaning points toward" },
      { id: "caution", title: "Menu caution", focus: "A way of choosing this meal that the cards caution against" },
      { id: "support", title: "Menu support", focus: "The signal that helps settle on one concrete meal" },
      { id: "adjustment", title: "Menu adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final menu clue", focus: "The last clue for naming one specific meal after all cards are read" },
    ],
    outfit: [
      { id: "signal", title: "Core outfit signal", focus: "What specific outfit direction the central card meaning points toward" },
      { id: "caution", title: "Outfit caution", focus: "A way of choosing the outfit that the cards caution against" },
      { id: "support", title: "Outfit support", focus: "The signal that helps settle on one concrete outfit" },
      { id: "adjustment", title: "Outfit adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final outfit clue", focus: "The last clue for naming one specific outfit after all cards are read" },
    ],
    schedule: [
      { id: "signal", title: "Core task signal", focus: "What specific task the central card meaning points toward" },
      { id: "caution", title: "Schedule caution", focus: "A way of choosing the next task that the cards caution against" },
      { id: "support", title: "Action support", focus: "The signal that helps settle on one concrete action" },
      { id: "adjustment", title: "Schedule adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final action clue", focus: "The last clue for naming one specific action after all cards are read" },
    ],
    media: [
      { id: "signal", title: "Core title signal", focus: "What specific work the central card meaning points toward" },
      { id: "caution", title: "Choice caution", focus: "A way of choosing the work that the cards caution against" },
      { id: "support", title: "Recommendation support", focus: "The signal that helps settle on one concrete work" },
      { id: "adjustment", title: "Recommendation adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final title clue", focus: "The last clue for naming one specific work after all cards are read" },
    ],
    place: [
      { id: "signal", title: "Core place signal", focus: "What specific place the central card meaning points toward" },
      { id: "caution", title: "Place caution", focus: "A way of choosing the destination that the cards caution against" },
      { id: "support", title: "Place support", focus: "The signal that helps settle on one concrete place" },
      { id: "adjustment", title: "Place adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final destination clue", focus: "The last clue for naming one specific destination after all cards are read" },
    ],
    purchase: [
      { id: "signal", title: "Core purchase signal", focus: "What specific item the central card meaning points toward" },
      { id: "caution", title: "Purchase caution", focus: "A way of choosing the purchase that the cards caution against" },
      { id: "support", title: "Purchase support", focus: "The signal that helps settle on one concrete item" },
      { id: "adjustment", title: "Purchase adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final purchase clue", focus: "The last clue for naming one specific item after all cards are read" },
    ],
    general: [
      { id: "signal", title: "Core recommendation signal", focus: "What specific answer the central card meaning points toward" },
      { id: "caution", title: "Choice caution", focus: "A way of choosing that the cards caution against" },
      { id: "support", title: "Recommendation support", focus: "The signal that helps settle on one concrete answer" },
      { id: "adjustment", title: "Recommendation adjustment", focus: "What to adjust when combining the card signals into a recommendation" },
      { id: "verdict", title: "Final recommendation clue", focus: "The last clue for naming one actionable answer after all cards are read" },
    ],
  };
  const indices = cardCount === 1
    ? [4]
    : cardCount === 2
      ? [0, 4]
      : cardCount === 3
        ? [0, 1, 4]
        : cardCount === 4
          ? [0, 1, 2, 4]
          : [0, 1, 2, 3, 4];
  const source = (language === "ko" ? korean : english)[domain];
  return indices.map((index, positionIndex) => ({
    ...source[index],
    id: `${followup ? "followup" : "initial"}-${positionIndex + 1}-recommend-${source[index].id}`,
  }));
}

export function designReading(
  question: string,
  followup = false,
  language: ReadingLanguage = "ko",
  context?: ReadingContext,
): ReadingPlan {
  const category = detectQuestionCategory(question);
  const answerContract = createAnswerContract(question, context, language);
  const candidateMode = ["choose_one", "yes_no", "compare"].includes(answerContract.kind);
  if (candidateMode && answerContract.candidates.length >= 2) {
    const positions = answerContract.candidates.slice(0, 5).map((candidate, index) => ({
      id: `${followup ? "followup" : "initial"}-${index + 1}-option`,
      title: language === "ko" ? `${candidate} 선택` : `${candidate} option`,
      focus: language === "ko"
        ? `${candidate} 선택에 카드가 주는 지지와 주의 신호`
        : `Support and caution signals for choosing ${candidate}`,
    }));
    return {
      cardCount: positions.length,
      interpretationFrame: language === "ko"
        ? answerContract.kind === "compare"
          ? "후보별 카드 신호를 비교해 핵심 차이를 설명해요."
          : "후보별 카드 신호를 비교해 질문에 대한 답 하나를 정해요."
        : answerContract.kind === "compare"
          ? "Compare the card signal for each candidate and explain the key difference."
          : "Compare the card signal for each candidate and choose one answer.",
      selectionGuide: language === "ko"
        ? "각 후보에 놓을 카드를 한 장씩 선택해요."
        : "Select one card for each option.",
      positions,
      answerContract,
    };
  }
  const cardCount = requestedCardCount(question, followup);
  const positions = answerContract.kind === "recommend_one"
    ? recommendationPositions(question, language, cardCount, followup)
    : (language === "ko" ? POSITION_LIBRARY : POSITION_LIBRARY_EN)[category].slice(0, cardCount).map((position, index) => ({
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

  const recommendationDomain = detectRecommendationDomain(question);
  const recommendationSubject = language === "ko"
    ? ({
      food: "식사 메뉴",
      outfit: "옷차림",
      schedule: "일정",
      media: "작품",
      place: "장소",
      purchase: "구매 대상",
      general: "질문의 대상",
    } as const)[recommendationDomain]
    : ({
      food: "meal",
      outfit: "outfit",
      schedule: "schedule",
      media: "title",
      place: "destination",
      purchase: "purchase",
      general: "answer",
    } as const)[recommendationDomain];

  const recommendationFrame = language === "ko"
    ? `후보를 미리 정하지 않고 ${cardCount}장의 카드 신호로 ${recommendationSubject}를 읽은 뒤 구체적인 답 하나를 정해요.`
    : `Read ${cardCount} card signal${cardCount === 1 ? "" : "s"} for the ${recommendationSubject} without preselecting candidates, then name one concrete answer.`;
  const recommendationGuide = language === "ko"
    ? `아래 카드 중 ${cardCount}장을 선택해요. 구체적인 ${recommendationSubject}는 카드를 공개한 뒤 정해요.`
    : `Select ${cardCount} card${cardCount === 1 ? "" : "s"}. The recommendation is named only after the cards are revealed.`;

  return {
    cardCount,
    interpretationFrame: answerContract.kind === "recommend_one"
      ? recommendationFrame
      : language === "ko" ? `${categoryFrame} ${cardCount}장의 카드를 분석해요.` : `${categoryFrame}, using ${cardCount} card${cardCount === 1 ? "" : "s"}.`,
    selectionGuide: answerContract.kind === "recommend_one"
      ? recommendationGuide
      : language === "ko" ? `아래 카드 중 ${cardCount}장을 선택해요. 선택 순서대로 각 자리에 배치돼요.` : `Select ${cardCount} card${cardCount === 1 ? "" : "s"} below. Cards are assigned by selection order.`,
    positions,
    answerContract,
  };
}

function readingResultToHaeyo(result: ReadingResult): ReadingResult {
  return {
    ...result,
    verdict: result.verdict ? {
      ...result.verdict,
      statement: toKoreanHaeyo(result.verdict.statement),
    } : undefined,
    summary: toKoreanHaeyo(result.summary),
    synthesis: toKoreanHaeyo(result.synthesis),
    guidance: result.guidance.map(toKoreanHaeyo),
    cardInterpretations: result.cardInterpretations.map((item) => ({
      ...item,
      text: toKoreanHaeyo(item.text),
      reasoning: item.reasoning ? {
        sourceMeaning: toKoreanHaeyo(item.reasoning.sourceMeaning),
        questionConnection: toKoreanHaeyo(item.reasoning.questionConnection),
        decisionImpact: toKoreanHaeyo(item.reasoning.decisionImpact),
      } : undefined,
      evidence: item.evidence.map(toKoreanHaeyo),
    })),
    axes: result.axes.map((axis) => ({
      ...axis,
      evidence: toKoreanHaeyo(axis.evidence),
    })),
  };
}

function generateCandidateResult(
  question: string,
  contract: AnswerContract,
  selectedCards: SelectedCard[],
  language: ReadingLanguage,
): ReadingResult {
  const candidates = contract.candidates.slice(0, 5);
  const comparedCards = selectedCards.slice(0, Math.max(1, candidates.length));
  const scores = candidates.map((candidate, index) => {
    const selected = comparedCards[index % comparedCards.length];
    const card = getCard(selected.cardId);
    const hierarchyWeight = card.arcana === "major" ? 10 : card.rank ? 6 : 3;
    const orientationBase = selected.reversed ? 43 - hierarchyWeight : 61 + hierarchyWeight;
    return clampScore(orientationBase + (hashText(`${question}|${candidate}`) % 5));
  });
  const highest = Math.max(...scores);
  const tied = scores.flatMap((score, index) => score === highest ? [index] : []);
  const winnerIndex = tied[hashText(`${question}|${comparedCards.map((card) => card.cardId).join("|")}`) % tied.length];
  if (tied.length > 1) {
    scores[winnerIndex] = clampScore(scores[winnerIndex] + 1);
  }
  const winner = candidates[winnerIndex];
  const sortedScores = [...scores].sort((left, right) => right - left);
  const difference = Math.max(1, sortedScores[0] - (sortedScores[1] ?? sortedScores[0] - 1));
  const uncertainty = Math.max(12, 28 - difference);
  const support = Math.min(72, 54 + difference);
  const caution = 100 - support - uncertainty;
  const comparisonMode = contract.kind === "compare";
  const comparisonValue = candidates.map((candidate, index) => {
    const selected = comparedCards[index % comparedCards.length];
    const card = getCard(selected.cardId);
    const meaning = card[selected.reversed ? "reversed" : "upright"];
    return `${candidate}: ${meaning.keywords[0]}`;
  }).join(language === "ko" ? " · " : "; ");
  const verdictValue = comparisonMode && comparisonValue.length > 160
    ? (language === "ko" ? "후보별 카드 신호의 핵심 차이" : "the key card-signal contrast among the candidates")
    : comparisonValue;
  const statement = language === "ko"
    ? comparisonMode
      ? `카드에서 드러난 핵심 차이는 ${koreanCopula(comparisonValue)}.`
      : contract.kind === "recommend_one"
      ? `이번 카드 배열의 추천은 “${winner}”이에요.`
      : contract.kind === "yes_no"
        ? `이번 카드 배열의 답은 “${winner}”예요.`
        : `이번 카드 배열에서는 “${winner}” 쪽을 골라요.`
    : comparisonMode
      ? `The key contrast in the cards is ${comparisonValue}.`
      : contract.kind === "recommend_one"
      ? `The recommendation from this spread is “${winner}.”`
      : contract.kind === "yes_no"
        ? `The answer from this spread is “${winner}.”`
        : `Choose “${winner}” in this spread.`;
  const cardInterpretations = comparedCards.map((selected, index): CardInterpretation => {
    const card = getCard(selected.cardId);
    const orientation: Orientation = selected.reversed ? "reversed" : "upright";
    const meaning = card[orientation];
    const candidate = candidates[index % candidates.length];
    const isWinner = index === winnerIndex;
    if (language === "en") {
      return {
        cardId: card.id,
        positionTitle: selected.positionTitle,
        orientation,
        text: comparisonMode
          ? `${candidate} is characterized by the ${meaning.keywords[0]} signal in this comparison.`
          : isWinner ? `${candidate} receives the strongest card signal.` : `${candidate} receives a weaker or more cautious signal.`,
        reasoning: {
          sourceMeaning: `${card.nameEn} ${orientation}: ${meaning.summary}`,
          questionConnection: `In the ${selected.positionTitle} position, the card's ${meaning.keywords.slice(0, 2).join(" and ")} themes are used as a comparative tarot signal for ${candidate}.`,
          decisionImpact: comparisonMode
            ? `This card signal describes how ${candidate} is likely to feel or work out compared with the other candidates.`
            : isWinner ? `This signal makes ${candidate} the direct answer to the user's request.` : `This signal does not outweigh the stronger support for ${winner}.`,
        },
        evidence: [`${orientation} · ${meaning.keywords.slice(0, 2).join(" · ")}`, `Position · ${selected.positionTitle}`],
      };
    }
    return {
      cardId: card.id,
      positionTitle: selected.positionTitle,
      orientation,
      text: comparisonMode
        ? `${candidate} 쪽에서는 ${meaning.keywords[0]} 신호가 핵심 차이로 나타나요.`
        : isWinner ? `${candidate} 쪽 카드 신호가 후보 중 가장 강해요.` : `${candidate} 쪽에는 상대적으로 약하거나 주의가 필요한 신호가 나와요.`,
      reasoning: {
        sourceMeaning: toKoreanHaeyo(`${card.nameKo} ${orientation === "upright" ? "정방향" : "역방향"}은 ${meaning.summary}`),
        questionConnection: `${selected.positionTitle} 자리에서는 ${card.nameKo}의 ${meaning.keywords.slice(0, 2).join("·")} 의미를 ${candidate}의 분위기와 예상 결과에 연결해요.`,
        decisionImpact: comparisonMode
          ? `이 신호는 ${candidate}가 다른 후보보다 어떻게 느껴지고 흘러갈지를 구체적으로 보여줘요.`
          : isWinner
          ? `이 카드 신호가 다른 후보보다 강해서 ${withParticle(winner, "을", "를")} 이번 질문의 직접 답으로 정해요.`
          : `이 카드의 주의점은 반영하지만, 더 강한 신호를 받은 ${winner} 쪽이라는 결론을 다시 열지는 않아요.`,
      },
      evidence: [
        `${orientation === "upright" ? "정방향" : "역방향"} · ${meaning.keywords.slice(0, 2).join(" · ")}`,
        `자리 · ${selected.positionTitle}`,
      ],
    };
  });
  const axes = candidates.map((candidate, index) => {
    const selected = comparedCards[index % comparedCards.length];
    const card = getCard(selected.cardId);
    return {
      label: `${candidate.slice(0, 24)}${language === "ko" ? " 신호" : ""}`.slice(0, 30),
      score: scores[index],
      evidence: language === "ko"
        ? `${card.nameKo} ${selected.reversed ? "역방향" : "정방향"}의 비교 신호를 반영했어요.`
        : `Reflects ${card.nameEn} in the ${selected.reversed ? "reversed" : "upright"} orientation.`,
      evidenceCardIds: [card.id],
    };
  });
  if (axes.length < 3) {
    axes.push({
      label: language === "ko"
        ? comparisonMode ? "비교 선명도" : "결론 선명도"
        : comparisonMode ? "Contrast clarity" : "Decision clarity",
      score: clampScore(52 + difference * 2),
      evidence: language === "ko"
        ? comparisonMode
          ? `후보별 카드 신호 차이를 ${difference}점으로 표시했어요.`
          : `${winner} 쪽 신호가 다음 후보보다 ${difference}점 높아요.`
        : comparisonMode
          ? `The card-signal contrast is ${difference} points.`
          : `${winner} leads the next candidate by ${difference} points.`,
      evidenceCardIds: comparedCards.slice(0, 2).map((card) => card.cardId),
    });
  }
  const synthesis = cardInterpretations.map((interpretation, index) => {
    const card = getCard(interpretation.cardId);
    const candidate = candidates[index % candidates.length];
    if (language === "ko") {
      return comparisonMode
        ? `${card.nameKo} 카드는 ${candidate} 쪽에서 ${card[comparedCards[index]?.reversed ? "reversed" : "upright"].keywords[0]} 신호가 두드러진다는 비교 근거가 돼요.`
        : `${card.nameKo} 카드는 ${candidate} 선택에 ${index === winnerIndex ? "가장 큰 지지" : selectedCards[index]?.reversed ? "주의" : "비교 신호"}를 더하는 근거가 돼요.`;
    }
    return comparisonMode
      ? `${card.nameEn} identifies the main tarot signal for ${candidate}.`
      : `${card.nameEn} provides ${index === winnerIndex ? "the strongest support" : "a comparative signal"} for ${candidate}.`;
  }).join(" ");

  return {
    verdict: { kind: contract.kind, value: comparisonMode ? verdictValue : winner, statement },
    summary: language === "ko"
      ? comparisonMode
        ? `${statement} 카드 원뜻을 후보별 자리에 적용하면 이 차이가 가장 뚜렷하게 보여요.`
        : `${statement} 후보별 카드의 방향과 의미를 비교하면 ${winner} 쪽 신호가 가장 강해요.`
      : comparisonMode
        ? `${statement} Applying each card meaning to its candidate makes this contrast the clearest.`
        : `${statement} Comparing the orientation and meaning of each candidate card gives ${winner} the strongest signal.`,
    cardInterpretations,
    synthesis,
    guidance: language === "ko"
      ? comparisonMode
        ? [`${candidates[0]} 쪽과 ${candidates[1]} 쪽에서 나온 차이를 비교해요.`, "선택까지 원하면 어떤 후보를 고를지 추가 질문으로 물어볼 수 있어요."]
        : [`이번에는 ${withParticle(`“${winner}”`, "으로", "로")} 결정해요.`, `${winner} 쪽 카드에서 강하게 나온 특징을 선택 기준으로 삼아요.`]
      : comparisonMode
        ? ["Compare the differences shown for the first and second candidates.", "Ask a follow-up if you want the reading to choose one candidate."]
        : [`Act on “${winner}.”`, `Use the strongest traits shown for ${winner} as the reason for the choice.`],
    axes,
    signals: { support, caution, uncertainty },
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
  answerContract?: AnswerContract,
): ReadingResult {
  const category = detectQuestionCategory(question);
  const latestRound = Math.max(...selectedCards.map((card) => card.round));
  const latestCards = previous
    ? selectedCards.filter((card) => card.round === latestRound)
    : selectedCards;
  const contract = answerContract ?? createAnswerContract(question, undefined, language);
  if (
    ["choose_one", "yes_no", "compare"].includes(contract.kind)
    && contract.candidates.length >= 2
  ) {
    return generateCandidateResult(question, contract, latestCards, language);
  }
  const cardInterpretations = latestCards.map((selected) => {
    const card = getCard(selected.cardId);
    const orientation: Orientation = selected.reversed ? "reversed" : "upright";
    const meaning = card[orientation];
    return language === "ko" ? {
      cardId: card.id,
      positionTitle: selected.positionTitle,
      orientation,
      text: `${selected.positionTitle}에서는 ${meaning.keywords[0]} 신호가 ${selected.positionFocus}의 결과를 직접 기울인다.`,
      reasoning: {
        sourceMeaning: `${card.nameKo} ${orientation === "upright" ? "정방향" : "역방향"}은 ${meaning.summary}`,
        questionConnection: `${selected.positionTitle} 자리에서는 ${meaning.keywords.slice(0, 2).join("·")} 신호가 ${withParticle(contextFor(card, category), "을", "를")} 어떤 방향으로 이끄는지 보여 준다.`,
        decisionImpact: `${meaning.caution} 이 주의 신호는 질문의 결과를 부정적으로 기울이는 근거로 반영한다.`,
      },
      evidence: [`${orientation === "upright" ? "정방향" : "역방향"} · ${meaning.keywords.slice(0, 2).join(" · ")}`, `자리 · ${selected.positionTitle}`],
    } : {
      cardId: card.id,
      positionTitle: selected.positionTitle,
      orientation,
      text: `${card.nameEn} in the ${selected.positionTitle} position gives a direct prediction about ${selected.positionFocus.toLowerCase()}.`,
      reasoning: {
        sourceMeaning: `${card.nameEn} ${orientation === "upright" ? "upright" : "reversed"}: ${meaning.summary}`,
        questionConnection: `The ${selected.positionTitle} position examines ${selected.positionFocus.toLowerCase()}. The card's ${meaning.keywords.slice(0, 2).join(" and ")} themes identify what must be checked in the question.`,
        decisionImpact: `${meaning.caution} This caution weighs directly against a positive outcome.`,
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
    ? (support >= caution ? "진행을 지지하는 신호가 더 강하다" : "실패나 지연을 가리키는 신호가 더 강하다")
    : (support >= caution ? "The cards lean toward progress" : "The cards lean toward failure or delay");

  const positiveOutcome = support >= caution;
  const outcomeValue = language === "ko"
    ? positiveOutcome ? "성공" : "실패"
    : positiveOutcome ? "Success" : "Failure";
  const outcomeStatement = language === "ko"
    ? `이번 카드 배열에서 “${question.replace(/[?？.!]+$/u, "")}”의 결과는 ${positiveOutcome ? "성공할 가능성이 높아요" : "실패할 가능성이 높아요"}.`
    : `For “${question.replace(/[?!.]+$/u, "")},” this spread points to ${positiveOutcome ? "success" : "failure"}.`;

  const summary = contract.kind === "outcome"
    ? (language === "ko"
      ? `${outcomeStatement} ${first.nameKo}의 ${firstMeaning.keywords[0]} 신호가 이 결론에 가장 크게 작용해요.`
      : `${outcomeStatement} ${first.nameEn}'s ${firstMeaning.keywords[0]} signal weighs most heavily in this conclusion.`)
    : language === "ko" ? (latestCards.length === 1
      ? `${leaning}. ${first.nameKo}의 ${firstMeaning.keywords[0]} 신호가 질문의 결과를 이 방향으로 이끈다.`
      : `${leaning}. ${first.nameKo}의 ${firstMeaning.keywords[0]}과 ${last.nameKo}의 ${lastMeaning.keywords[0]}이 함께 이 결론을 만든다.`)
      : (latestCards.length === 1
        ? `${leaning}. ${first.nameEn}'s ${firstMeaning.keywords[0]} signal drives this result.`
        : `${leaning}. ${first.nameEn} and ${last.nameEn} combine to produce this result.`);

  const synthesis = language === "ko" ? (latestCards.length === 1
    ? `${firstMeaning.summary} ${firstSelected.positionTitle} 자리의 이 의미가 질문의 결과를 ${positiveOutcome ? "긍정" : "부정"} 쪽으로 기울인다.`
    : `카드 흐름은 ${first.nameKo}에서 시작해 ${last.nameKo}로 이어진다. ${firstMeaning.summary} 이어서 ${lastMeaning.summary} 이 조합은 질문의 결과를 ${positiveOutcome ? "긍정" : "부정"} 쪽으로 기울인다.`)
    : (latestCards.length === 1
      ? `${first.nameEn} occupies the ${firstSelected.positionTitle} position and pushes the result in a ${positiveOutcome ? "positive" : "negative"} direction.`
      : `The sequence moves from ${first.nameEn} to ${last.nameEn}, pushing the result in a ${positiveOutcome ? "positive" : "negative"} direction.`);

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

  const result: ReadingResult = {
    verdict: {
      kind: contract.kind,
      value: contract.kind === "outcome" ? outcomeValue : summary.split(/[.!?\n]/u)[0] ?? summary,
      statement: contract.kind === "outcome" ? outcomeStatement : summary.split(/[.!?\n]/u)[0] ?? summary,
    },
    summary,
    cardInterpretations,
    synthesis,
    guidance,
    axes,
    signals: { support, caution, uncertainty },
  };
  return language === "ko" ? readingResultToHaeyo(result) : result;
}

export function orientationLabel(reversed: boolean, language: ReadingLanguage = "ko"): string {
  if (language === "en") return reversed ? "Reversed" : "Upright";
  return reversed ? "역방향" : "정방향";
}

export function createRecordId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `reading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

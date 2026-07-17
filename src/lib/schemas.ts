import { z } from "zod";

export const readingPositionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(40),
  focus: z.string().min(1).max(160),
});

export const answerKindSchema = z.enum([
  "choose_one",
  "recommend_one",
  "yes_no",
  "outcome",
  "compare",
  "forecast",
  "advice",
  "explain",
  "analysis",
]);

export const answerContractSchema = z.object({
  kind: answerKindSchema,
  subject: z.string().trim().min(1).max(160),
  candidates: z.array(z.string().trim().min(1).max(80)).max(5),
  decisive: z.boolean(),
}).superRefine((contract, context) => {
  const decisiveKinds = new Set(["choose_one", "recommend_one", "yes_no", "outcome", "advice"]);
  if (contract.decisive !== decisiveKinds.has(contract.kind)) {
    context.addIssue({ code: "custom", message: "답변 유형과 직접 결론 여부가 일치하지 않습니다.", path: ["decisive"] });
  }
  const candidateKinds = new Set(["choose_one", "yes_no", "compare"]);
  if (!candidateKinds.has(contract.kind) && contract.candidates.length > 0) {
    context.addIssue({ code: "custom", message: "이 답변 유형에는 선택 후보를 넣을 수 없습니다.", path: ["candidates"] });
  }
  if ((contract.kind === "choose_one" || contract.kind === "compare") && contract.candidates.length < 2) {
    context.addIssue({ code: "custom", message: "명시 선택과 비교에는 사용자가 제시한 후보가 2개 이상 필요합니다.", path: ["candidates"] });
  }
  if (contract.kind === "yes_no" && contract.candidates.length !== 2) {
    context.addIssue({ code: "custom", message: "예/아니오 답변에는 두 후보가 필요합니다.", path: ["candidates"] });
  }
});

export const readingContextSchema = z.object({
  initialQuestion: z.string().trim().min(4).max(500).optional(),
  previousQuestions: z.array(z.string().trim().min(4).max(300)).max(2).optional(),
  previousAnswer: z.string().trim().min(1).max(1200).optional(),
  previousContract: answerContractSchema.optional(),
}).optional();

export const readingPlanSchema = z.object({
  cardCount: z.number().int().min(1).max(5),
  interpretationFrame: z.string().min(1).max(300),
  selectionGuide: z.string().min(1).max(180),
  positions: z.array(readingPositionSchema).min(1).max(5),
  answerContract: answerContractSchema,
}).superRefine((plan, context) => {
  if (plan.positions.length !== plan.cardCount) {
    context.addIssue({ code: "custom", message: "카드 수와 자리 수가 다릅니다.", path: ["positions"] });
  }
});

export const selectedCardSchema = z.object({
  cardId: z.string().min(1).max(60),
  reversed: z.boolean(),
  positionId: z.string().min(1).max(80),
  positionTitle: z.string().min(1).max(40),
  positionFocus: z.string().min(1).max(160),
  round: z.number().int().min(0).max(2),
});

export const readingAxisSchema = z.object({
  label: z.string().min(1).max(30),
  score: z.number().int().min(0).max(100),
  evidence: z.string().min(1).max(240),
  evidenceCardIds: z.array(z.string()).min(1).max(5),
});

export const readingResultSchema = z.object({
  verdict: z.object({
    kind: answerKindSchema,
    value: z.string().trim().min(1).max(160),
    statement: z.string().trim().min(1).max(360),
  }).optional(),
  summary: z.string().min(1).max(1200),
  cardInterpretations: z.array(z.object({
    cardId: z.string().min(1).max(60),
    positionTitle: z.string().min(1).max(40),
    orientation: z.enum(["upright", "reversed"]),
    text: z.string().min(1).max(900),
    reasoning: z.object({
      sourceMeaning: z.string().min(1).max(900),
      questionConnection: z.string().min(1).max(1200),
      decisionImpact: z.string().min(1).max(900),
    }).optional(),
    evidence: z.array(z.string().min(1).max(180)).min(1).max(5),
  })).min(1).max(15),
  synthesis: z.string().min(1).max(1800),
  guidance: z.array(z.string().min(1).max(300)).min(1).max(4),
  axes: z.array(readingAxisSchema).min(3).max(5),
  signals: z.object({
    support: z.number().int().min(0).max(100),
    caution: z.number().int().min(0).max(100),
    uncertainty: z.number().int().min(0).max(100),
  }).superRefine((signals, context) => {
    if (signals.support + signals.caution + signals.uncertainty !== 100) {
      context.addIssue({ code: "custom", message: "신호 분포의 합은 100이어야 합니다." });
    }
  }),
});

const planRequestSchema = z.object({
  action: z.literal("plan"),
  question: z.string().trim().min(4).max(500),
  followup: z.boolean().optional().default(false),
  language: z.enum(["ko", "en"]).optional().default("ko"),
  context: readingContextSchema,
});

const interpretRequestSchema = z.object({
  action: z.literal("interpret"),
  question: z.string().trim().min(4).max(1000),
  cards: z.array(selectedCardSchema).min(1).max(15),
  previous: readingResultSchema.optional(),
  answerContract: answerContractSchema.optional(),
  context: readingContextSchema,
  language: z.enum(["ko", "en"]).optional().default("ko"),
}).superRefine((input, context) => {
  const cardIds = new Set<string>();
  const countsByRound = new Map<number, number>();
  for (const [index, card] of input.cards.entries()) {
    if (cardIds.has(card.cardId)) {
      context.addIssue({ code: "custom", message: "같은 카드는 한 리딩에서 한 번만 사용할 수 있습니다.", path: ["cards", index, "cardId"] });
    }
    cardIds.add(card.cardId);
    countsByRound.set(card.round, (countsByRound.get(card.round) ?? 0) + 1);
  }
  for (const [cardRound, count] of countsByRound) {
    if (count > 5) {
      context.addIssue({ code: "custom", message: "한 질문에는 최대 5장까지 사용할 수 있습니다.", path: ["cards", cardRound] });
    }
  }
});

export const tarotApiRequestSchema = z.discriminatedUnion("action", [
  planRequestSchema,
  interpretRequestSchema,
]);

export type TarotApiRequest = z.infer<typeof tarotApiRequestSchema>;

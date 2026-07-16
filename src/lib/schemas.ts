import { z } from "zod";

export const readingPositionSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(40),
  focus: z.string().min(1).max(160),
});

export const readingPlanSchema = z.object({
  cardCount: z.number().int().min(1).max(5),
  interpretationFrame: z.string().min(1).max(300),
  selectionGuide: z.string().min(1).max(180),
  positions: z.array(readingPositionSchema).min(1).max(5),
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
  limitation: z.string().min(1).max(600),
});

const planRequestSchema = z.object({
  action: z.literal("plan"),
  question: z.string().trim().min(4).max(500),
  followup: z.boolean().optional().default(false),
  language: z.enum(["ko", "en"]).optional().default("ko"),
});

const interpretRequestSchema = z.object({
  action: z.literal("interpret"),
  question: z.string().trim().min(4).max(1000),
  cards: z.array(selectedCardSchema).min(1).max(15),
  previous: readingResultSchema.optional(),
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

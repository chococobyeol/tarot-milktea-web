import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readingPlanSchema, tarotApiRequestSchema } from "@/src/lib/schemas";
import {
  createSessionDeck,
  getCard,
  TAROT_CARDS,
} from "@/src/lib/tarot";

describe("tarot deck data", () => {
  it("contains 78 unique cards with local images", () => {
    expect(TAROT_CARDS).toHaveLength(78);
    expect(new Set(TAROT_CARDS.map((card) => card.id)).size).toBe(78);
    const cardDirectory = fileURLToPath(new URL("../../public/cards/by-id/", import.meta.url));
    const localFiles = new Set(readdirSync(cardDirectory).map((file) => file.normalize("NFC")));

    for (const card of TAROT_CARDS) {
      const fileName = card.imageUrl.replace(/^\/cards\/by-id\//, "");
      expect(localFiles.has(fileName), card.nameKo).toBe(true);
      expect(card.upright.keywords.length).toBeGreaterThanOrEqual(2);
      expect(card.reversed.keywords.length).toBeGreaterThanOrEqual(2);
      expect(getCard(card.id)).toBe(card);
    }
  });

  it("creates a shuffled session deck with one fixed orientation per card", () => {
    const deck = createSessionDeck();
    expect(deck).toHaveLength(78);
    expect(new Set(deck.map((card) => card.cardId)).size).toBe(78);
    expect(deck.every((card) => typeof card.reversed === "boolean")).toBe(true);
    expect(deck.map((card) => card.order)).toEqual([...Array(78).keys()]);
  });
});

describe("AI-owned reading structures", () => {
  it("accepts any AI-selected card count from one to five when positions match", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      const plan = readingPlanSchema.parse({
        cardCount: count,
        interpretationFrame: "질문에 필요한 카드 역할을 구성해요.",
        selectionGuide: `${count}장의 카드를 선택해요.`,
        positions: Array.from({ length: count }, (_, index) => ({
          id: `position-${index + 1}`,
          title: `역할 ${index + 1}`,
          focus: `최종 답에 필요한 관점 ${index + 1}`,
        })),
        answerContract: {
          kind: "analysis",
          subject: "현재 질문의 핵심",
          candidates: [],
          decisive: false,
        },
      });
      expect(plan.cardCount).toBe(count);
    }
  });

  it("requires the interpretation request to carry the planner's answer contract", () => {
    const base = {
      action: "interpret" as const,
      question: "현재 흐름이 어떻게 보이나요?",
      cards: [{
        cardId: "major-00",
        reversed: false,
        positionId: "core",
        positionTitle: "핵심 흐름",
        positionFocus: "질문의 중심 신호",
        round: 0,
      }],
      language: "ko" as const,
    };
    expect(tarotApiRequestSchema.safeParse(base).success).toBe(false);
    expect(tarotApiRequestSchema.safeParse({
      ...base,
      answerContract: {
        kind: "analysis",
        subject: "현재 흐름",
        candidates: [],
        decisive: false,
      },
    }).success).toBe(true);
  });
});

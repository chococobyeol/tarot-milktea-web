import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readingResultSchema, tarotApiRequestSchema } from "@/src/lib/schemas";
import {
  createSessionDeck,
  designReading,
  generateReadingResult,
  TAROT_CARDS,
  type SelectedCard,
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
    }
  });

  it("creates a shuffled session deck with a fixed orientation per card", () => {
    const deck = createSessionDeck();
    expect(deck).toHaveLength(78);
    expect(new Set(deck.map((card) => card.cardId)).size).toBe(78);
    expect(deck.every((card) => typeof card.reversed === "boolean")).toBe(true);
    expect(deck.map((card) => card.order)).toEqual([...Array(78).keys()]);
  });
});

describe("reading design and interpretation", () => {
  it.each([
    ["오늘 한 가지 핵심만 확인하고 싶다", 1],
    ["이 관계에서 반복되는 문제와 조정할 부분은?", 2],
    ["A안과 B안 중 무엇을 기준으로 비교해야 하나?", 4],
  ])("assigns a valid card structure for %s", (question, expected) => {
    const plan = designReading(question);
    expect(plan.cardCount).toBe(expected);
    expect(plan.positions).toHaveLength(expected);
    expect(plan.cardCount).toBeGreaterThanOrEqual(1);
    expect(plan.cardCount).toBeLessThanOrEqual(5);
  });

  it("returns schema-valid indicators whose signal sum is 100", () => {
    const plan = designReading("이직을 준비할 때 먼저 확인할 조건은 무엇인가?");
    const deck = createSessionDeck();
    const selected: SelectedCard[] = deck.slice(0, plan.cardCount).map((card, index) => ({
      cardId: card.cardId,
      reversed: card.reversed,
      positionId: plan.positions[index].id,
      positionTitle: plan.positions[index].title,
      positionFocus: plan.positions[index].focus,
      round: 0,
    }));
    const result = generateReadingResult("이직을 준비할 때 먼저 확인할 조건은 무엇인가?", selected);

    expect(readingResultSchema.parse(result)).toEqual(result);
    expect(result.cardInterpretations).toHaveLength(selected.length);
    expect(result.signals.support + result.signals.caution + result.signals.uncertainty).toBe(100);
    expect(result.axes.length).toBeGreaterThanOrEqual(3);
    expect(result.axes.length).toBeLessThanOrEqual(5);
  });

  it("creates an English plan and local interpretation when requested", () => {
    const question = "What should I focus on during the next month?";
    const plan = designReading(question, false, "en");
    const deck = createSessionDeck();
    const selected: SelectedCard[] = deck.slice(0, plan.cardCount).map((card, index) => ({
      cardId: card.cardId,
      reversed: card.reversed,
      positionId: plan.positions[index].id,
      positionTitle: plan.positions[index].title,
      positionFocus: plan.positions[index].focus,
      round: 0,
    }));
    const result = generateReadingResult(question, selected, undefined, "en");

    expect(plan.positions[0].title).toMatch(/[A-Za-z]/);
    expect(result.summary).toMatch(/[A-Za-z]/);
    expect(result.limitation).toContain("probabilities");
    expect(readingResultSchema.parse(result)).toEqual(result);
    expect(tarotApiRequestSchema.parse({ action: "plan", question, language: "en" }).language).toBe("en");
  });

  it("does not describe a one-card reading as a multi-card flow", () => {
    const plan = designReading("오늘 한 가지 핵심만 확인하고 싶다");
    const [card] = createSessionDeck();
    const selected: SelectedCard[] = [{
      cardId: card.cardId,
      reversed: card.reversed,
      positionId: plan.positions[0].id,
      positionTitle: plan.positions[0].title,
      positionFocus: plan.positions[0].focus,
      round: 0,
    }];

    const result = generateReadingResult("오늘 한 가지 핵심만 확인하고 싶다", selected);
    expect(result.summary).not.toContain("함께 나타나므로");
    expect(result.synthesis).not.toContain("카드 흐름은");
  });

  it("rejects duplicate cards", () => {
    const plan = designReading("현재 상황을 자세히 보고 싶다");
    const position = plan.positions[0];
    const duplicate = {
      cardId: TAROT_CARDS[0].id,
      reversed: false,
      positionId: position.id,
      positionTitle: position.title,
      positionFocus: position.focus,
      round: 0,
    };
    const parsed = tarotApiRequestSchema.safeParse({
      action: "interpret",
      question: "현재 상황을 자세히 보고 싶다",
      cards: [duplicate, duplicate],
    });
    expect(parsed.success).toBe(false);
  });
});

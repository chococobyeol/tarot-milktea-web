import { describe, expect, it } from "vitest";

import { createAiInterpretation, createAiPlan } from "@/app/api/tarot/route";
import type { SelectedCard } from "@/src/lib/tarot";
import type { WorkersAIBinding } from "@/src/server/security";

const groqApiKey = process.env.GROQ_API_KEY;
const liveDescribe = groqApiKey ? describe : describe.skip;

liveDescribe("Groq quota fallback live check", () => {
  it("passes the production plan and interpretation quality gates", async () => {
    const exhaustedWorkersAi: WorkersAIBinding = {
      async run() {
        throw new Error("4006: You have used up your daily free allocation of 10,000 neurons.");
      },
    };
    const question = "아침 뭐 먹을까?";
    const plan = await createAiPlan(exhaustedWorkersAi, question, false, "ko", undefined, groqApiKey);
    const cardIds = ["major-07", "wands-04", "cups-knight", "pentacles-king", "swords-02"];
    const cards: SelectedCard[] = plan.positions.map((position, index) => ({
      cardId: cardIds[index],
      reversed: index % 2 === 1,
      positionId: position.id,
      positionTitle: position.title,
      positionFocus: position.focus,
      round: 0,
    }));

    const reading = await createAiInterpretation(
      exhaustedWorkersAi,
      question,
      cards,
      undefined,
      "ko",
      plan.answerContract,
      undefined,
      groqApiKey,
    );

    expect(plan.answerContract).toMatchObject({
      kind: "recommend_one",
      candidates: [],
      decisive: true,
    });
    expect(plan.cardCount).toBeGreaterThanOrEqual(1);
    expect(plan.cardCount).toBeLessThanOrEqual(5);
    expect(plan.positions).toHaveLength(plan.cardCount);
    expect(plan.positions.every((position) => !position.title.endsWith(" 선택"))).toBe(true);
    expect(reading.verdict?.kind).toBe("recommend_one");
    expect(reading.verdict?.value).not.toMatch(/^(?:메뉴|음식|적당한 것|상황에 맞는 선택)$/);
    expect(reading.cardInterpretations).toHaveLength(plan.cardCount);
    expect(reading.summary.startsWith(reading.verdict?.statement ?? "__missing__")).toBe(true);
    expect(reading.signals.support + reading.signals.caution + reading.signals.uncertainty).toBe(100);
  }, 90_000);
});

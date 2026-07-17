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
    const question = "내가 요즘 새로운 사람들과 가까워지기 어려운 중심 원인은 무엇일까?";
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

    expect(plan.answerContract.kind).toBe("explain");
    expect(plan.positions).toHaveLength(plan.cardCount);
    expect(reading.verdict?.kind).toBe("explain");
    expect(reading.cardInterpretations).toHaveLength(plan.cardCount);
    expect(reading.summary.startsWith(reading.verdict?.statement ?? "__missing__")).toBe(true);
    expect(reading.signals.support + reading.signals.caution + reading.signals.uncertainty).toBe(100);
  }, 90_000);
});

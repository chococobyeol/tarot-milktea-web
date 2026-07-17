import { describe, expect, it, vi } from "vitest";

import {
  createAiInterpretation,
  createAiPlan,
} from "@/app/api/tarot/route";
import type { AnswerContract } from "@/src/lib/tarot";

function aiPlan(cardCount: number) {
  return {
    interpretationFrame: "질문에 답하는 데 필요한 역할을 카드로 읽어요.",
    selectionGuide: `${cardCount}장의 카드를 선택해요.`,
    positions: Array.from({ length: cardCount }, (_, index) => ({
      id: `position-${index + 1}`,
      title: `역할 ${index + 1}`,
      focus: `최종 답에 필요한 관점 ${index + 1}`,
    })),
    answerContract: {
      kind: "analysis",
      subject: "질문의 핵심",
      candidates: [],
    },
  };
}

describe("AI-owned planning", () => {
  it("derives four cards from the AI-selected roles for a short question", async () => {
    const workersRun = vi.fn(async () => ({ response: JSON.stringify(aiPlan(4)) }));
    const plan = await createAiPlan(
      { run: workersRun },
      "왜 이럴까?",
      false,
      "ko",
    );
    expect(plan.cardCount).toBe(4);
    const request = workersRun.mock.calls[0][1] as { messages: Array<{ content: string }> };
    expect(request.messages[1].content).not.toContain("기본 권장 수");
    expect(request.messages[1].content).not.toMatch(/length\s*[><=]|\d+자\s*(?:이상|미만)/i);
  });

  it("derives two cards from the AI-selected roles for a long question", async () => {
    const workersRun = vi.fn(async () => ({ response: JSON.stringify(aiPlan(2)) }));
    const plan = await createAiPlan(
      { run: workersRun },
      "지금까지 생긴 일과 제가 생각한 여러 가능성을 길게 설명했지만 중심 원인과 그 영향만 정확히 알고 싶어요.",
      false,
      "ko",
    );
    expect(plan.cardCount).toBe(2);
  });

  it("does not override the answer kind selected by the AI", async () => {
    const payload = aiPlan(1);
    payload.answerContract = {
      kind: "explain",
      subject: "계속 같은 고민을 하는 원인",
      candidates: [],
    };
    const workersRun = vi.fn(async () => ({ response: JSON.stringify(payload) }));
    const plan = await createAiPlan(
      { run: workersRun },
      "무엇을 고를지 계속 고민하는 이유가 뭘까?",
      false,
      "ko",
    );
    expect(plan.answerContract.kind).toBe("explain");
  });

  it("accepts yes/no roles that describe meaning instead of repeating 예 and 아니요", async () => {
    const workersRun = vi.fn(async () => ({
      response: JSON.stringify({
        interpretationFrame: "강화 성공 여부를 반대되는 두 신호로 확인해요.",
        selectionGuide: "카드 두 장을 선택해요.",
        positions: [
          { id: "success", title: "성공 신호", focus: "강화가 성공할 가능성을 높이는 흐름" },
          { id: "failure", title: "실패 신호", focus: "강화가 실패할 가능성을 높이는 흐름" },
        ],
        answerContract: {
          kind: "yes_no",
          subject: "강화 성공 여부",
          candidates: ["예", "아니요"],
        },
      }),
    }));

    const plan = await createAiPlan(
      { run: workersRun },
      "강화에 성공할까요?",
      false,
      "ko",
    );

    expect(plan.cardCount).toBe(2);
    expect(plan.positions.map((position) => position.title)).toEqual(["성공 신호", "실패 신호"]);
    expect(workersRun).toHaveBeenCalledTimes(1);
  });
});

describe("generic interpretation", () => {
  it("keeps the AI's direct sentence instead of applying a topic template", async () => {
    const contract: AnswerContract = {
      kind: "recommend_one",
      subject: "새 캐릭터 이름 하나",
      candidates: [],
    };
    const workersRun = vi.fn(async () => ({
      response: JSON.stringify({
        verdict: { value: "루미", statement: "새 캐릭터 이름은 루미가 좋아요." },
        summary: "별 카드의 밝은 이미지가 기억하기 쉬운 이름과 이어져요.",
        cardInterpretations: [{
          cardId: "major-17",
          positionTitle: "이름의 핵심 인상",
          orientation: "upright",
          text: "밝고 또렷하게 기억되는 이름이 잘 맞아요.",
          reasoning: {
            sourceMeaning: "별 정방향은 희망과 영감, 앞으로 나아갈 밝은 가능성을 뜻해요.",
            questionConnection: "이름의 핵심 인상 자리에서 별의 희망과 영감은 밝고 선명한 소리의 이름으로 연결돼요.",
            decisionImpact: "이 신호가 루미라는 짧은 이름을 선택하는 데 강한 근거가 돼요.",
          },
        }],
        synthesis: "별 카드는 밝고 기억하기 쉬운 인상을 가진 이름을 고르는 근거가 돼요.",
        guidance: ["두 음절 발음을 소리 내어 확인해요."],
        axes: [
          { label: "기억성", score: 78, evidence: "밝은 인상이 이름을 기억하기 쉽게 해요.", evidenceCardIds: ["major-17"] },
          { label: "발음 선명도", score: 74, evidence: "짧은 음절이 또렷하게 들려요.", evidenceCardIds: ["major-17"] },
          { label: "결론 선명도", score: 70, evidence: "카드 신호가 한 이름으로 모여요.", evidenceCardIds: ["major-17"] },
        ],
        signals: { support: 62, caution: 18, uncertainty: 20 },
      }),
    }));

    const result = await createAiInterpretation(
      { run: workersRun },
      "새 게임 캐릭터 이름 뭐가 좋을까?",
      [{
        cardId: "major-17",
        reversed: false,
        positionId: "name-impression",
        positionTitle: "이름의 핵심 인상",
        positionFocus: "카드가 가리키는 이름의 인상",
        round: 0,
      }],
      undefined,
      "ko",
      contract,
    );

    expect(result.verdict?.statement).toBe("새 캐릭터 이름은 루미가 좋아요.");
    expect(result.verdict?.kind).toBe("recommend_one");
    expect(workersRun).toHaveBeenCalledTimes(1);
  });
});

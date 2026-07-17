import { describe, expect, it } from "vitest";

import {
  enforcePlanQuality,
  enforceReadingQuality,
  type ExpectedInterpretation,
} from "./reading-quality";
import type { AnswerContract, ReadingPlan, ReadingResult } from "./tarot";

function analysisPlan(cardCount: number): ReadingPlan {
  return {
    cardCount,
    interpretationFrame: "질문에 답하는 데 필요한 관점을 읽어요.",
    selectionGuide: `${cardCount}장의 카드를 선택해요.`,
    positions: Array.from({ length: cardCount }, (_, index) => ({
      id: `position-${index + 1}`,
      title: `관점 ${index + 1}`,
      focus: `최종 답에 기여할 관점 ${index + 1}`,
    })),
    answerContract: {
      kind: "analysis",
      subject: "질문의 핵심",
      candidates: [],
    },
  };
}

const expectedCard: ExpectedInterpretation = {
  cardId: "major-07",
  cardName: "전차",
  positionTitle: "결론 신호",
  positionFocus: "최종 답을 가장 크게 기울이는 의미",
  orientation: "upright",
  orientationLabel: "정방향",
  sourceKeywords: ["추진력", "통제", "전진"],
  evidence: ["정방향 · 추진력 · 통제", "자리 · 결론 신호"],
};

function reading(contract: AnswerContract = {
  kind: "analysis",
  subject: "질문의 핵심",
  candidates: [],
}): ReadingResult {
  return {
    verdict: {
      kind: contract.kind,
      value: "바로 실행하는 쪽",
      statement: "지금은 바로 실행하는 쪽으로 보여요.",
    },
    summary: "전차의 추진력이 망설임보다 실행 쪽에 무게를 실어요.",
    cardInterpretations: [{
      cardId: expectedCard.cardId,
      positionTitle: expectedCard.positionTitle,
      orientation: expectedCard.orientation,
      text: "망설이기보다 정한 방향으로 움직이는 힘이 더 강해요.",
      reasoning: {
        sourceMeaning: "전차 정방향은 추진력을 유지하며 목표를 향해 움직이는 의미예요.",
        questionConnection: "결론을 정하는 자리에서 전차의 추진력은 생각을 행동으로 옮기는 흐름과 연결돼요.",
        decisionImpact: "이 카드는 최종 답을 실행 쪽으로 강하게 기울여요.",
      },
      evidence: expectedCard.evidence,
    }],
    synthesis: "전차 카드는 망설임보다 실행을 우선하는 결론에 무게를 더해요.",
    guidance: ["정한 첫 행동을 바로 시작해요."],
    axes: [
      { label: "실행 신호", score: 72, evidence: "전차가 행동 쪽을 지지해요.", evidenceCardIds: [expectedCard.cardId] },
      { label: "주의 신호", score: 35, evidence: "속도를 조절할 필요는 있어요.", evidenceCardIds: [expectedCard.cardId] },
      { label: "결론 선명도", score: 68, evidence: "한 방향으로 신호가 모여요.", evidenceCardIds: [expectedCard.cardId] },
    ],
    signals: { support: 60, caution: 24, uncertainty: 16 },
  };
}

describe("domain-neutral plan validation", () => {
  it("preserves a short question with four AI-selected roles", () => {
    const plan = analysisPlan(4);
    expect(enforcePlanQuality(plan, { question: "왜 이럴까?", language: "ko" })).toBe(plan);
  });

  it("preserves a long question with two AI-selected roles", () => {
    const plan = analysisPlan(2);
    const longQuestion = "여러 상황을 차례로 설명했지만 지금 가장 중요한 원인과 그 원인이 앞으로 어떤 영향을 줄지만 알고 싶어요.";
    expect(enforcePlanQuality(plan, { question: longQuestion, language: "ko" })).toBe(plan);
  });

  it("accepts explicit candidates found in the user's question", () => {
    const plan: ReadingPlan = {
      cardCount: 2,
      interpretationFrame: "두 선택을 비교해 하나를 정해요.",
      selectionGuide: "각 선택에 놓을 카드를 고르세요.",
      positions: [
        { id: "a", title: "왼쪽 선택", focus: "왼쪽 선택의 카드 신호" },
        { id: "b", title: "오른쪽 선택", focus: "오른쪽 선택의 카드 신호" },
      ],
      answerContract: {
        kind: "choose_one",
        subject: "두 선택 중 하나",
        candidates: ["왼쪽", "오른쪽"],
      },
    };
    expect(enforcePlanQuality(plan, {
      question: "왼쪽과 오른쪽 중 하나를 골라줘",
      language: "ko",
    })).toBe(plan);
  });

  it("rejects candidates invented before the cards are revealed", () => {
    const plan: ReadingPlan = {
      ...analysisPlan(2),
      positions: [
        { id: "a", title: "첫 번째 선택", focus: "첫 번째 선택의 신호" },
        { id: "b", title: "두 번째 선택", focus: "두 번째 선택의 신호" },
      ],
      answerContract: {
        kind: "choose_one",
        subject: "AI가 만든 선택",
        candidates: ["첫 번째", "두 번째"],
      },
    };
    expect(() => enforcePlanQuality(plan, {
      question: "무엇을 고르면 좋을까?",
      language: "ko",
    })).toThrow(/사용자가 제시한 표현/);
  });

  it("allows candidates inherited from the previous AI plan", () => {
    const plan: ReadingPlan = {
      cardCount: 2,
      interpretationFrame: "앞선 두 선택의 결론을 정해요.",
      selectionGuide: "각 선택에 놓을 카드를 고르세요.",
      positions: [
        { id: "a", title: "A안", focus: "A안의 추가 신호" },
        { id: "b", title: "B안", focus: "B안의 추가 신호" },
      ],
      answerContract: { kind: "choose_one", subject: "앞선 선택", candidates: ["A안", "B안"] },
    };
    expect(enforcePlanQuality(plan, {
      question: "그래서 어느 쪽이야?",
      language: "ko",
      conversation: {
        previousContract: { kind: "choose_one", subject: "두 안", candidates: ["A안", "B안"] },
      },
    })).toBe(plan);
  });

  it("accepts semantic yes/no roles without repeating the candidate literals", () => {
    const plan: ReadingPlan = {
      cardCount: 2,
      interpretationFrame: "강화 성공 여부를 서로 반대되는 신호로 확인해요.",
      selectionGuide: "성공과 실패를 가리키는 카드 두 장을 선택해요.",
      positions: [
        { id: "success", title: "성공 신호", focus: "강화 결과를 성공 쪽으로 기울이는 흐름" },
        { id: "failure", title: "실패 신호", focus: "강화 결과를 실패 쪽으로 기울이는 흐름" },
      ],
      answerContract: {
        kind: "yes_no",
        subject: "강화 성공 여부",
        candidates: ["예", "아니요"],
      },
    };

    expect(enforcePlanQuality(plan, {
      question: "강화에 성공할까요?",
      language: "ko",
    })).toBe(plan);
  });
});

describe("domain-neutral interpretation validation", () => {
  it("accepts a grounded result without checking topic keywords", () => {
    const result = reading();
    expect(enforceReadingQuality(result, {
      expectedCards: [expectedCard],
      answerContract: { kind: "analysis", subject: "새로운 질문", candidates: [] },
    })).toBe(result);
  });

  it("rejects a card reference that does not match the selected spread", () => {
    const result = reading();
    result.cardInterpretations[0].cardId = "major-08";
    expect(() => enforceReadingQuality(result, {
      expectedCards: [expectedCard],
    })).toThrow(/카드 ID/);
  });

  it("rejects a choice outside the supplied candidates", () => {
    const contract: AnswerContract = {
      kind: "choose_one",
      subject: "두 선택 중 하나",
      candidates: ["A안", "B안"],
    };
    const result = reading(contract);
    expect(() => enforceReadingQuality(result, {
      expectedCards: [expectedCard],
      answerContract: contract,
    })).toThrow(/후보 중 정확히 하나/);
  });

  it("rejects a summary that repeats the separately displayed verdict", () => {
    const result = reading();
    result.summary = `${result.verdict?.statement} 전차의 추진력이 결론을 앞당겨요.`;
    expect(() => enforceReadingQuality(result, {
      expectedCards: [expectedCard],
      answerContract: { kind: "analysis", subject: "새로운 질문", candidates: [] },
    })).toThrow(/되풀이하지 말아야/);
  });
});

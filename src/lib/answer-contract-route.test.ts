import { describe, expect, it } from "vitest";

import { canUsePlanFallback, stabilizeAnswerContractReading } from "@/app/api/tarot/route";
import { enforceReadingQuality, type ExpectedInterpretation } from "@/src/lib/reading-quality";
import { readingResultSchema } from "@/src/lib/schemas";
import type { AnswerContract, ReadingResult } from "@/src/lib/tarot";
import { ApiError } from "@/src/server/security";

describe("candidate answer stabilization", () => {
  it("does not repeat a direct outcome in the guidance list", () => {
    const result: ReadingResult = {
      verdict: {
        kind: "outcome",
        value: "실패",
        statement: "이번 강화는 실패할 거예요.",
      },
      summary: "이번 강화는 실패할 거예요. 역방향 카드의 방해 신호가 더 강해요.",
      cardInterpretations: [{
        cardId: "major-07",
        positionTitle: "강화 결과",
        orientation: "reversed",
        text: "강화 결과가 실패 쪽으로 기울어요.",
        reasoning: {
          sourceMeaning: "전차 역방향은 통제 상실과 방향 이탈을 뜻해요.",
          questionConnection: "강화 결과 자리에서 통제 상실은 성공 흐름이 꺾이는 모습으로 이어져요.",
          decisionImpact: "실패 쪽 결론에 강한 무게를 더해요.",
        },
        evidence: ["역방향 · 통제 상실", "자리 · 강화 결과"],
      }],
      synthesis: "전차 카드는 강화 과정의 통제가 무너지며 실패 쪽으로 기우는 근거가 돼요.",
      guidance: ["강화 재료를 다시 모아요.", "다음 시도까지 기다려요."],
      axes: [
        { label: "성공 신호", score: 25, evidence: "성공을 지지하는 힘이 약해요.", evidenceCardIds: ["major-07"] },
        { label: "실패 신호", score: 70, evidence: "통제 상실이 실패 쪽을 강화해요.", evidenceCardIds: ["major-07"] },
        { label: "결론 선명도", score: 78, evidence: "부정 신호가 뚜렷해요.", evidenceCardIds: ["major-07"] },
      ],
      signals: { support: 25, caution: 55, uncertainty: 20 },
    };

    expect(stabilizeAnswerContractReading(result, {
      kind: "outcome",
      subject: "강화 성공 여부",
      candidates: [],
      decisive: true,
    }).guidance).toEqual(result.guidance);
  });

  it("does not lead an open recommendation into card selection when AI is unavailable", () => {
    const openRecommendation: AnswerContract = {
      kind: "recommend_one",
      subject: "오늘 먹을 메뉴 하나",
      candidates: [],
      decisive: true,
    };
    expect(canUsePlanFallback(openRecommendation)).toBe(false);
    expect(canUsePlanFallback(openRecommendation, new ApiError(503, "DAILY_AI_LIMIT", "limit"))).toBe(false);
    expect(canUsePlanFallback(openRecommendation, new ApiError(502, "INVALID_AI_RESPONSE", "invalid"))).toBe(true);

    const suppliedChoice: AnswerContract = {
      kind: "choose_one",
      subject: "두 메뉴 중 하나",
      candidates: ["김치찌개", "애호박찌개"],
      decisive: true,
    };
    expect(canUsePlanFallback(suppliedChoice)).toBe(true);
  });

  it("repairs direct-answer placement without replacing the AI reading", () => {
    const answerContract: AnswerContract = {
      kind: "choose_one",
      subject: "제시된 아침 식사 메뉴 중 하나",
      candidates: ["토스트", "계란볶음밥", "과일 요거트"],
      decisive: true,
    };
    const expectedCards: ExpectedInterpretation[] = [
      {
        cardId: "major-04",
        cardName: "황제",
        positionTitle: "토스트 선택",
        positionFocus: "토스트 선택에 카드가 주는 지지와 주의 신호",
        orientation: "reversed",
        orientationLabel: "역방향",
        sourceMeaning: "황제 역방향의 핵심은 경직·권위 충돌·통제 상실이에요. 규칙이 목적을 잃고 과도한 통제로 변할 수 있어요.",
        sourceKeywords: ["경직", "권위 충돌"],
        evidence: ["역방향 · 경직 · 권위 충돌", "자리 · 토스트 선택"],
      },
      {
        cardId: "wands-04",
        cardName: "완드 4",
        positionTitle: "계란볶음밥 선택",
        positionFocus: "계란볶음밥 선택에 카드가 주는 지지와 주의 신호",
        orientation: "reversed",
        orientationLabel: "역방향",
        sourceMeaning: "완드 4 역방향의 핵심은 불안정·소속감 부족·행사 차질이에요. 겉과 내부의 안정감이 다를 수 있어요.",
        sourceKeywords: ["불안정", "소속감 부족"],
        evidence: ["역방향 · 불안정 · 소속감 부족", "자리 · 계란볶음밥 선택"],
      },
      {
        cardId: "cups-knight",
        cardName: "컵 기사",
        positionTitle: "과일 요거트 선택",
        positionFocus: "과일 요거트 선택에 카드가 주는 지지와 주의 신호",
        orientation: "upright",
        orientationLabel: "정방향",
        sourceMeaning: "컵 기사 정방향의 핵심은 제안·이상·낭만이에요. 감정과 이상을 바탕으로 적극적인 제안을 할 수 있어요.",
        sourceKeywords: ["제안", "이상"],
        evidence: ["정방향 · 제안 · 이상", "자리 · 과일 요거트 선택"],
      },
    ];
    const ungroundedAiResult: ReadingResult = {
      verdict: {
        kind: "choose_one",
        value: "과일 요거트",
        statement: "아침 식사 메뉴로 과일 요거트를 추천해요.",
      },
      summary: "아침 식사 메뉴로 과일 요거트를 추천해요. 과일 요거트가 더 편안한 식사가 될 거예요.",
      cardInterpretations: expectedCards.map((card) => ({
        cardId: card.cardId,
        positionTitle: card.positionTitle,
        orientation: card.orientation,
        text: "준비 과정과 식사 환경을 예측해요.",
        reasoning: {
          sourceMeaning: card.sourceMeaning,
          questionConnection: "카드가 메뉴의 실제 준비 상태와 식사 환경을 보여줘요.",
          decisionImpact: "이 메뉴가 더 만족스러운 결과를 가져올 거예요.",
        },
        evidence: card.evidence,
      })),
      synthesis: "토스트는 복잡하고 계란볶음밥은 불안정하며 과일 요거트는 편안해요.",
      guidance: ["편안한 메뉴를 골라요."],
      axes: [
        { label: "준비 편의", score: 50, evidence: "준비를 예측해요.", evidenceCardIds: ["major-04"] },
        { label: "식사 환경", score: 50, evidence: "환경을 예측해요.", evidenceCardIds: ["wands-04"] },
        { label: "만족감", score: 50, evidence: "만족을 예측해요.", evidenceCardIds: ["cups-knight"] },
      ],
      signals: { support: 50, caution: 30, uncertainty: 20 },
    };

    const stabilized = stabilizeAnswerContractReading(ungroundedAiResult, answerContract);

    expect(readingResultSchema.parse(stabilized)).toEqual(stabilized);
    expect(stabilized.summary.startsWith(ungroundedAiResult.verdict!.statement)).toBe(true);
    expect(stabilized.cardInterpretations).toEqual(ungroundedAiResult.cardInterpretations);
    expect(stabilized.axes).toEqual(ungroundedAiResult.axes);
    expect(JSON.stringify(stabilized)).toMatch(/더 편안한 식사|실제 준비 상태|더 만족스러운 결과|토스트는 복잡/);
    expect(stabilized.signals.support + stabilized.signals.caution + stabilized.signals.uncertainty).toBe(100);
    expect(() => enforceReadingQuality(stabilized, {
      question: "토스트, 계란볶음밥, 과일 요거트 중 아침 메뉴 하나를 골라줘",
      language: "ko",
      sourceSentences: [],
      expectedCards,
      answerContract,
    })).toThrow();
  });
});

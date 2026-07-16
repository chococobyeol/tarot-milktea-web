import { describe, expect, it } from "vitest";

import { stabilizeAnswerContractReading } from "@/app/api/tarot/route";
import { enforceReadingQuality, type ExpectedInterpretation } from "@/src/lib/reading-quality";
import { readingResultSchema } from "@/src/lib/schemas";
import type { AnswerContract, ReadingResult } from "@/src/lib/tarot";

describe("candidate answer stabilization", () => {
  it("repairs direct-answer placement without replacing the AI reading", () => {
    const answerContract: AnswerContract = {
      kind: "recommend_one",
      subject: "아침 식사 메뉴",
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
    const unsafeAiResult: ReadingResult = {
      verdict: {
        kind: "recommend_one",
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
      limitation: "확정 예측은 아니에요.",
    };

    const stabilized = stabilizeAnswerContractReading(unsafeAiResult, answerContract, "ko");

    expect(readingResultSchema.parse(stabilized)).toEqual(stabilized);
    expect(stabilized.summary.startsWith(unsafeAiResult.verdict!.statement)).toBe(true);
    expect(stabilized.cardInterpretations).toEqual(unsafeAiResult.cardInterpretations);
    expect(stabilized.axes).toEqual(unsafeAiResult.axes);
    expect(JSON.stringify(stabilized)).toMatch(/더 편안한 식사|실제 준비 상태|더 만족스러운 결과|토스트는 복잡/);
    expect(stabilized.signals.support + stabilized.signals.caution + stabilized.signals.uncertainty).toBe(100);
    expect(() => enforceReadingQuality(stabilized, {
      question: "아침 뭐 먹을까?",
      language: "ko",
      sourceSentences: [],
      expectedCards,
      answerContract,
    })).toThrow();
  });
});

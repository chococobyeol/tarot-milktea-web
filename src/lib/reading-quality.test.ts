import { describe, expect, it } from "vitest";
import { enforceReadingQuality, groundPositionConnection, polishReadingLanguage } from "./reading-quality";
import type { ReadingResult } from "./tarot";

const baseResult: ReadingResult = {
  summary: "오늘 아침에는 준비가 간단하면서도 오전 일정까지 버틸 수 있는 식사를 우선하는 편이 낫다.",
  synthesis: "전차는 메뉴를 오래 고민하기보다 오늘 일정에 맞춰 한 가지를 정하라는 근거가 된다. 펜타클 왕은 가격이나 유행보다 포만감과 익숙함을 우선하는 쪽에 무게를 둔다. 완드 9는 이미 피곤하다면 준비 과정이 복잡한 메뉴를 피하라는 근거가 된다.",
  guidance: ["아침 식사 준비에 쓸 수 있는 시간을 먼저 정한다.", "오전 중 필요한 포만감을 기준으로 식사량을 고른다."],
  cardInterpretations: [
    {
      cardId: "major-07",
      positionTitle: "선택 속도",
      orientation: "upright",
      text: "준비 시간 안에 결정할 수 있는 메뉴를 먼저 고른다.",
      reasoning: {
        sourceMeaning: "전차 정방향은 목표를 정하고 방해 요소를 조율하며 앞으로 밀고 가는 추진력을 뜻한다.",
        questionConnection: "선택 속도 자리에서는 메뉴 비교를 오래 이어 가기보다 준비할 수 있는 시간 안에 기준을 정해야 하기 때문에, 전차의 추진력이 빠른 결정과 연결된다.",
        decisionImpact: "후보를 두세 개로 줄인 뒤 오전 일정에 맞는 메뉴를 바로 선택하는 쪽을 지지한다.",
      },
      evidence: ["정방향 · 추진 · 집중", "자리 · 선택 속도"],
    },
    {
      cardId: "pentacles-king",
      positionTitle: "식사 기준",
      orientation: "upright",
      text: "익숙한 재료와 충분한 식사량을 선택 기준으로 둔다.",
      reasoning: {
        sourceMeaning: "펜타클 왕 정방향은 현실 조건을 확인하고 가진 것을 안정적으로 관리하는 실용성을 뜻한다.",
        questionConnection: "식사 기준 자리에서는 새로움보다 지금 있는 재료와 예상 가능한 포만감을 확인해야 하므로, 이 카드의 실용성이 실제 메뉴 기준으로 연결된다.",
        decisionImpact: "현재 재료로 만들 수 있고 양을 가늠하기 쉬운 식사를 우선하되, 익숙함만으로 영양을 단정하지 않는다.",
      },
      evidence: ["정방향 · 실용 · 관리", "자리 · 식사 기준"],
    },
    {
      cardId: "wands-09",
      positionTitle: "준비 부담",
      orientation: "upright",
      text: "아침의 남은 체력을 고려해 조리 단계가 짧은 메뉴를 고른다.",
      reasoning: {
        sourceMeaning: "완드 9 정방향은 지친 상태에서도 경계를 유지하며 마지막까지 버티는 지속력을 뜻한다.",
        questionConnection: "준비 부담 자리에서는 이미 피곤할 때 복잡한 조리를 시작하면 식사 준비를 끝내기 어렵기 때문에, 지속력의 의미가 체력 배분과 연결된다.",
        decisionImpact: "조리 단계를 줄여 식사는 챙기되, 피곤하다는 이유로 끼니 자체를 거르지는 않는 쪽에 무게를 둔다.",
      },
      evidence: ["정방향 · 지속 · 경계", "자리 · 준비 부담"],
    },
  ],
  axes: [
    { label: "준비 편의", score: 72, evidence: "준비 부담을 낮추는 흐름이다.", evidenceCardIds: ["major-07"] },
    { label: "포만감", score: 68, evidence: "안정적인 식사를 지지한다.", evidenceCardIds: ["major-07"] },
    { label: "피로 부담", score: 40, evidence: "복잡한 준비는 피하는 편이 낫다.", evidenceCardIds: ["major-07"] },
  ],
  signals: { support: 58, caution: 24, uncertainty: 18 },
  limitation: "이 수치는 카드 관계를 비교하기 위한 해석 지표이며 실제 영양 평가가 아니다.",
};

const expectedCards = [
  {
    cardId: "major-07",
    cardName: "전차",
    positionTitle: "선택 속도",
    positionFocus: "아침 메뉴를 결정하는 데 쓸 시간",
    orientation: "upright" as const,
    orientationLabel: "정방향",
    sourceMeaning: "전차 정방향은 목표를 정하고 방해 요소를 조율하며 앞으로 밀고 가는 추진력을 뜻한다.",
    sourceKeywords: ["추진", "집중"],
    evidence: ["정방향 · 추진 · 집중", "자리 · 선택 속도"],
  },
  {
    cardId: "pentacles-king",
    cardName: "펜타클 왕",
    positionTitle: "식사 기준",
    positionFocus: "현재 재료와 필요한 식사량",
    orientation: "upright" as const,
    orientationLabel: "정방향",
    sourceMeaning: "펜타클 왕 정방향은 현실 조건을 확인하고 가진 것을 안정적으로 관리하는 실용성을 뜻한다.",
    sourceKeywords: ["실용", "관리"],
    evidence: ["정방향 · 실용 · 관리", "자리 · 식사 기준"],
  },
  {
    cardId: "wands-09",
    cardName: "완드 9",
    positionTitle: "준비 부담",
    positionFocus: "아침 조리에 쓸 수 있는 체력",
    orientation: "upright" as const,
    orientationLabel: "정방향",
    sourceMeaning: "완드 9 정방향은 지친 상태에서도 경계를 유지하며 마지막까지 버티는 지속력을 뜻한다.",
    sourceKeywords: ["지속", "경계"],
    evidence: ["정방향 · 지속 · 경계", "자리 · 준비 부담"],
  },
];

const cupsKnightExpected = [{
  cardId: "cups-knight",
  cardName: "컵 기사",
  positionTitle: "포만감",
  positionFocus: "먹은 뒤 만족과 포만감이 오전 일정까지 이어질지",
  orientation: "reversed" as const,
  orientationLabel: "역방향",
  sourceMeaning: "컵 기사 역방향은 환상이나 기분 변화가 현실 조건보다 앞서 선택 뒤의 만족이 흔들릴 수 있음을 뜻한다.",
  sourceKeywords: ["환상", "기분 변화", "약속 불이행"],
  evidence: ["역방향 · 환상 · 기분 변화", "자리 · 포만감"],
}];

const cupsKnightResult: ReadingResult = {
  summary: "지금 당기는 메뉴보다 실제 배고픔과 오전 일정에 필요한 든든함을 먼저 확인한다.",
  synthesis: "컵 기사는 순간적으로 먹고 싶은 메뉴와 먹은 뒤 필요한 포만감이 다를 수 있으므로 두 기준을 구분하라는 근거가 된다.",
  guidance: ["현재 배고픔의 정도와 필요한 식사량을 먼저 확인한다.", "후보 메뉴의 양을 알기 어렵다면 익숙하게 양을 가늠할 수 있는 식사를 우선한다."],
  cardInterpretations: [{
    cardId: "cups-knight",
    positionTitle: "포만감",
    orientation: "reversed",
    text: "먹고 싶은 마음과 실제로 필요한 식사량을 구분한다.",
    reasoning: {
      sourceMeaning: "컵 기사 역방향은 환상이나 기분 변화가 현실 조건보다 앞서 선택 뒤의 만족이 흔들릴 수 있음을 뜻한다.",
      questionConnection: "포만감 자리에서 이 카드는 실제 포만감을 예측할 수 없다. 다만 순간적인 당김과 실제 배고픔을 혼동할 수 있다는 주의로 연결되므로, 현재 허기와 사용자가 이미 아는 식사량을 따로 확인한다.",
      decisionImpact: "새로운 메뉴를 피하라는 뜻은 아니다. 양과 포만감을 가늠하기 어렵다면 이미 식사량을 아는 메뉴에 우선순위를 조금 더 둔다.",
    },
    evidence: ["역방향 · 환상 · 기분 변화", "자리 · 포만감"],
  }],
  axes: [
    { label: "포만감 판단", score: 48, evidence: "먹기 전 식사량을 확인할 필요가 있다.", evidenceCardIds: ["cups-knight"] },
    { label: "준비 확실성", score: 62, evidence: "양을 아는 메뉴는 선택 불확실성을 줄인다.", evidenceCardIds: ["cups-knight"] },
    { label: "메뉴 유연성", score: 54, evidence: "새 메뉴 자체를 배제하는 신호는 아니다.", evidenceCardIds: ["cups-knight"] },
  ],
  signals: { support: 38, caution: 42, uncertainty: 20 },
  limitation: "이 해석은 카드 상징을 식사 판단 기준으로 연결한 것이며 실제 영양이나 포만감을 예측하지 않는다.",
};

const scheduleExpected = [{
  cardId: "major-07",
  cardName: "전차",
  positionTitle: "우선순위",
  positionFocus: "오늘 해야 할 일 중 먼저 처리할 기준",
  orientation: "upright" as const,
  orientationLabel: "정방향",
  sourceMeaning: "전차 정방향은 목표를 정하고 방해 요소를 조율하며 앞으로 밀고 가는 추진력을 뜻한다.",
  sourceKeywords: ["추진", "집중"],
  evidence: ["정방향 · 추진 · 집중", "자리 · 우선순위"],
}];

const scheduleResult: ReadingResult = {
  summary: "오늘 할 일은 마감이 가까우면서 영향이 큰 작업 하나를 먼저 시작하는 쪽이 낫다.",
  synthesis: "전차는 우선순위를 정하고 첫 작업에 착수하라는 근거가 된다.",
  guidance: ["가장 중요한 작업 하나를 적는다.", "시작 전에 마감 시간을 확인한다."],
  cardInterpretations: [{
    cardId: "major-07",
    positionTitle: "우선순위",
    orientation: "upright",
    text: "우선순위가 높은 작업 하나부터 시작한다.",
    reasoning: {
      sourceMeaning: "전차 정방향은 목표를 정하고 방해 요소를 조율하며 앞으로 밀고 가는 추진력을 뜻한다.",
      questionConnection: "우선 순위 자리에서는 여러 할 일을 동시에 붙잡기보다 먼저 처리할 작업을 하나 정해야 하므로, 전차의 집중력이 착수 기준과 연결된다.",
      decisionImpact: "마감과 중요도를 비교해 첫 작업을 정하는 쪽을 지지하되, 급한 새 요청이 생기면 순서를 다시 확인한다.",
    },
    evidence: ["정방향 · 추진 · 집중", "자리 · 우선순위"],
  }],
  axes: [
    { label: "중요도", score: 76, evidence: "영향이 큰 작업을 먼저 처리한다.", evidenceCardIds: ["major-07"] },
    { label: "긴급도", score: 68, evidence: "마감이 가까운 과제를 확인한다.", evidenceCardIds: ["major-07"] },
    { label: "착수 난도", score: 54, evidence: "바로 시작할 수 있는 첫 행동을 정한다.", evidenceCardIds: ["major-07"] },
  ],
  signals: { support: 62, caution: 23, uncertainty: 15 },
  limitation: "이 수치는 오늘 일정의 우선순위를 비교하는 해석 지표이며 실제 결과를 보장하지 않는다.",
};

describe("enforceReadingQuality", () => {
  it("accepts concrete Korean tied to an everyday question", () => {
    expect(enforceReadingQuality(baseResult, {
      question: "아침 식사 선택",
      language: "ko",
      sourceSentences: ["속도 때문에 세부 위험이나 타인의 신호를 무시하지 말아야 한다."],
      expectedCards,
    })).toBe(baseResult);
  });

  it("rejects vague, repetitive Korean and copied generic cautions", () => {
    const badResult: ReadingResult = {
      ...baseResult,
      summary: "아침 식사 선택에 대한 방향성과 외부 조건, 실행 가능성에 대한 균형 잡힌 고려가 필요하다.",
      synthesis: "세 가지 요소가 상호작용하며 단순한 결과보다는 선택 기준과 실행 조건의 분리를 통해 접근하는 것이 적절하다.",
      guidance: ["속도 때문에 세부 위험이나 타인의 신호를 무시하지 말아야 한다."],
    };
    expect(() => enforceReadingQuality(badResult, {
      question: "아침 식사 선택",
      language: "ko",
      sourceSentences: ["속도 때문에 세부 위험이나 타인의 신호를 무시하지 말아야 한다."],
      expectedCards,
    })).toThrow();
  });

  it("rejects an everyday reading that falls back to long-term abstractions", () => {
    const badResult: ReadingResult = {
      ...baseResult,
      summary: "선택은 안정적인 기준으로 이루어져야 한다. 장기적 관점에서 지속 가능한 방향을 우선한다.",
      synthesis: "전차는 선택지의 방향을 보여 준다.",
      guidance: ["현재의 자원과 체력에 맞는 메뉴를 선택한다."],
      cardInterpretations: [{ ...baseResult.cardInterpretations[0], text: "다양한 요구를 하나의 목표로 집중할 수 있다." }],
    };
    expect(() => enforceReadingQuality(badResult, {
      question: "아침 식사 선택",
      language: "ko",
      sourceSentences: [],
      expectedCards: [expectedCards[0]],
    })).toThrow();
  });

  it("rejects mixed honorific endings in Korean AI prose", () => {
    expect(() => enforceReadingQuality({
      ...baseResult,
      summary: "오늘 아침에는 현재 배고픔과 준비 시간을 먼저 확인하십시오.",
    }, {
      question: "아침 식사 선택",
      language: "ko",
      sourceSentences: [],
      expectedCards,
    })).toThrow(/문체/);
  });

  it("accepts a Cups Knight reversed explanation that connects source meaning to the food decision", () => {
    expect(enforceReadingQuality(cupsKnightResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toBe(cupsKnightResult);
  });

  it("accepts natural schedule vocabulary and semantic synthesis order", () => {
    expect(enforceReadingQuality(scheduleResult, {
      question: "오늘 해야 할 일을 정할 때 무엇을 우선할까?",
      language: "ko",
      sourceSentences: ["속도 때문에 중요한 확인을 건너뛰지 말아야 한다."],
      expectedCards: scheduleExpected,
    })).toBe(scheduleResult);
  });

  it("adds the server position title when the AI omits its literal wording", () => {
    expect(groundPositionConnection(
      "이 자리에서는 오늘 할 일 중 가장 먼저 처리할 작업을 하나 정한다.",
      "우선순위",
    )).toBe("우선순위 자리에서는 오늘 할 일 중 가장 먼저 처리할 작업을 하나 정한다.");
  });

  it("replaces abstract directionality with a concrete everyday term", () => {
    const polished = polishReadingLanguage({
      ...scheduleResult,
      summary: "오늘의 일정 중 목표를 향한 방향성을 제시하는 일을 먼저 처리한다.",
      cardInterpretations: [{
        ...scheduleResult.cardInterpretations[0],
        reasoning: {
          ...scheduleResult.cardInterpretations[0].reasoning!,
          questionConnection: "전차의 추진과 방향성 설정이 우선순위 자리에 놓이면 오늘 할 일의 목표를 먼저 정하게 한다.",
        },
      }],
      axes: [
        { ...scheduleResult.axes[0], label: "방향성 설정" },
        { ...scheduleResult.axes[1], label: "일정 안정성" },
        ...scheduleResult.axes.slice(2),
      ],
    }, "오늘 해야 할 일을 정할 때 무엇을 우선할까?", "ko");
    expect(polished.cardInterpretations[0].reasoning?.questionConnection)
      .toContain("전차의 추진과 목표 설정이 우선순위 자리에 놓이면");
    expect(polished.cardInterpretations[0].reasoning?.questionConnection)
      .not.toContain("방향성");
    expect(polished.summary).toContain("우선 기준을 제시하는 일");
    expect(polished.axes[0].label).toBe("목표 설정");
    expect(polished.axes[1].label).toBe("일정 유지");
  });

  it("does not confuse schedule reorganization words with financial scope", () => {
    const reorganizedSchedule: ReadingResult = {
      ...scheduleResult,
      guidance: ["오늘 할 일의 기준을 재정립한다.", "마감 순서에 맞춰 일정을 재정비한다."],
    };
    expect(enforceReadingQuality(reorganizedSchedule, {
      question: "오늘 해야 할 일을 정할 때 무엇을 우선할까?",
      language: "ko",
      sourceSentences: ["속도 때문에 중요한 확인을 건너뛰지 말아야 한다."],
      expectedCards: scheduleExpected,
    })).toBe(reorganizedSchedule);
  });

  it("does not let reorganization wording authorize financial claims", () => {
    const financialExpansion: ReadingResult = {
      ...scheduleResult,
      guidance: ["자산과 수익을 먼저 확인한다.", "오늘 일정의 마감 순서를 정한다."],
    };
    expect(() => enforceReadingQuality(financialExpansion, {
      question: "오늘 일정을 재정비하려면 무엇을 우선할까?",
      language: "ko",
      sourceSentences: ["속도 때문에 중요한 확인을 건너뛰지 말아야 한다."],
      expectedCards: scheduleExpected,
    })).toThrow(/일상 질문에 없는 표현/);
  });

  it("removes Markdown decoration from plain-text result fields", () => {
    const polished = polishReadingLanguage({
      ...scheduleResult,
      synthesis: "**전차**는 `우선순위`를 정하고 첫 작업에 착수하라는 근거가 된다.",
    }, "오늘 해야 할 일을 정할 때 무엇을 우선할까?", "ko");
    expect(polished.synthesis).toBe("전차는 우선순위를 정하고 첫 작업에 착수하라는 근거가 된다.");
  });

  it("removes Markdown decoration from English plain-text results", () => {
    const polished = polishReadingLanguage({
      ...scheduleResult,
      synthesis: "**The Chariot** supports starting the highest-priority task.",
      cardInterpretations: [{
        ...scheduleResult.cardInterpretations[0],
        reasoning: {
          ...scheduleResult.cardInterpretations[0].reasoning!,
          sourceMeaning: "**The Chariot** represents directed effort.",
        },
      }],
    }, "What should I prioritize today?", "en");
    expect(polished.synthesis).toBe("The Chariot supports starting the highest-priority task.");
    expect(polished.cardInterpretations[0].reasoning?.sourceMeaning)
      .toBe("The Chariot represents directed effort.");
  });

  it("preserves server-owned source meanings while polishing applied prose", () => {
    const sourceMeaning = "별 정방향의 핵심은 희망·회복·방향성이다. 다시 목표를 바라볼 수 있는 흐름이다.";
    const polished = polishReadingLanguage({
      ...scheduleResult,
      cardInterpretations: [{
        ...scheduleResult.cardInterpretations[0],
        reasoning: {
          ...scheduleResult.cardInterpretations[0].reasoning!,
          sourceMeaning,
          questionConnection: "우선순위 자리에서 방향성을 정하고 오늘 할 일을 시작한다.",
        },
      }],
    }, "오늘 해야 할 일을 정할 때 무엇을 우선할까?", "ko");
    expect(polished.cardInterpretations[0].reasoning?.sourceMeaning).toBe(sourceMeaning);
    expect(polished.cardInterpretations[0].reasoning?.questionConnection).toContain("목표를 정하고");
  });

  it("narrows long-term schedule phrases and cleans internal-key phrasing", () => {
    const polished = polishReadingLanguage({
      ...scheduleResult,
      summary: "장기적인 계획과 장기적인 목표를 세우고 장기적인 회복을 시작한다.",
      guidance: ["우선 기준을 기준으로 오늘 할 일을 정한다.", "장기적인 회복으로 이어지고 일정의 안정성으로 판단한다."],
      cardInterpretations: [{
        ...scheduleResult.cardInterpretations[0],
        reasoning: {
          ...scheduleResult.cardInterpretations[0].reasoning!,
          questionConnection: "sourceMeaning의 회복과 방향성이라는 원뜻이 positionFocus인 오늘 할 일과 연결된다.",
          decisionImpact: "카드 원뜻의 회복과 방향성이라는 원뜻을 자리 초점인 오늘 할 일에 적용한다.",
        },
      }],
    }, "오늘 해야 할 일을 정할 때 무엇을 우선할까?", "ko");
    expect(polished.summary).toBe("오늘 일정과 오늘의 핵심 목표를 세우고 오늘 일정의 재정비를 시작한다.");
    expect(polished.guidance[0]).toBe("우선 기준으로 오늘 할 일을 정한다.");
    expect(polished.guidance[1]).toBe("오늘 일정의 재정비로 이어지고 일정 유지로 판단한다.");
    expect(polished.cardInterpretations[0].reasoning?.questionConnection)
      .toBe("회복과 목표 설정이라는 카드 원뜻이 이 자리에서 살필 오늘 할 일과 연결된다.");
    expect(polished.cardInterpretations[0].reasoning?.decisionImpact)
      .toBe("회복과 목표 설정이라는 카드 원뜻을 이 자리에서 살필 오늘 할 일에 적용한다.");
  });

  it("accepts a physical limitation regardless of Korean word order", () => {
    const reorderedLimit: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          questionConnection: "실제 포만감은 타로 카드만으로 알 수 없다. 포만감 자리에서는 순간적인 당김과 현재 배고픔을 구분하고, 사용자가 이미 아는 식사량을 따로 확인한다.",
          decisionImpact: "현재 배고픔과 사용자가 이미 아는 식사량을 확인하는 판단을 지지한다.",
        },
      }],
    };
    expect(enforceReadingQuality(reorderedLimit, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toBe(reorderedLimit);
  });

  it("rejects a positive physical prediction followed by an unrelated negative word", () => {
    const unsafeResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          questionConnection: "포만감 자리에서 타로 카드는 실제 포만감을 알 수 있다. 현재 배고픔과 식사량을 확인한다.",
          decisionImpact: "메뉴 선택을 판단하기 어렵다. 지금 먹고 싶은 마음을 우선해도 된다고 본다.",
        },
      }],
    };
    expect(() => enforceReadingQuality(unsafeResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: ["가능성보다 반복된 행동을 기준으로 판단해야 한다."],
      expectedCards: cupsKnightExpected,
    })).toThrow(/예측할 수 없다는 경계/);
  });

  it("accepts concrete food axes written with menu, appetite, and hunger terms", () => {
    const resultWithNaturalAxes: ReadingResult = {
      ...cupsKnightResult,
      axes: [
        { label: "메뉴 결정의 확신", score: 61, evidence: "후보 메뉴를 고를 기준을 먼저 정한다.", evidenceCardIds: ["cups-knight"] },
        { label: "식욕의 일관성", score: 45, evidence: "먹고 싶은 마음이 바뀌는지 잠시 확인한다.", evidenceCardIds: ["cups-knight"] },
        { label: "실제 배고픔 일치도", score: 72, evidence: "현재 배고픔과 필요한 식사량을 비교한다.", evidenceCardIds: ["cups-knight"] },
      ],
    };
    expect(enforceReadingQuality(resultWithNaturalAxes, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: ["가능성보다 반복된 행동을 기준으로 판단해야 한다."],
      expectedCards: cupsKnightExpected,
    })).toBe(resultWithNaturalAxes);
  });

  it("rejects the old screenshot-style claim when the reasoning chain is missing", () => {
    const shallowResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        cardId: "cups-knight",
        positionTitle: "포만감",
        orientation: "reversed",
        text: "익숙한 식사로 만족감을 확보한다.",
        evidence: ["새로운 선택보다 익숙한 메뉴가 더 안정적이다", "조리 부담이 적은 음식이 포만감을 높인다"],
      }],
    };

    expect(() => enforceReadingQuality(shallowResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toThrow();
  });

  it("rejects a model-written source meaning that differs from the server card data", () => {
    const alteredResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          sourceMeaning: "컵 기사 역방향은 익숙한 아침 메뉴를 골라야 한다는 뜻이다.",
        },
      }],
    };
    expect(() => enforceReadingQuality(alteredResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toThrow(/서버가 제공한 카드 문장/);
  });

  it("rejects a card summary copied into applied interpretation prose", () => {
    const copiedSummary = "감정은 강하지만 현실 책임이 따라오지 않거나 태도가 자주 변할 수 있다.";
    const copiedResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          questionConnection: `포만감 자리에서는 ${copiedSummary} 다만 타로 카드는 실제 포만감을 알 수 없다.`,
        },
      }],
    };
    expect(() => enforceReadingQuality(copiedResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [copiedSummary],
      expectedCards: cupsKnightExpected,
    })).toThrow(/카드 데이터 문장/);
  });

  it("rejects internal schema keys leaked into visible Korean", () => {
    const leakedResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          questionConnection: "포만감 자리의 positionFocus를 적용하면 현재 배고픔과 순간적인 식욕을 구분해야 한다. 카드는 실제 포만감을 예측할 수 없다.",
        },
      }],
    };
    expect(() => enforceReadingQuality(leakedResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toThrow(/내부 JSON 키/);
  });

  it("rejects unsupported causal claims even when reasoning fields exist", () => {
    const shallowResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        text: "익숙한 식사로 만족감을 확보한다.",
        reasoning: {
          sourceMeaning: cupsKnightExpected[0].sourceMeaning,
          questionConnection: "포만감 자리에서는 새로운 선택보다 익숙한 메뉴가 더 안정적이다. 다만 타로 카드는 실제 포만감을 알 수 없다.",
          decisionImpact: "조리 부담이 적은 음식이 포만감을 높이므로 익숙한 메뉴를 고른다.",
        },
      }],
    };

    expect(() => enforceReadingQuality(shallowResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toThrow(/근거 없는 식사 인과관계/);
  });

  it("rejects mood-based claims about post-meal satisfaction or fullness", () => {
    const inventedResult: ReadingResult = {
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          questionConnection: "포만감 자리에서는 기분 변화가 식사 직후의 만족감이 지속되지 않을 수 있음을 나타낸다. 다만 타로 카드는 실제 포만감을 알 수 없다.",
          decisionImpact: "메뉴를 고를 때 현재 배고픔과 사용자가 이미 아는 식사량을 확인한다.",
        },
      }],
      axes: [
        ...cupsKnightResult.axes.slice(0, 2),
        { label: "식사 만족도 예측", score: 30, evidence: "심리적인 기분 변화로 인해 식사 후 만족감이 달라질 수 있다.", evidenceCardIds: ["cups-knight"] },
      ],
    };
    expect(() => enforceReadingQuality(inventedResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: ["가능성보다 반복된 행동을 기준으로 판단해야 한다."],
      expectedCards: cupsKnightExpected,
    })).toThrow(/근거 없는 식사 인과관계/);
  });

  it("rejects invented food outcomes outside the question and position", () => {
    const inventedResult: ReadingResult = {
      ...cupsKnightResult,
      guidance: [
        "기분 변화 때문에 과식하거나 불충분한 식사를 할 수 있다.",
        "오전 활동량에 맞춰 식사량을 정한다.",
      ],
    };
    expect(() => enforceReadingQuality(inventedResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toThrow();
  });

  it("polishes literal AI phrasing in every reasoning section", () => {
    const polished = polishReadingLanguage({
      ...baseResult,
      guidance: ["오전 동안 지속 가능한 포만감을 고려해 식사를 구성한다."],
      cardInterpretations: [{
        ...baseResult.cardInterpretations[0],
        reasoning: {
          ...baseResult.cardInterpretations[0].reasoning!,
          questionConnection: "선택 속도 자리에서는 오전 동안 지속 가능한 포만감을 확인한다.",
        },
      }, ...baseResult.cardInterpretations.slice(1)],
    }, "아침 식사 선택", "ko");
    expect(polished.guidance[0]).toBe("오전까지 오래가는 포만감을 고려해 식사를 구성한다.");
    expect(polished.cardInterpretations[0].reasoning?.questionConnection).toBe("선택 속도 자리에서는 오전까지 오래가는 포만감을 확인한다.");
  });

  it("replaces internal schema terms without dropping Korean particles", () => {
    const polished = polishReadingLanguage({
      ...cupsKnightResult,
      cardInterpretations: [{
        ...cupsKnightResult.cardInterpretations[0],
        reasoning: {
          ...cupsKnightResult.cardInterpretations[0].reasoning!,
          questionConnection: "positionFocus를 확인하고 positionTitle에 연결한다.",
        },
      }],
    }, "아침 뭐먹을까", "ko");
    expect(polished.cardInterpretations[0].reasoning?.questionConnection)
      .toBe("자리 초점을 확인하고 자리 이름에 연결한다.");
  });
});

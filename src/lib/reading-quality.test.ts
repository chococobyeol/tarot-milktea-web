import { describe, expect, it } from "vitest";
import { enforceReadingQuality, polishReadingLanguage } from "./reading-quality";
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
          sourceMeaning: "익숙한 식사가 더 안정적이라는 의미다.",
          questionConnection: "포만감 자리에서는 새로운 선택보다 익숙한 메뉴가 더 안정적이다.",
          decisionImpact: "조리 부담이 적은 음식이 포만감을 높이므로 익숙한 메뉴를 고른다.",
        },
      }],
    };

    expect(() => enforceReadingQuality(shallowResult, {
      question: "아침 뭐먹을까",
      language: "ko",
      sourceSentences: [cupsKnightExpected[0].sourceMeaning],
      expectedCards: cupsKnightExpected,
    })).toThrow();
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
});

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readingPlanSchema, readingResultSchema, tarotApiRequestSchema } from "@/src/lib/schemas";
import {
  createSessionDeck,
  createAnswerContract,
  detectQuestionCategory,
  designReading,
  extractBinaryChoices,
  extractChoiceCandidates,
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
  it("recognizes a repeated Korean food choice and assigns one card to each menu", () => {
    const question = "김치찌개를 먹을지 애호박찌개를 먹을지 정확하게 알려줘";
    const choices = extractBinaryChoices(question);
    const plan = designReading(question);

    expect(choices).toEqual(["김치찌개", "애호박찌개"]);
    expect(detectQuestionCategory(question)).toBe("decision");
    expect(plan.cardCount).toBe(2);
    expect(plan.positions.map((position) => position.title)).toEqual([
      "김치찌개 선택",
      "애호박찌개 선택",
    ]);
    expect(plan.answerContract).toEqual({
      kind: "choose_one",
      subject: "제시된 선택지 중 최종 선택",
      candidates: ["김치찌개", "애호박찌개"],
      decisive: true,
    });
    expect(plan.positions.every((position) => !/맛|영양|포만감|소화|재료|조리/.test(position.focus))).toBe(true);
  });

  it("gives one deterministic verdict for an explicit two-menu question", () => {
    const question = "김치찌개를 먹을지 애호박찌개를 먹을지 정확하게 알려줘";
    const plan = designReading(question);
    const selected: SelectedCard[] = [
      {
        cardId: "major-07",
        reversed: false,
        positionId: plan.positions[0].id,
        positionTitle: plan.positions[0].title,
        positionFocus: plan.positions[0].focus,
        round: 0,
      },
      {
        cardId: "cups-knight",
        reversed: true,
        positionId: plan.positions[1].id,
        positionTitle: plan.positions[1].title,
        positionFocus: plan.positions[1].focus,
        round: 0,
      },
    ];

    const first = generateReadingResult(question, selected);
    const second = generateReadingResult(question, selected);
    const selectedMenus = ["김치찌개", "애호박찌개"].filter((menu) => first.verdict?.value === menu);

    expect(readingResultSchema.parse(first)).toEqual(first);
    expect(first).toEqual(second);
    expect(selectedMenus).toHaveLength(1);
    expect(first.summary).not.toMatch(/상황에 따라|조건 확인이 우선|판단하기 어렵/);
    expect(first.axes.map((axis) => axis.label)).toEqual([
      "김치찌개 신호",
      "애호박찌개 신호",
      "결론 선명도",
    ]);
    expect(first.cardInterpretations.every((item) => item.text.endsWith("요."))).toBe(true);
  });

  it("preserves three explicit choices instead of replacing them with AI candidates", () => {
    const question = "김치찌개, 애호박찌개, 된장찌개 중 하나 골라줘";
    const plan = designReading(question);

    expect(extractChoiceCandidates(question)).toEqual(["김치찌개", "애호박찌개", "된장찌개"]);
    expect(plan.answerContract).toMatchObject({
      kind: "choose_one",
      candidates: ["김치찌개", "애호박찌개", "된장찌개"],
      decisive: true,
    });
    expect(plan.cardCount).toBe(3);
    expect(plan.positions.map((position) => position.title)).toEqual([
      "김치찌개 선택",
      "애호박찌개 선택",
      "된장찌개 선택",
    ]);
  });

  it.each([
    ["오늘 점심은 김치찌개, 애호박찌개, 된장찌개 중 하나 골라줘", ["김치찌개", "애호박찌개", "된장찌개"]],
    ["저녁 메뉴: 김치찌개, 애호박찌개, 된장찌개 중 하나 골라줘", ["김치찌개", "애호박찌개", "된장찌개"]],
    ["휴가지는 제주도, 부산, 경주 중 어디가 좋을까?", ["제주도", "부산", "경주"]],
    ["Should I call or text?", ["call", "text"]],
    ["Tea or coffee — which one should I choose?", ["Tea", "coffee"]],
    ["A, B, or C: which should I pick?", ["A", "B", "C"]],
  ])("extracts only the supplied candidates from %s", (question, candidates) => {
    expect(extractChoiceCandidates(question)).toEqual(candidates);
  });

  it("compares candidates without forcing a winner when only a comparison was requested", () => {
    const question = "김치찌개와 애호박찌개 중 차이만 비교해줘";
    const plan = designReading(question);
    const selected: SelectedCard[] = [
      {
        cardId: "major-07",
        reversed: false,
        positionId: plan.positions[0].id,
        positionTitle: plan.positions[0].title,
        positionFocus: plan.positions[0].focus,
        round: 0,
      },
      {
        cardId: "cups-knight",
        reversed: true,
        positionId: plan.positions[1].id,
        positionTitle: plan.positions[1].title,
        positionFocus: plan.positions[1].focus,
        round: 0,
      },
    ];
    const result = generateReadingResult(question, selected, undefined, "ko", plan.answerContract);

    expect(plan.answerContract.kind).toBe("compare");
    expect(result.verdict?.kind).toBe("compare");
    expect(result.summary).toContain("김치찌개");
    expect(result.summary).toContain("애호박찌개");
    expect(result.summary).not.toContain("골라요");
    expect(readingResultSchema.parse(result)).toEqual(result);
  });

  it("keeps a five-candidate local comparison inside the response schema", () => {
    const question = "첫 번째로 아주 긴 후보명, 두 번째로 아주 긴 후보명, 세 번째로 아주 긴 후보명, 네 번째로 아주 긴 후보명, 다섯 번째로 아주 긴 후보명 중 차이를 비교해줘";
    const plan = designReading(question);
    const deck = createSessionDeck();
    const selected: SelectedCard[] = deck.slice(0, plan.cardCount).map((card, index) => ({
      cardId: card.cardId,
      reversed: card.reversed,
      positionId: plan.positions[index].id,
      positionTitle: plan.positions[index].title,
      positionFocus: plan.positions[index].focus,
      round: 0,
    }));
    const result = generateReadingResult(question, selected, undefined, "ko", plan.answerContract);

    expect(plan.answerContract).toMatchObject({ kind: "compare" });
    expect(plan.answerContract.candidates).toHaveLength(5);
    expect(result.verdict?.value.length).toBeLessThanOrEqual(160);
    expect(readingResultSchema.parse(result)).toEqual(result);
  });

  it.each([
    ["오늘 한 가지 핵심만 확인하고 싶다", 1],
    ["이 관계에서 반복되는 문제와 조정할 부분은?", 2],
    ["A안과 B안 중 무엇을 기준으로 비교해야 하나?", 2],
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

  it.each([
    ["아침 뭐 먹을까?", "recommend_one"],
    ["오늘 뭐 입는 게 좋을까?", "recommend_one"],
    ["점심 메뉴 추천해줘", "recommend_one"],
    ["무슨 책을 읽을까?", "recommend_one"],
    ["연락할까 말까?", "yes_no"],
    ["지금 연락할까?", "yes_no"],
    ["이직하는 게 좋을까?", "yes_no"],
    ["A안과 B안 중 차이만 비교해줘", "compare"],
    ["A안이랑 B안의 차이를 비교해줘", "compare"],
    ["김치찌개랑 애호박찌개 중 뭐 먹을까?", "choose_one"],
    ["김치찌개 아니면 애호박찌개 뭐 먹어?", "choose_one"],
    ["김치찌개 먹을까 애호박찌개 먹을까?", "choose_one"],
    ["이 문제가 반복되는 이유가 뭘까?", "explain"],
    ["왜 자꾸 이렇게 될까?", "explain"],
    ["왜 나는 매번 뭐 먹을까 고민할까?", "explain"],
    ["왜 어떤 옷을 입을까 고민하게 될까?", "explain"],
    ["왜 연락할까 말까 계속 고민될까?", "explain"],
    ["이 문제를 어떻게 풀어야 해?", "advice"],
    ["이직 시기는 언제쯤일까?", "forecast"],
    ["현재 관계의 핵심 흐름을 봐줘", "analysis"],
    ["Should I call or text?", "choose_one"],
    ["Tea or coffee — which one should I choose?", "choose_one"],
    ["Which book should I read?", "recommend_one"],
    ["What should I read next?", "recommend_one"],
    ["어디 갈까?", "recommend_one"],
    ["어디로 갈까?", "recommend_one"],
    ["주말에 뭐 하지?", "recommend_one"],
    ["무슨 노래 들을까?", "recommend_one"],
    ["그래서 정확히 무슨 메뉴를 먹으라는 건데", "recommend_one"],
    ["Compare A and B", "compare"],
    ["A, B, or C: which should I pick?", "choose_one"],
  ])("classifies the requested answer shape for %s", (question, kind) => {
    expect(createAnswerContract(question).kind).toBe(kind);
  });

  it("keeps an open recommendation unbounded until the cards are revealed", () => {
    const plan = designReading("아침 뭐 먹을까?");

    expect(plan.answerContract).toMatchObject({
      kind: "recommend_one",
      candidates: [],
      decisive: true,
    });
    expect(plan.cardCount).toBeGreaterThanOrEqual(1);
    expect(plan.cardCount).toBeLessThanOrEqual(3);
    expect(plan.positions).toHaveLength(plan.cardCount);
    expect(plan.positions.every((position) => !position.title.endsWith(" 선택"))).toBe(true);
    expect(plan.positions.every((position) => /아침|식사|메뉴|먹/.test(`${position.title} ${position.focus}`))).toBe(true);
    expect(readingPlanSchema.parse(plan)).toEqual(plan);

    const invalidLegacyPlan = {
      ...plan,
      answerContract: {
        ...plan.answerContract,
        candidates: ["샌드위치", "요거트", "계란 요리"],
      },
    };
    expect(readingPlanSchema.safeParse(invalidLegacyPlan).success).toBe(false);
  });

  it("uses role positions for an English open recommendation", () => {
    const plan = designReading("Which book should I read?", false, "en");

    expect(plan.answerContract).toMatchObject({ kind: "recommend_one", candidates: [] });
    expect(plan.positions.every((position) => !/\boption$/i.test(position.title))).toBe(true);
    expect(plan.positions.every((position) => /title|work|book/i.test(`${position.title} ${position.focus}`))).toBe(true);
    expect(plan.selectionGuide).not.toMatch(/menu/i);
  });

  it("inherits prior candidates only for a referential follow-up", () => {
    const previousContract = createAnswerContract("김치찌개를 먹을지 애호박찌개를 먹을지 골라줘");
    const context = {
      initialQuestion: "김치찌개를 먹을지 애호박찌개를 먹을지 골라줘",
      previousQuestions: [],
      previousAnswer: "김치찌개를 골라요.",
      previousContract,
    };

    for (const followup of [
      "그래서 정확히 어느 쪽이야?",
      "그래서 뭐 먹어?",
      "그래서 뭐가 답이야?",
      "그럼 뭘 골라?",
      "결론은 뭐야?",
      "정확히 하나만 말해줘",
      "어느 걸 먹으라는 거야?",
    ]) {
      expect(createAnswerContract(followup, context)).toMatchObject({
        kind: "choose_one",
        candidates: ["김치찌개", "애호박찌개"],
      });
    }
    expect(createAnswerContract("그럼 내일은 뭐 입는 게 좋을까?", context)).toMatchObject({
      kind: "recommend_one",
      candidates: [],
    });
    for (const newRecommendation of [
      "그래서 다른 메뉴를 추천해줘",
      "그러면 새로운 식사 추천해줘",
      "그럼 이번엔 다른 책 추천해줘",
    ]) {
      expect(createAnswerContract(newRecommendation, context)).toMatchObject({
        kind: "recommend_one",
        candidates: [],
      });
    }
  });

  it("does not inherit candidates from a legacy open recommendation", () => {
    const context = {
      initialQuestion: "아침 뭐 먹을까?",
      previousQuestions: [],
      previousAnswer: "토스트를 먹어요.",
      previousContract: {
        kind: "recommend_one" as const,
        subject: "아침 메뉴",
        candidates: ["토스트", "죽", "샌드위치"],
        decisive: true,
      },
    };

    expect(createAnswerContract("그래서 뭐 먹어?", context)).toMatchObject({
      kind: "recommend_one",
      candidates: [],
    });
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

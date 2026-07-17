import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAiInterpretation,
  createAiPlan,
} from "@/app/api/tarot/route";
import type { AnswerContract } from "@/src/lib/tarot";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it.each([
    ["아침 머먹을까.. 죽은 안먹고싶어..", "죽을 제외한 아침 메뉴 하나"],
    ["주말에 어디 갈까? 실내는 피하고 싶어", "실내를 제외한 주말 장소 하나"],
    ["선물 하나 추천해줘. 향수는 이미 줬어", "이미 준 향수를 제외한 선물 하나"],
    ["새 취미 뭐가 좋을까? 운동은 하고 싶지 않아", "운동이 아닌 새 취미 하나"],
  ])("keeps an open recommendation open when a mentioned item is a constraint: %s", async (question, subject) => {
    const payload = aiPlan(2);
    payload.answerContract = {
      kind: "recommend_one",
      subject,
      candidates: [],
    };
    const workersRun = vi.fn(async () => ({ response: JSON.stringify(payload) }));

    const plan = await createAiPlan(
      { run: workersRun },
      question,
      false,
      "ko",
    );

    expect(plan.answerContract).toEqual({ kind: "recommend_one", subject, candidates: [] });
  });

  it("gives the planner domain-neutral rules for candidates, constraints, and background", async () => {
    const workersRun = vi.fn(async () => ({ response: JSON.stringify(aiPlan(2)) }));
    await createAiPlan(
      { run: workersRun },
      "조건을 지키면서 새로운 활동 하나를 추천해줘",
      false,
      "ko",
    );

    const request = workersRun.mock.calls[0][1] as { messages: Array<{ content: string }> };
    expect(request.messages[0].content).toContain("리딩 계획 엔진");
    expect(request.messages[0].content).toContain("언급되었다는 이유만으로 선택 후보로 취급하지 않는다");
    expect(request.messages[0].content).not.toContain("카드 원뜻");
    expect(request.messages[1].content).toContain("닫힌 후보 집합");
    expect(request.messages[1].content).toContain("제외하거나 거절한 대상");
    expect(request.messages[1].content).toContain("과거 사건");
    expect(request.messages[1].content).toContain("X는 제외하고 하나를 추천해 달라");
  });

  it("returns a semantic validation failure to the same planner before using Groq", async () => {
    const invalid = aiPlan(2);
    invalid.answerContract = {
      kind: "choose_one",
      subject: "새 활동 하나",
      candidates: ["이미 제외한 활동"],
    };
    const corrected = aiPlan(2);
    corrected.answerContract = {
      kind: "recommend_one",
      subject: "제외 조건을 지킨 새 활동 하나",
      candidates: [],
    };
    const workersRun = vi.fn()
      .mockResolvedValueOnce({ response: JSON.stringify(invalid) })
      .mockResolvedValueOnce({ response: JSON.stringify(corrected) });
    const groqFetch = vi.fn(async () => {
      throw new Error("Groq should not be called when Workers corrects its own output");
    });
    vi.stubGlobal("fetch", groqFetch);

    const plan = await createAiPlan(
      { run: workersRun },
      "새 활동 하나를 추천해줘. 전에 하던 것은 제외하고 싶어.",
      false,
      "ko",
      undefined,
      "test-groq-key",
    );

    expect(plan.answerContract.kind).toBe("recommend_one");
    expect(workersRun).toHaveBeenCalledTimes(2);
    expect(groqFetch).not.toHaveBeenCalled();
    const retry = workersRun.mock.calls[1][1] as { messages: Array<{ content: string }> };
    expect(retry.messages[1].content).toContain("이전 출력은 다음 검증을 통과하지 못했다");
    expect(retry.messages[1].content).toContain("후보를 새로 만들지 말고");
    expect(retry.messages[1].content).toContain("질문의 의미를 다시 판단");
  });

  it("uses Groq only after the same planner rejects two corrected outputs", async () => {
    const invalid = aiPlan(2);
    invalid.answerContract = {
      kind: "choose_one",
      subject: "열린 추천",
      candidates: ["AI가 만든 후보"],
    };
    const corrected = aiPlan(2);
    corrected.answerContract = {
      kind: "recommend_one",
      subject: "조건을 지킨 추천 하나",
      candidates: [],
    };
    const workersRun = vi.fn(async () => ({ response: JSON.stringify(invalid) }));
    const groqFetch = vi.fn(async () => Response.json({
      choices: [{ message: { content: JSON.stringify(corrected) } }],
    }));
    vi.stubGlobal("fetch", groqFetch);

    const plan = await createAiPlan(
      { run: workersRun },
      "정해진 후보 없이 조건에 맞는 것 하나를 추천해줘",
      false,
      "ko",
      undefined,
      "test-groq-key",
    );

    expect(plan.answerContract.kind).toBe("recommend_one");
    expect(workersRun).toHaveBeenCalledTimes(2);
    expect(groqFetch).toHaveBeenCalledTimes(1);
  });

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

  it("records retry and success timing without logging the question or generated prompt", async () => {
    const privateQuestion = "로그에 남으면 안 되는 비공개 질문 7f4d";
    const workersRun = vi.fn()
      .mockResolvedValueOnce({ response: "not-json" })
      .mockResolvedValueOnce({ response: JSON.stringify(aiPlan(2)) });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(createAiPlan(
        { run: workersRun },
        privateQuestion,
        false,
        "ko",
      )).resolves.toMatchObject({ cardCount: 2 });

      const logCalls = [...warn.mock.calls, ...info.mock.calls, ...error.mock.calls];
      const serializedLogs = JSON.stringify(logCalls);
      expect(serializedLogs).not.toContain(privateQuestion);
      expect(serializedLogs).not.toContain("현재 질문:");
      expect(serializedLogs).not.toContain("systemPrompt");
      expect(serializedLogs).not.toContain("userPrompt");

      expect(warn).toHaveBeenCalledWith(
        "[tarot-ai] response rejected",
        expect.objectContaining({
          operation: "plan",
          attempt: 1,
          attemptElapsedMs: expect.any(Number),
          totalElapsedMs: expect.any(Number),
        }),
      );
      expect(info).toHaveBeenCalledWith(
        "[tarot-ai] response accepted",
        expect.objectContaining({
          operation: "plan",
          attempt: 2,
          attemptElapsedMs: expect.any(Number),
          totalElapsedMs: expect.any(Number),
        }),
      );
    } finally {
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
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

  it("keeps waiting past 60 seconds but ends at the reserved AI deadline before the client deadline", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const neverResponds = vi.fn(() => new Promise<unknown>(() => undefined));
      const result = createAiInterpretation(
        { run: neverResponds },
        "오래 걸리는 해석도 기다려 주세요",
        [{
          cardId: "major-17",
          reversed: false,
          positionId: "main-signal",
          positionTitle: "핵심 신호",
          positionFocus: "질문의 핵심 방향",
          round: 0,
        }],
        undefined,
        "ko",
        { kind: "analysis", subject: "질문의 핵심", candidates: [] },
      );
      let settled = false;
      void result.then(
        () => { settled = true; },
        () => { settled = true; },
      );
      const rejection = expect(result).rejects.toMatchObject({
        status: 504,
        code: "AI_RESPONSE_TIMEOUT",
      });

      await vi.advanceTimersByTimeAsync(60_001);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(104_998);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(settled).toBe(true);
      expect(neverResponds).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      error.mockRestore();
      vi.useRealTimers();
    }
  });
});

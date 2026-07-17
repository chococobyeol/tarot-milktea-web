import type { AiJsonSchema } from "@/src/server/ai-provider";

const answerKinds = [
  "choose_one",
  "recommend_one",
  "yes_no",
  "compare",
  "forecast",
  "advice",
  "explain",
  "analysis",
] as const;

const answerContractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "subject", "candidates", "decisive"],
  properties: {
    kind: { type: "string", enum: answerKinds },
    subject: { type: "string" },
    candidates: { type: "array", items: { type: "string" } },
    decisive: { type: "boolean" },
  },
};

export const READING_PLAN_JSON_SCHEMA: AiJsonSchema = {
  name: "tarot_reading_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cardCount", "interpretationFrame", "selectionGuide", "positions", "answerContract"],
    properties: {
      cardCount: { type: "integer" },
      interpretationFrame: { type: "string" },
      selectionGuide: { type: "string" },
      positions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "focus"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            focus: { type: "string" },
          },
        },
      },
      answerContract: answerContractSchema,
    },
  },
};

export const READING_RESULT_JSON_SCHEMA: AiJsonSchema = {
  name: "tarot_reading_result",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "verdict",
      "summary",
      "cardInterpretations",
      "synthesis",
      "guidance",
      "axes",
      "signals",
      "limitation",
    ],
    properties: {
      verdict: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "value", "statement"],
        properties: {
          kind: { type: "string", enum: answerKinds },
          value: { type: "string" },
          statement: { type: "string" },
        },
      },
      summary: { type: "string" },
      cardInterpretations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "cardId",
            "cardName",
            "positionTitle",
            "positionFocus",
            "orientation",
            "orientationLabel",
            "sourceMeaning",
            "sourceKeywords",
            "text",
            "reasoning",
            "evidence",
          ],
          properties: {
            cardId: { type: "string" },
            cardName: { type: "string" },
            positionTitle: { type: "string" },
            positionFocus: { type: "string" },
            orientation: { type: "string", enum: ["upright", "reversed"] },
            orientationLabel: { type: "string" },
            sourceMeaning: { type: "string" },
            sourceKeywords: { type: "array", items: { type: "string" } },
            text: { type: "string" },
            reasoning: {
              type: "object",
              additionalProperties: false,
              required: ["sourceMeaning", "questionConnection", "decisionImpact"],
              properties: {
                sourceMeaning: { type: "string" },
                questionConnection: { type: "string" },
                decisionImpact: { type: "string" },
              },
            },
            evidence: { type: "array", items: { type: "string" } },
          },
        },
      },
      synthesis: { type: "string" },
      guidance: { type: "array", items: { type: "string" } },
      axes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "score", "evidence", "evidenceCardIds"],
          properties: {
            label: { type: "string" },
            score: { type: "integer" },
            evidence: { type: "string" },
            evidenceCardIds: { type: "array", items: { type: "string" } },
          },
        },
      },
      signals: {
        type: "object",
        additionalProperties: false,
        required: ["support", "caution", "uncertainty"],
        properties: {
          support: { type: "integer" },
          caution: { type: "integer" },
          uncertainty: { type: "integer" },
        },
      },
      limitation: { type: "string" },
    },
  },
};

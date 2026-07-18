import type { AiJsonSchema } from "@/src/server/ai-provider";

const answerKinds = [
  "choose_one",
  "recommend_one",
  "yes_no",
  "outcome",
  "compare",
  "forecast",
  "advice",
  "explain",
  "analysis",
] as const;

const answerContractSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "subject", "candidates", "constraints", "answerInstruction"],
  properties: {
    kind: { type: "string", enum: answerKinds },
    subject: { type: "string", minLength: 1, maxLength: 160 },
    candidates: {
      type: "array",
      maxItems: 5,
      items: { type: "string", minLength: 1, maxLength: 80 },
    },
    constraints: {
      type: "array",
      maxItems: 8,
      items: { type: "string", minLength: 1, maxLength: 160 },
    },
    answerInstruction: { type: "string", minLength: 1, maxLength: 360 },
  },
};

export const READING_PLAN_JSON_SCHEMA: AiJsonSchema = {
  name: "tarot_reading_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["interpretationFrame", "selectionGuide", "positions", "answerContract"],
    properties: {
      interpretationFrame: { type: "string", minLength: 1, maxLength: 300 },
      selectionGuide: { type: "string", minLength: 1, maxLength: 180 },
      positions: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "focus"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 80 },
            title: { type: "string", minLength: 1, maxLength: 40 },
            focus: { type: "string", minLength: 1, maxLength: 160 },
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
    ],
    properties: {
      verdict: {
        type: "object",
        additionalProperties: false,
        required: ["value", "statement"],
        properties: {
          value: { type: "string", minLength: 1, maxLength: 160 },
          statement: { type: "string", minLength: 1, maxLength: 360 },
        },
      },
      summary: { type: "string", minLength: 1, maxLength: 1200 },
      cardInterpretations: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "cardId",
            "positionTitle",
            "orientation",
            "text",
            "reasoning",
          ],
          properties: {
            cardId: { type: "string", minLength: 1, maxLength: 60 },
            positionTitle: { type: "string", minLength: 1, maxLength: 40 },
            orientation: { type: "string", enum: ["upright", "reversed"] },
            text: { type: "string", minLength: 1, maxLength: 900 },
            reasoning: {
              type: "object",
              additionalProperties: false,
              required: ["sourceMeaning", "questionConnection", "decisionImpact"],
              properties: {
                sourceMeaning: { type: "string", minLength: 1, maxLength: 900 },
                questionConnection: { type: "string", minLength: 1, maxLength: 1200 },
                decisionImpact: { type: "string", minLength: 1, maxLength: 900 },
              },
            },
          },
        },
      },
      synthesis: { type: "string", minLength: 1, maxLength: 1800 },
      guidance: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", minLength: 1, maxLength: 300 },
      },
      axes: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "score", "evidence", "evidenceCardIds"],
          properties: {
            label: { type: "string", minLength: 1, maxLength: 30 },
            score: { type: "integer", minimum: 0, maximum: 100 },
            evidence: { type: "string", minLength: 1, maxLength: 240 },
            evidenceCardIds: {
              type: "array",
              minItems: 1,
              maxItems: 5,
              items: { type: "string" },
            },
          },
        },
      },
      signals: {
        type: "object",
        additionalProperties: false,
        required: ["support", "caution", "uncertainty"],
        properties: {
          support: { type: "integer", minimum: 0, maximum: 100 },
          caution: { type: "integer", minimum: 0, maximum: 100 },
          uncertainty: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
};

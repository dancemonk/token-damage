import { describe, expect, it } from "vitest";
import { normalizeModel } from "../src/adapters/antigravity/models.js";
import { modelName } from "../src/adapters/names.js";

describe("modelName", () => {
  it("keeps model ids and refuses anything that reads like text", () => {
    for (const ok of [
      "grok-4.7",
      "claude-opus-4-6",
      "gemini-3.8-flash",
      "model_placeholder_m50",
      "openai/gpt-5.5",
    ])
      expect(modelName(` ${ok} `)).toBe(ok);
    for (const bad of [
      "fix the login bug",
      "[grok] grok-4.5",
      "",
      "x".repeat(81),
      "a\nb",
    ])
      expect(modelName(bad)).toBeUndefined();
  });
  it("keeps Antigravity's unknown model text out of events", () => {
    expect(normalizeModel("Some Prompt (x)")).toBeUndefined();
    expect(normalizeModel("model_placeholder_m50")).toBe(
      "model_placeholder_m50",
    );
  });
});

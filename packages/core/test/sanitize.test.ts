import { describe, expect, it } from "vitest";
import { sanitizeLine } from "../scripts/sanitize-fixture.js";

describe("sanitizeLine for Grok lines", () => {
  it("keeps the ids and model keys the Grok parser reads, and still renames other dotted keys", () => {
    const line = JSON.stringify({
      method: "_x.ai/session/update",
      params: {
        sessionId: "s-1",
        update: {
          sessionUpdate: "turn_completed",
          content: { type: "text", text: "a real prompt" },
          usage: { modelUsage: { "grok-4.7": { inputTokens: 5 } } },
        },
        _meta: { eventId: "e-1", agentTimestampMs: 1 },
      },
      other: { "app.ts": 1 },
      current_model_id: "grok-4.7",
    });
    const out = JSON.parse(sanitizeLine(line) ?? "{}");
    expect(out.params.update.sessionUpdate).toBe("turn_completed");
    expect(out.params._meta.eventId).toBe("e-1");
    expect(Object.keys(out.params.update.usage.modelUsage)).toEqual([
      "grok-4.7",
    ]);
    expect(out.params.update.content.text).toBe("x");
    expect(Object.keys(out.other)).toEqual(["k0"]);
    expect(out.current_model_id).toBe("grok-4.7");
  });
});

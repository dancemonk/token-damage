import { describe, expect, it } from "vitest";
import {
  countWords,
  dedupePrompts,
  parseLine,
  typedWords,
} from "../../src/index.js";
import { fixturePrompts } from "./support.js";

describe("words typed", () => {
  it("counts only what the user wrote, per prompt", async () => {
    const prompts = await fixturePrompts("2.1.281/words-typed.jsonl");
    // plain, image + text, pasted, /review args, /clear, !git, Cyrillic, Claude Desktop; then the resumed-session copy
    expect(prompts.map((p) => p.words)).toEqual([8, 6, 11, 3, 0, 3, 4, 4, 8]);
  });

  it("counts a prompt copied into a resumed session once", async () => {
    const prompts = dedupePrompts(
      await fixturePrompts("2.1.281/words-typed.jsonl"),
    );
    expect(prompts).toHaveLength(8);
    expect(prompts.reduce((sum, p) => sum + p.words, 0)).toBe(39);
    expect(prompts[0]?.sessionId).toBe("4aaff5d2-be7b-4975-9f06-ceeb9fcdd99a");
  });

  it("keeps no text: a prompt event holds only ids, time and a count", async () => {
    const [prompt] = await fixturePrompts("2.1.281/words-typed.jsonl");
    expect(Object.keys(prompt ?? {}).sort()).toEqual([
      "dedupeKey",
      "kind",
      "sessionId",
      "source",
      "ts",
      "words",
    ]);
  });
});

describe("countWords", () => {
  it("counts tokens with a letter or digit, in any script", () => {
    expect(countWords("  fix  the\tbug\n")).toBe(3);
    expect(countWords("-- ... 🙂 → 42")).toBe(1);
    expect(countWords("привет мир, 你好")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("typedWords", () => {
  it("returns undefined for text Claude Code wrote", () => {
    for (const block of [
      "[Request interrupted by user]",
      "<task-notification><summary>done</summary></task-notification>",
      "<local-command-stdout>ok</local-command-stdout>",
      "<bash-stdout>ok</bash-stdout><bash-stderr></bash-stderr>",
      "<system-reminder>context</system-reminder>",
    ]) {
      expect(typedWords(block)).toBeUndefined();
    }
  });

  it("counts slash-command arguments only, 0 without arguments", () => {
    expect(
      typedWords(
        "<command-name>/review</command-name><command-args>check this</command-args>",
      ),
    ).toBe(2);
    expect(
      typedWords(
        "<command-message>clear</command-message><command-name>/clear</command-name>",
      ),
    ).toBe(0);
  });

  it("drops hook context appended to a prompt", () => {
    expect(
      typedWords(
        "add tests <system-reminder>hook said many words here</system-reminder>",
      ),
    ).toBe(2);
  });
});

describe("parseLine on user lines", () => {
  const user = (content: unknown, extra: object = {}) =>
    JSON.stringify({
      type: "user",
      sessionId: "s",
      uuid: "u",
      timestamp: "2026-09-01T00:00:00.000Z",
      message: { role: "user", content },
      ...extra,
    });

  it("skips lines in subagent files", () => {
    expect(
      parseLine(user("do the task"), { parentSessionId: "p", agentId: "a" }),
    ).toEqual({ kind: "skipped" });
  });

  it("skips prompts a program or Claude Code wrote", () => {
    expect(
      parseLine(user("go", { origin: { kind: "auto-continuation" } })),
    ).toEqual({ kind: "skipped" });
    expect(
      parseLine(user("go", { origin: { kind: "task-notification" } })),
    ).toEqual({ kind: "skipped" });
    expect(
      parseLine(user("go", { promptSource: "sdk", entrypoint: "sdk-py" })),
    ).toEqual({ kind: "skipped" });
    const desktop = parseLine(
      user("go now", { origin: { kind: "human" }, promptSource: "sdk" }),
    );
    expect(desktop.kind === "prompt" && desktop.prompt.words).toBe(2);
  });

  it("counts text blocks next to an image", () => {
    const result = parseLine(
      user([{ type: "image" }, { type: "text", text: "what is this" }]),
    );
    expect(result.kind === "prompt" && result.prompt.words).toBe(3);
  });
});

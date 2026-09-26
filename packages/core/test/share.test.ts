import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  aggregate,
  buildFacts,
  buildReceipt,
  createDeduper,
  decodeShare,
  dispute,
  emptyStats,
  observe,
  receiptSvg,
  scanClaude,
  SHARE_BASE,
  SHARE_WHITELIST,
  sharePayload,
  sharePreview,
  shareUrl,
  type Receipt,
} from "../src/index.js";
import { writeSampleMonth } from "../scripts/sample-month.js";

let dir = "";
let receipt: Receipt;
let noPlan: Receipt;
/** Everything in the corpus that must never reach a shared artifact. */
const secrets = new Set<string>([
  "/p/a",
  "-p-a",
  "-p-b",
  "msg_sample",
  "req_sample",
  "sample-month",
]);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "td-share-"));
  await writeSampleMonth(dir);
  for (const file of readdirSync(join(dir, "projects"), {
    recursive: true,
    encoding: "utf8",
  })) {
    if (!file.endsWith(".jsonl")) continue;
    for (const line of readFileSync(join(dir, "projects", file), "utf8").split(
      "\n",
    )) {
      if (!line) continue;
      const row = JSON.parse(line);
      for (const id of [
        row.sessionId,
        row.uuid,
        row.agentId,
        row.message?.id,
        row.requestId,
      ])
        if (id) secrets.add(id);
      if (row.type === "user") secrets.add(row.message.content);
    }
  }
  const stats = { ...emptyStats(), files: 0, subagentFiles: 0 };
  const deduper = createDeduper();
  for await (const record of scanClaude([dir], stats)) deduper.add(record);
  const usage = deduper.result();
  const agg = aggregate(
    { usage, prompts: deduper.prompts() },
    { timeZone: "UTC" },
  );
  const build = (planUsd?: number) => {
    const facts = buildFacts({
      aggregate: agg,
      usage,
      timeZone: "UTC",
      planUsd,
    });
    const period = {
      start: "2026-08-25",
      end: "2026-09-23",
      days: 30,
      retentionDays: 30,
      retentionIsDefault: true,
    };
    return buildReceipt({
      trans: "0041",
      period,
      aggregate: agg,
      facts,
      observations: observe(facts),
      planUsd,
    });
  };
  receipt = build(200);
  noPlan = build();
}, 60_000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const leaks = (artifact: string) =>
  [...secrets].filter((s) => artifact.includes(s));

describe("share link", () => {
  it("carries only whitelisted keys, with or without plan and dispute", () => {
    const facts = { ...buildFactsStub(), sessionsAfterMidnight: 11 };
    const verdict = dispute("It was one last fix", facts);
    for (const p of [
      sharePayload(receipt),
      sharePayload(noPlan),
      sharePayload(receipt, { excuse: "It was one last fix", verdict }),
    ]) {
      expect(
        Object.keys(p).filter(
          (k) => !(SHARE_WHITELIST as readonly string[]).includes(k),
        ),
      ).toEqual([]);
    }
    expect(sharePayload(noPlan)).not.toHaveProperty("plan");
  });

  it("holds numbers, dates, enums and ids only", () => {
    const p = sharePayload(receipt, {
      excuse: "It was research",
      verdict: { status: "DENIED", text: "DENIED. anything" },
    });
    const strings: string[] = [];
    (function walk(v: unknown) {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    })(p);
    for (const s of strings)
      expect(s).toMatch(
        /^(\d{4}-\d{2}-\d{2}|\d{2}:\d{2}|[A-Z ]+|[a-z0-9-]+(\.\d+)?)$/,
      );
    expect(p).toMatchObject({
      last: "03:45",
      note: "iceberg.0",
      class: "ACT OF GOD",
      dispute: ["research", "DENIED"],
      plan: 4,
    });
  });

  it("puts the data in the fragment and round-trips", () => {
    const p = sharePayload(receipt);
    const url = shareUrl(p);
    expect(url.startsWith(SHARE_BASE)).toBe(true);
    expect(new URL(url).pathname).toBe("/r");
    expect(decodeShare(url)).toEqual(p);
  });

  it("rejects payloads with any key outside the whitelist, and garbage", () => {
    const smuggled =
      SHARE_BASE +
      btoa(JSON.stringify({ ...sharePayload(receipt), cwd: "/p/a" })).replace(
        /=+$/,
        "",
      );
    expect(decodeShare(smuggled)).toBeNull();
    expect(decodeShare(`${SHARE_BASE}not-json`)).toBeNull();
    expect(decodeShare("https://example.com/r#v1.e30")).toBeNull();
  });

  it("previews every field it will send", () => {
    const p = sharePayload(receipt);
    const preview = sharePreview(p).join("\n");
    for (const value of [p.start, p.end, p.class, p.last ?? "", p.note ?? ""])
      expect(preview).toContain(value);
  });

  it("names the agents, most tokens first, and marks a partly priced total", () => {
    expect(sharePayload(receipt).agents).toEqual(["claude-code"]);
    expect(sharePayload(receipt)).not.toHaveProperty("partly");
    const mixed: Receipt = {
      ...receipt,
      byAgent: [
        { ...receipt.byAgent[0]!, agent: "codex" },
        receipt.byAgent[0]!,
      ],
      priced: { ...receipt.priced, partlyPriced: true },
    };
    const p = sharePayload(mixed);
    expect(p.agents).toEqual(["codex", "claude-code"]);
    expect(p.partly).toBe(true);
    expect(decodeShare(shareUrl(p))).toEqual(p);
    const preview = sharePreview(p).join("\n");
    expect(preview).toContain("agents: codex, claude-code");
    expect(preview).toContain(
      "prices: partly (some models have no list price)",
    );
  });
});

describe("privacy", () => {
  it("no session, agent, message or request id, path, project or prompt text in the link or the card", () => {
    expect(secrets.size).toBeGreaterThan(8000);
    expect(leaks(shareUrl(sharePayload(receipt)))).toEqual([]);
    expect(leaks(JSON.stringify(sharePayload(receipt)))).toEqual([]);
    expect(leaks(receiptSvg(receipt))).toEqual([]);
  });
});

describe("share card SVG", () => {
  it("is 1080×1920 and prints the receipt's numbers", () => {
    const svg = receiptSvg(receipt);
    expect(svg).toMatch(/^<svg [^>]*width="1080" height="1920"/);
    for (const s of [
      "1,183,400,000",
      "$809.65",
      "$4,383.85",
      "26–120 kWh",
      "3:47 AM",
      "ACT OF GOD",
      "Great Gatsby",
    ]) {
      expect(svg).toContain(s);
    }
  });

  it("has room for the achievements the sample earned", () => {
    expect(receipt.achievements.length).toBeGreaterThan(0);
    const svg = receiptSvg(receipt);
    expect(svg).toContain(">ACHIEVEMENTS<");
    for (const a of receipt.achievements) expect(svg).toContain(a.name);
  });

  it("layout is frozen", () => {
    expect(receiptSvg(receipt)).toMatchSnapshot();
  });
});

function buildFactsStub() {
  return JSON.parse(
    readFileSync(new URL("../fixtures/samples.json", import.meta.url), "utf8"),
  ).customers[0].facts;
}

// Builds fixtures/antigravity/antigravity/: real Antigravity conversations with every blob re-encoded from its
// whitelisted fields only (scripts/antigravity-proto.ts), the first rows of each, plus the traps listed in
// fixtures/antigravity/README.md. History lines keep ids and times; `display` becomes filler of the same word
// count, `workspace` becomes /p/a. Prints row counts only, never text.
// Usage: node --experimental-strip-types scripts/antigravity-fixture.ts <conversations dir> <history.jsonl> <id>...
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

// Typed by hand: scripts load each other by URL (strip-types needs `.ts`, tsc needs `.js`), as opencode-fixture.ts.
type Message = [number, number | string | Uint8Array | Message][];
type Shape = { [num: number]: "varint" | "text" | Shape };
const P = (await import(
  new URL("./antigravity-proto.ts", import.meta.url).href
)) as {
  encode: (message: Message) => Uint8Array;
  project: (blob: Uint8Array, shape: Shape) => Message;
  GENERATION: Shape;
  STEP: Shape;
  TRAJECTORY: Shape;
};
const OUT = fileURLToPath(
  new URL("../fixtures/antigravity/antigravity/", import.meta.url),
);
const ROWS = 60; // per table per conversation: enough for two days, small enough to review
const words = (text: string) =>
  text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

const [conversations, history, ...ids] = process.argv.slice(2);
if (!conversations || !history || ids.length < 2)
  throw new Error("usage: <conversations dir> <history.jsonl> <id> <id>...");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "conversations"), { recursive: true });

function create(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);
           CREATE TABLE steps (idx INTEGER PRIMARY KEY, metadata BLOB);
           CREATE TABLE trajectory_metadata_blob (data BLOB);`);
  return db;
}

for (const id of ids) {
  const real = new DatabaseSync(join(conversations, `${id}.db`), {
    readOnly: true,
  });
  const out = create(join(OUT, "conversations", `${id}.db`));
  const copy = (select: string, insert: string, shape: Shape) => {
    let n = 0;
    for (const r of real.prepare(select).all()) {
      const blob = r.b;
      if (!(blob instanceof Uint8Array)) continue;
      const clean = P.encode(P.project(blob, shape));
      if (r.idx === undefined) out.prepare(insert).run(clean);
      else out.prepare(insert).run(Number(r.idx), clean);
      n++;
    }
    return n;
  };
  const g = copy(
    `SELECT idx, data AS b FROM gen_metadata ORDER BY idx LIMIT ${ROWS}`,
    "INSERT INTO gen_metadata VALUES (?, ?)",
    P.GENERATION,
  );
  const s = copy(
    `SELECT idx, metadata AS b FROM steps WHERE metadata IS NOT NULL ORDER BY idx LIMIT ${ROWS}`,
    "INSERT INTO steps VALUES (?, ?)",
    P.STEP,
  );
  const t = copy(
    `SELECT data AS b FROM trajectory_metadata_blob ORDER BY rowid LIMIT 1`,
    "INSERT INTO trajectory_metadata_blob (data) VALUES (?)",
    P.TRAJECTORY,
  );
  real.close();
  out.close();
  console.log(`${id}: ${g} generations, ${s} steps, ${t} trajectory`);
}

// Traps (fixtures/antigravity/README.md). Two databases share response id "trap-shared" with different numbers.
const T = Date.UTC(2026, 6, 4, 10) / 1000;
const stamp: Message = [
  [1, T],
  [2, 0],
];
const gen = (chat: Message) => P.encode([[1, chat]]);
const trapA = create(join(OUT, "conversations", "trap-a.db"));
trapA
  .prepare("INSERT INTO trajectory_metadata_blob (data) VALUES (?)")
  .run(P.encode([[2, [[1, T - 3600]]]]));
trapA.prepare("INSERT INTO gen_metadata VALUES (?, ?)").run(
  0,
  gen([
    [19, "Gemini 3.8 Flash (High)"],
    [9, [[4, stamp]]],
    // trap 1: visible + reasoning, no total
    [
      4,
      [
        [2, 1000],
        [3, 0],
        [5, 9000],
        [9, 40],
        [10, 60],
        [11, "trap-shared"],
      ],
    ],
    // trap 2: a retry
    [
      17,
      [
        [
          2,
          [
            [2, 200],
            [3, 30],
            [11, "trap-retry"],
          ],
        ],
      ],
    ],
  ]),
);
// trap 3: a placeholder model, no id, no time of its own
trapA.prepare("INSERT INTO gen_metadata VALUES (?, ?)").run(
  1,
  gen([
    [
      4,
      [
        [1, 1050],
        [2, 300],
        [3, 10],
      ],
    ],
  ]),
);
// trap 4: no tokens
trapA.prepare("INSERT INTO gen_metadata VALUES (?, ?)").run(
  2,
  gen([
    [
      4,
      [
        [2, 0],
        [3, 0],
      ],
    ],
  ]),
);
trapA.close();
// trap 5: the same response id as trap 1, larger input, smaller output
const trapB = create(join(OUT, "conversations", "trap-b.db"));
trapB.prepare("INSERT INTO steps VALUES (?, ?)").run(
  0,
  P.encode([
    [8, stamp],
    [
      9,
      [
        [2, 1200],
        [3, 50],
        [5, 8000],
        [11, "trap-shared"],
      ],
    ],
    [24, [[12, "Gemini 3.7 Flash"]]],
  ]),
);
trapB.close();
// trap 6: an empty database
writeFileSync(join(OUT, "conversations", "trap-empty.db"), "");

const kept: string[] = [];
for (const line of readFileSync(history, "utf8").split("\n")) {
  if (line === "") continue;
  const row = JSON.parse(line) as Record<string, unknown>;
  if (!ids.includes(String(row.conversationId))) continue;
  const display = String(row.display ?? "");
  const filler =
    row.type === "slash_command"
      ? [
          "/x",
          ...Array<string>(
            words(display.trim().split(/\s+/).slice(1).join(" ")),
          ).fill("x"),
        ].join(" ")
      : Array<string>(words(display)).fill("x").join(" ");
  kept.push(JSON.stringify({ ...row, display: filler, workspace: "/p/a" }));
}
const at = Date.UTC(2026, 6, 4, 9);
const line = (o: object) => JSON.stringify({ ...o, workspace: "/p/a" });
kept.push(
  line({ conversationId: "trap-a", display: "x x x", timestamp: at }), // 3 words
  line({
    conversationId: "trap-a",
    display: "/x x x",
    timestamp: at + 1,
    type: "slash_command",
  }), // 2 words
  line({
    conversationId: "trap-a",
    display: "/x",
    timestamp: at + 2,
    type: "slash_command",
  }), // no prompt
  line({
    conversationId: "trap-a",
    display: "x x",
    timestamp: at + 3,
    type: "shell",
  }), // 2 words
  line({ display: "x x x x", timestamp: at + 4 }), // no conversation: skipped
  line({
    conversationId: "trap-a",
    display: "x",
    timestamp: at + 5,
    type: "other",
  }), // unknown type: skipped
);
writeFileSync(join(OUT, "history.jsonl"), kept.join("\n") + "\n");
console.log(`history: ${kept.length} lines`);

// Builds fixtures/opencode/opencode/: a sanitized copy of a real OpenCode database (every string in a payload
// except ids, roles and model names is "x"; only user messages' parts are copied) plus the constructed traps
// listed in fixtures/opencode/README.md.
// Usage: node --experimental-strip-types scripts/opencode-fixture.ts <path to a real opencode.db>
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

const { sanitizeLine } = (await import(
  new URL("./sanitize-fixture.ts", import.meta.url).href
)) as { sanitizeLine: (line: string) => string | undefined };

const OUT = fileURLToPath(
  new URL("../fixtures/opencode/opencode/", import.meta.url),
);
// The copy leaves out the tables sessions point at (project, workspace).
const NO_FK = { enableForeignKeyConstraints: false };
const TABLES = ["session", "message", "part", "session_message"];
// Session columns kept as they are; every other text column becomes "x".
const KEEP = new Set(["id", "parent_id", "version"]);
const day = (d: number, h: number, m = 0) => Date.UTC(2026, 6, d, h, m);

function sanitizeJson(data: string): string {
  const clean = sanitizeLine(data);
  if (clean === undefined) throw new Error("payload is not JSON");
  return clean;
}

function schema(real: DatabaseSync): string[] {
  const names = TABLES.map((t) => `'${t}'`).join(", ");
  return real
    .prepare(
      `SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND tbl_name IN (${names}) ORDER BY type DESC, name`,
    )
    .all()
    .map((r) => String(r.sql));
}

function insert(
  db: DatabaseSync,
  table: string,
  row: Record<string, SQLInputValue>,
) {
  const cols = Object.keys(row);
  db.prepare(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
  ).run(...cols.map((c) => row[c] as SQLInputValue));
}

function copyReal(real: DatabaseSync, db: DatabaseSync) {
  for (const r of real.prepare("SELECT * FROM session").all()) {
    const row: Record<string, SQLInputValue> = {};
    for (const [col, v] of Object.entries(r))
      row[col] =
        typeof v === "string" && !KEEP.has(col)
          ? col === "project_id"
            ? "p"
            : "x"
          : (v as SQLInputValue);
    insert(db, "session", row);
  }
  const users = new Set<string>();
  for (const r of real.prepare("SELECT * FROM message").all()) {
    const data = sanitizeJson(String(r.data));
    if (JSON.parse(data).role === "user") users.add(String(r.id));
    insert(db, "message", { ...(r as Record<string, SQLInputValue>), data });
  }
  for (const r of real.prepare("SELECT * FROM part").all()) {
    if (!users.has(String(r.message_id))) continue;
    const data = sanitizeJson(String(r.data));
    insert(db, "part", { ...(r as Record<string, SQLInputValue>), data });
  }
}

const session = (id: string, parent: string | null, t: number) => ({
  id,
  project_id: "p",
  parent_id: parent,
  slug: "x",
  directory: "x",
  title: "x",
  version: "1.17.18",
  time_created: t,
  time_updated: t,
});

function message(
  db: DatabaseSync,
  id: string,
  sessionId: string,
  t: number,
  data: string | Record<string, unknown>,
) {
  insert(db, "message", {
    id,
    session_id: sessionId,
    time_created: t,
    time_updated: t,
    data: typeof data === "string" ? data : JSON.stringify(data),
  });
}

const assistant = (
  model: Record<string, string>,
  t: number,
  tokens: unknown,
) => ({ role: "assistant", ...model, time: { created: t }, tokens, cost: 0 });
const openai = { modelID: "gpt-5.5", providerID: "openai" };

function addTraps(db: DatabaseSync) {
  const T = day(10, 9);
  insert(db, "session", session("ses_trap_root", null, T));
  insert(db, "session", session("ses_trap_child", "ses_trap_root", T));
  insert(db, "session", session("ses_trap_grandchild", "ses_trap_child", T));
  const root = "ses_trap_root";

  // Words: the typed part counts; synthetic and file parts do not. Invented text.
  message(db, "msg_trap_user", root, T, {
    role: "user",
    time: { created: T },
    agent: "x",
    model: openai,
  });
  const parts: Record<string, unknown>[] = [
    { type: "text", text: "Please make the failing tests pass again" },
    {
      type: "text",
      text: "Called the Read tool with the following input",
      synthetic: true,
    },
    { type: "file", mime: "text/plain", filename: "x", url: "x" },
  ];
  parts.forEach((data, i) =>
    insert(db, "part", {
      id: `prt_trap_user_${i}`,
      message_id: "msg_trap_user",
      session_id: root,
      time_created: T,
      time_updated: T,
      data: JSON.stringify(data),
    }),
  );
  // A subagent's prompt was written by the agent that started it.
  message(db, "msg_trap_child_user", "ses_trap_child", T + 1, {
    role: "user",
    time: { created: T + 1 },
  });
  insert(db, "part", {
    id: "prt_trap_child_user",
    message_id: "msg_trap_child_user",
    session_id: "ses_trap_child",
    time_created: T + 1,
    time_updated: T + 1,
    data: JSON.stringify({ type: "text", text: "Review the change" }),
  });

  const t = (m: number) => day(10, 10, m);
  message(
    db,
    "msg_trap_total_only",
    root,
    t(1),
    assistant(openai, t(1), { total: 1000 }),
  );
  message(
    db,
    "msg_trap_total_extra",
    root,
    t(2),
    assistant(openai, t(2), {
      input: 100,
      output: 50,
      reasoning: 25,
      cache: { read: 200, write: 0 },
      total: 400,
    }),
  );
  message(db, "msg_trap_no_provider", root, t(3), {
    role: "assistant",
    modelID: "gpt-5.5",
    time: { created: t(3) },
    tokens: { input: 999, output: 999 },
  });
  message(
    db,
    "msg_trap_zero",
    root,
    t(4),
    assistant(openai, t(4), {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    }),
  );
  message(
    db,
    "msg_trap_cache_not_object",
    root,
    t(5),
    assistant(openai, t(5), { input: 10, output: 5, cache: 7 }),
  );
  message(
    db,
    "msg_trap_string_tokens",
    root,
    t(6),
    assistant(openai, t(6), { input: "100", output: 20, total: "500" }),
  );
  message(
    db,
    "msg_trap_claude_dotted",
    "ses_trap_grandchild",
    t(7),
    assistant(
      { modelID: "claude-sonnet-4.5", providerID: "github-copilot" },
      t(7),
      {
        input: 2000,
        output: 300,
        reasoning: 0,
        cache: { read: 10000, write: 1500 },
        total: 13800,
      },
    ),
  );
  message(
    db,
    "msg_trap_vendor_prefix",
    "ses_trap_child",
    t(8),
    assistant(
      { modelID: "anthropic/claude-opus-4.1", providerID: "openrouter" },
      t(8),
      {
        input: 500,
        output: 120,
        cache: { read: 0, write: 4000 },
      },
    ),
  );
  message(
    db,
    "msg_trap_gemini_long",
    root,
    t(9),
    assistant({ modelID: "gemini-2.5-pro", providerID: "google" }, t(9), {
      input: 150000,
      output: 1000,
      cache: { read: 60000, write: 0 },
    }),
  );
  message(
    db,
    "msg_trap_alias",
    root,
    t(10),
    assistant({ modelID: "gemini-3-pro-high", providerID: "google" }, t(10), {
      input: 700,
      output: 80,
      cache: { read: 0, write: 0 },
    }),
  );
  message(db, "msg_trap_not_json", root, t(11), "not json");
  message(db, "msg_trap_array", root, t(12), "[1,2,3]");

  // OpenCode v2 rows: the model in `model: {id, providerID}`; only type "assistant" has usage.
  const v2 = (
    id: string,
    type: string,
    seq: number,
    created: number,
    data: unknown,
  ) =>
    insert(db, "session_message", {
      id,
      session_id: root,
      type,
      seq,
      time_created: created,
      time_updated: created,
      data: JSON.stringify(data),
    });
  const u = (h: number) => day(11, h);
  v2("msg_v2_user", "user", 1, u(8), { text: "x", time: { created: u(8) } });
  v2("msg_v2_assistant", "assistant", 2, u(8) + 1, {
    model: { id: "gpt-5.4", providerID: "openai" },
    time: { created: u(8) },
    tokens: {
      input: 300,
      output: 40,
      reasoning: 10,
      cache: { read: 1000, write: 0 },
    },
  });
  v2("msg_v2_row_time", "assistant", 3, u(9), {
    modelID: "gpt-5.4",
    providerID: "openai",
    tokens: { input: 60, output: 6, cache: { read: 0, write: 0 } },
  });
  v2("msg_trap_total_extra", "assistant", 4, u(10), {
    model: { id: "gpt-5.4", providerID: "openai" },
    time: { created: u(10) },
    tokens: { input: 77777, output: 7777 },
  });
  v2("msg_v2_no_tokens", "assistant", 5, u(11), {
    model: { id: "gpt-5.4", providerID: "openai" },
    time: { created: u(11) },
  });
}

function legacyFiles() {
  const legacy = (path: string, data: unknown) => {
    const file = join(OUT, "storage", "message", path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    // Fixed mtime: nothing here is dated by it, but keep the corpus reproducible.
    utimesSync(file, day(10, 0) / 1000, day(10, 0) / 1000);
  };
  const t = day(10, 11);
  legacy("ses_legacy/msg_legacy_1.json", {
    id: "msg_legacy_1",
    sessionID: "ses_legacy",
    role: "assistant",
    ...openai,
    time: { created: t },
    tokens: {
      input: 400,
      output: 60,
      reasoning: 0,
      cache: { read: 3000, write: 0 },
    },
    cost: 0,
  });
  // Named after a database id: never read (its tokens would show).
  legacy("ses_trap_root/msg_trap_total_only.json", {
    id: "msg_trap_total_only",
    sessionID: "ses_trap_root",
    ...openai,
    time: { created: t },
    tokens: { input: 5000000, output: 5000000 },
  });
  // Another name, a database id inside: read, then dropped as a duplicate.
  legacy("ses_legacy/renamed.json", {
    id: "msg_trap_claude_dotted",
    sessionID: "ses_legacy",
    ...openai,
    time: { created: t },
    tokens: { input: 6000000, output: 6000000 },
  });
  legacy("ses_legacy/msg_legacy_user.json", {
    id: "msg_legacy_user",
    sessionID: "ses_legacy",
    role: "user",
    time: { created: t },
  });
}

function channelDatabase(real: DatabaseSync) {
  // Next to opencode.db, so never read.
  const db = new DatabaseSync(join(OUT, "opencode-beta.db"), NO_FK);
  db.exec("PRAGMA page_size = 1024");
  for (const sql of schema(real).filter((s) =>
    s.startsWith("CREATE TABLE `message`"),
  ))
    db.exec(sql);
  message(
    db,
    "msg_beta",
    "ses_beta",
    day(10, 12),
    assistant(openai, day(10, 12), { input: 8000000, output: 8000000 }),
  );
  db.exec("VACUUM");
  db.close();
}

function main(src: string) {
  const real = new DatabaseSync(src, { readOnly: true });
  for (const f of ["opencode.db", "opencode-beta.db", "storage"])
    rmSync(join(OUT, f), { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const db = new DatabaseSync(join(OUT, "opencode.db"), NO_FK);
  db.exec("PRAGMA page_size = 1024");
  db.exec("PRAGMA journal_mode = DELETE");
  for (const sql of schema(real)) db.exec(sql);
  db.exec("BEGIN");
  copyReal(real, db);
  addTraps(db);
  db.exec("COMMIT");
  db.exec("VACUUM");
  db.close();
  channelDatabase(real);
  legacyFiles();
  real.close();
}

const [src] = process.argv.slice(2);
if (!src) {
  process.stderr.write("usage: opencode-fixture.ts <opencode.db>\n");
  process.exit(2);
}
main(src);

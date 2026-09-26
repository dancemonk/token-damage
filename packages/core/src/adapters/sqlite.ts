// Read-only SQLite for the agents that keep their logs in a database (OpenCode, Antigravity), through the
// built-in `node:sqlite`: no dependency.

export type Sqlite = typeof import("node:sqlite");
export type Database = InstanceType<Sqlite["DatabaseSync"]>;
export type Row = Record<string, unknown>;

let sqlite: Promise<Sqlite | undefined> | undefined;

/**
 * `node:sqlite`, or undefined on a Node without it (before 22.13 it needed a flag). Loading it prints an
 * ExperimentalWarning on some versions; that one warning is not shown.
 */
export function loadSqlite(): Promise<Sqlite | undefined> {
  sqlite ??= (async () => {
    const emit = process.emitWarning;
    process.emitWarning = function (warning: string | Error, ...rest) {
      const text = typeof warning === "string" ? warning : warning.message;
      if (/sqlite/i.test(text)) return;
      return (emit as (...args: unknown[]) => void).call(
        process,
        warning,
        ...rest,
      );
    } as typeof process.emitWarning;
    try {
      return await import("node:sqlite");
    } catch {
      return undefined;
    } finally {
      process.emitWarning = emit;
    }
  })();
  return sqlite;
}

export function columns(db: Database, table: string): Set<string> {
  return new Set(
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => String(r.name)),
  );
}

// One row at a time where this Node can (22.13+), so a large database is never held in memory at once.
export function rows(
  db: Database,
  sql: string,
  ...params: string[]
): Iterable<Row> {
  const statement = db.prepare(sql);
  return typeof statement.iterate === "function"
    ? statement.iterate(...params)
    : statement.all(...params);
}

/** Whether `db` has a table called `name`. */
export function tableExists(db: Database, name: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(name) !== undefined
  );
}

/**
 * Opens `path` read-only, waiting up to 2 s for a writer's lock (the agent may be running), reads it with
 * `read`, and closes it. No `node:sqlite` on this Node (before 22.13): "no-sqlite". Anything else that fails:
 * "unreadable".
 */
export async function readSqlite<T>(
  path: string,
  read: (db: Database) => T,
): Promise<
  { ok: true; value: T } | { ok: false; reason: "no-sqlite" | "unreadable" }
> {
  const mod = await loadSqlite();
  if (!mod) return { ok: false, reason: "no-sqlite" };
  let db: Database | undefined;
  try {
    db = new mod.DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA busy_timeout = 2000");
    return { ok: true, value: read(db) };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    db?.close();
  }
}

/** The line printed when this Node cannot read an agent's database. */
export const noSqliteWarning = (agent: string): string =>
  `${agent} needs node 22.13 or newer to read its database (this is ${process.versions.node}); skipped.`;

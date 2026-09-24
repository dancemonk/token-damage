import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const IMPORT = /(?:import|export)\s[^;]*?from\s*"([^"]+)"|import\s*"([^"]+)"/g;

/** Every module reachable from `entry` through runtime (non-type) imports, and every bare specifier. */
function graph(entry: string) {
  const files = new Set<string>();
  const bare: string[] = [];
  const walk = (file: string) => {
    if (files.has(file)) return;
    files.add(file);
    if (file.endsWith(".json")) return;
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(IMPORT)) {
      if (/^(?:import|export)\s+type\s/.test(m[0])) continue;
      const spec = (m[1] ?? m[2])!;
      if (!spec.startsWith(".")) bare.push(spec);
      else walk(resolve(dirname(file), spec).replace(/\.js$/, ".ts"));
    }
  };
  walk(resolve(SRC, entry));
  return { files, bare };
}

describe("web entry", () => {
  it("reaches no node: module and no package", () => {
    const { files, bare } = graph("web.ts");
    expect(files.size).toBeGreaterThan(3);
    expect(bare).toEqual([]);
  });

  it("the node-only barrel does reach node:, so the walk works", () => {
    expect(graph("index.ts").bare.some((s) => s.startsWith("node:"))).toBe(
      true,
    );
  });
});

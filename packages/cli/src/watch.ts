import { watch, type FSWatcher } from "node:fs";

/** Recursive watchers on each root that exists; changes are debounced. Missing roots are left to the poll. */
export function watchRoots(
  roots: string[],
  onChange: () => void,
  debounceMs = 250,
): () => void {
  let timer: NodeJS.Timeout | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  };
  const watchers: FSWatcher[] = [];
  for (const root of roots) {
    try {
      const w = watch(root, { recursive: true, persistent: false }, fire);
      w.on("error", () => w.close());
      watchers.push(w);
    } catch {
      // Not there yet, or not watchable: the interval poll still sees it.
    }
  }
  return () => {
    clearTimeout(timer);
    for (const w of watchers) w.close();
  };
}

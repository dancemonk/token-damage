# @token-damage/core

The engine behind [`token-damage`](https://www.npmjs.com/package/token-damage). It finds Claude Code transcripts, parses them line by line, dedupes the usage, adds it up, prices it, estimates the electricity as a range, picks an adjuster's note, and builds the receipt that the CLI prints and the share card draws.

It has no runtime dependencies. It never keeps prompt text: user messages are reduced to a word count during parsing.

```ts
import { aggregate, claudeRoots, createDeduper, emptyStats, scanClaude } from "@token-damage/core";
import { homedir } from "node:os";

const deduper = createDeduper();
const stats = { ...emptyStats(), files: 0, subagentFiles: 0 };
for await (const record of scanClaude(claudeRoots(process.env, homedir()), stats)) deduper.add(record);
const { totals } = aggregate({ usage: deduper.result(), prompts: deduper.prompts() });
```

This is 0.x. The API follows what the CLI needs and will change without ceremony. The specs are in [`docs/`](https://github.com/dancemonk/token-damage/tree/main/docs).

MIT.

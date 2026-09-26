// Model names as ccusage 20.0.24 resolves them (rust/adapters/antigravity/src/parser.rs): numeric ids, display
// names and Antigravity's placeholders. Keep in step with it; the oracle compares tokens, not names. Claude ids
// take Anthropic's names (ccusage writes `claude-4.5-sonnet`), so they match the price table exactly.

import { modelName } from "../names.js";

const BY_ID: Record<number, string> = {
  246: "gemini-2.5-pro",
  312: "gemini-2.5-flash",
  313: "gemini-2.5-flash-thinking",
  329: "gemini-2.5-flash-thinking",
  330: "gemini-2.5-flash-lite",
  281: "claude-sonnet-4",
  282: "claude-sonnet-4",
  290: "claude-opus-4",
  291: "claude-opus-4",
  333: "claude-sonnet-4-5",
  334: "claude-sonnet-4-5",
  340: "claude-haiku-4-5",
  341: "claude-haiku-4-5",
  342: "model_openai_gpt_oss_120b_medium",
  1318: "gemini-3.8-flash-high",
  1319: "gemini-3.8-flash-medium",
  1320: "gemini-3.8-flash-low",
  1298: "gemini-3.7-flash-high",
  1299: "gemini-3.7-flash-medium",
  1300: "gemini-3.7-flash-low",
  1071: "gemini-3.6-flash-high",
  1072: "gemini-3.6-flash-medium",
  1073: "gemini-3.6-flash-low",
};

export function modelNameFromId(id: number): string {
  return (
    BY_ID[id] ??
    (id >= 1000 ? `model_placeholder_m${id - 1000}` : `antigravity-model-${id}`)
  );
}

const EFFORT: Record<string, string> = {
  "gemini 3.8 flash (high)": "gemini-3.8-flash-high",
  "gemini 3.8 flash (medium)": "gemini-3.8-flash-medium",
  "gemini 3.8 flash (low)": "gemini-3.8-flash-low",
  "gemini 3.7 flash (high)": "gemini-3.7-flash-high",
  "gemini 3.7 flash (medium)": "gemini-3.7-flash-medium",
  "gemini 3.7 flash (low)": "gemini-3.7-flash-low",
  "gemini 3.6 flash (high)": "gemini-3.6-flash-high",
  "gemini 3.6 flash (medium)": "gemini-3.6-flash-medium",
  "gemini 3.6 flash (low)": "gemini-3.6-flash-low",
};

const NAMES: Record<string, string> = {
  "gemini 3.8 flash": "gemini-3.8-flash",
  "gemini 3.8 flash thinking": "gemini-3.8-flash",
  "gemini 3.7 flash": "gemini-3.7-flash",
  "gemini 3.7 flash thinking": "gemini-3.7-flash",
  "gemini 3.7 pro": "gemini-3.7-pro",
  "gemini 3.7 pro thinking": "gemini-3.7-pro",
  "gemini 3.6 flash": "gemini-3.6-flash",
  "gemini 3 flash": "gemini-3.6-flash",
  "gemini 3.6 pro": "gemini-3.6-pro",
  "gemini 3 pro": "gemini-3-pro",
  "gemini 3 pro thinking": "gemini-3-pro",
  "gemini 2.5 flash": "gemini-2.5-flash",
  "gemini 2.5 pro": "gemini-2.5-pro",
  "gemini 2.0 flash": "gemini-2.0-flash",
  "gemini 2 flash": "gemini-2.0-flash",
  "gemini 2.0 pro": "gemini-2.0-pro",
  "gemini 1.5 flash": "gemini-1.5-flash",
  "gemini 1.5 pro": "gemini-1.5-pro",
  model_placeholder_m318: "gemini-3.8-flash-high",
  model_placeholder_m319: "gemini-3.8-flash-medium",
  model_placeholder_m320: "gemini-3.8-flash-low",
  model_placeholder_m298: "gemini-3.7-flash-high",
  model_placeholder_m299: "gemini-3.7-flash-medium",
  model_placeholder_m300: "gemini-3.7-flash-low",
  model_placeholder_m71: "gemini-3.6-flash-high",
  model_placeholder_m72: "gemini-3.6-flash-medium",
  model_placeholder_m73: "gemini-3.6-flash-low",
  model_placeholder_m26: "claude-opus-4-6",
  model_placeholder_m35: "claude-sonnet-4-6",
  model_placeholder_m36: "gemini-3.1-pro",
  model_placeholder_m37: "gemini-3.1-pro",
  model_placeholder_m16: "gemini-3.1-pro",
  model_placeholder_m18: "gemini-3-flash-preview",
  model_placeholder_m84: "gemini-3-flash-preview",
  model_placeholder_m47: "gemini-3-flash-preview",
  model_placeholder_m132: "gemini-3.5-flash-high",
  model_placeholder_m133: "gemini-3.5-flash-high",
  model_placeholder_m187: "gemini-3.5-flash-extra-low",
  model_placeholder_m20: "gemini-3.5-flash-medium",
  model_openai_gpt_oss_120b_medium: "gpt-oss-120b-medium",
  "gemini-pro-default": "gemini-3.1-pro",
  "gemini-pro-agent": "gemini-3.1-pro",
  "gemini-3-flash-agent": "gemini-3.5-flash-high",
  "gemini-3-flash-agent-a": "gemini-3.5-flash-high",
  "gemini-3-flash-agent-b": "gemini-3.5-flash-high",
  "gemini-3-flash-a": "gemini-3.5-flash-high",
  "gemini-3-flash-b": "gemini-3.5-flash-high",
  "gemini-3-flash-c": "gemini-3-flash-preview",
  "gemini-3-flash": "gemini-3-flash-preview",
  "gemini-3.5-flash-low": "gemini-3.5-flash-medium",
  "gemini-3.1-pro-high": "gemini-3.1-pro",
  "gemini-3.1-pro-low": "gemini-3.1-pro",
  "gemini-3-pro-high": "gemini-3-pro",
  "gemini-3-pro-low": "gemini-3-pro",
  "claude 3.7 sonnet": "claude-3-7-sonnet",
  "claude 3.7 sonnet thinking": "claude-3-7-sonnet",
  "claude 3.5 sonnet": "claude-3-5-sonnet",
  "claude 3.5 haiku": "claude-3-5-haiku",
  "claude 3 opus": "claude-3-opus",
};

/** A model name or display name as ccusage normalizes it; undefined when blank. */
export function normalizeModel(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const lower = trimmed.toLowerCase();
  const effort = EFFORT[lower];
  if (effort) return effort;
  const paren = lower.indexOf("(");
  const base = paren >= 0 ? lower.slice(0, paren).trim() : lower;
  const known = NAMES[base];
  if (known) return known;
  const dashed = base.replaceAll(" ", "-");
  // ccusage keeps any other text as it is; we keep it only when it looks like a model id (adapters/names.ts).
  return modelName(/^(gemini|claude|gpt)-/.test(dashed) ? dashed : trimmed);
}

/** A Gemini thinking level does not change its per-token price: `gemini-3.8-flash-high` → gemini-3.8-flash. */
export const withoutEffort = (model: string): string =>
  model.startsWith("gemini-")
    ? model.replace(/-(?:extra-low|high|medium|low)$/, "")
    : model;

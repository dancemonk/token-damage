// A model name read from a log field reaches the receipt. Only text shaped like a model id gets through, so a field
// an agent later repurposes can never carry a prompt onto the page.
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,79}$/;

/** The trimmed text when it looks like a model id, else undefined. */
export function modelName(raw: string): string | undefined {
  const name = raw.trim();
  return MODEL_ID.test(name) ? name : undefined;
}

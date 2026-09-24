// A JSON Schema validator for the subset schema/receipt.schema.json uses; avoids a runtime-irrelevant dependency.
type Schema = Record<string, unknown>;

const typeOf = (v: unknown) =>
  v === null
    ? "null"
    : Array.isArray(v)
      ? "array"
      : Number.isInteger(v)
        ? "integer"
        : typeof v;

export function validate(
  value: unknown,
  schema: Schema,
  root: Schema = schema,
  path = "$",
): string[] {
  if (typeof schema.$ref === "string") {
    const target = schema.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce<unknown>((s, k) => (s as Schema)[k], root);
    return validate(value, target as Schema, root, path);
  }
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(`${path}: ${msg}`);
  if (schema.type !== undefined) {
    const t = typeOf(value);
    const ok =
      schema.type === t || (schema.type === "number" && t === "integer");
    if (!ok) return [`${path}: expected ${String(schema.type)}, got ${t}`];
  }
  if ("const" in schema && value !== schema.const)
    fail(`expected ${JSON.stringify(schema.const)}`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    fail(`not one of ${JSON.stringify(schema.enum)}`);
  if (
    typeof schema.pattern === "string" &&
    typeof value === "string" &&
    !new RegExp(schema.pattern).test(value)
  ) {
    fail(`does not match ${schema.pattern}`);
  }
  if (
    typeof schema.minimum === "number" &&
    typeof value === "number" &&
    value < schema.minimum
  )
    fail(`below ${schema.minimum}`);
  if (
    typeof schema.maxItems === "number" &&
    Array.isArray(value) &&
    value.length > schema.maxItems
  )
    fail("too many items");
  if (Array.isArray(schema.allOf))
    for (const s of schema.allOf)
      errors.push(...validate(value, s as Schema, root, path));
  if (
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some(
      (s) => validate(value, s as Schema, root, path).length === 0,
    )
  ) {
    fail("matches none of anyOf");
  }
  if (Array.isArray(value) && schema.items)
    value.forEach((v, i) =>
      errors.push(
        ...validate(v, schema.items as Schema, root, `${path}[${i}]`),
      ),
    );
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required as string[] | undefined) ?? [])
      if (!(key in obj)) fail(`missing ${key}`);
    for (const [key, v] of Object.entries(obj)) {
      if (props[key])
        errors.push(...validate(v, props[key], root, `${path}.${key}`));
      else if (schema.additionalProperties === false) fail(`unexpected ${key}`);
    }
  }
  return errors;
}

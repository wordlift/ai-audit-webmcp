/**
 * The form a tool's own input schema asks for, in a person's terms: one field per property, typed
 * by what the schema says, required where it says so, prefilled with its default. The person
 * supplies what the audit would not invent; nothing here is guessed.
 */
export interface TestField {
  name: string;
  label: string;
  kind: "text" | "number" | "date" | "boolean" | "select";
  required: boolean;
  description?: string;
  options?: string[];
  defaultValue?: string | number | boolean;
  minimum?: number;
  maximum?: number;
}

interface Schema {
  type?: unknown;
  format?: unknown;
  enum?: unknown[];
  description?: unknown;
  default?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  required?: unknown;
  properties?: Record<string, Schema>;
}

const DATE_NAME = /(date|check[_-]?in|check[_-]?out|from|until|arrival|departure)/i;

function labelOf(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function fieldsFrom(schema: Schema | undefined): TestField[] {
  const properties = schema?.properties ?? {};
  const required = new Set(Array.isArray(schema?.required) ? (schema.required as unknown[]).filter((key): key is string => typeof key === "string") : []);
  return Object.entries(properties).map(([name, property]) => {
    const type = Array.isArray(property.type) ? property.type[0] : property.type;
    const options = Array.isArray(property.enum) ? property.enum.map(String) : undefined;
    const kind: TestField["kind"] = options
      ? "select"
      : type === "boolean"
        ? "boolean"
        : type === "integer" || type === "number"
          ? "number"
          : property.format === "date" || (type === "string" && DATE_NAME.test(name))
            ? "date"
            : "text";
    const defaultValue = typeof property.default === "string" || typeof property.default === "number" || typeof property.default === "boolean" ? property.default : undefined;
    return {
      name,
      label: labelOf(name),
      kind,
      required: required.has(name),
      ...(typeof property.description === "string" ? { description: property.description } : {}),
      ...(options ? { options } : {}),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      ...(typeof property.minimum === "number" ? { minimum: property.minimum } : {}),
      ...(typeof property.maximum === "number" ? { maximum: property.maximum } : {}),
    };
  });
}

/** The values a person typed, as the tool expects them: numbers as numbers, booleans as booleans, blanks left out. */
export function argumentsFrom(fields: TestField[], values: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === "boolean") {
      if (value === true) out[field.name] = true;
      continue;
    }
    if (typeof value !== "string" || value.trim() === "") continue;
    out[field.name] = field.kind === "number" ? Number(value) : value.trim();
  }
  return out;
}

/** Every required field has a value, or the name of the first one that has not. */
export function missingRequired(fields: TestField[], values: Record<string, string | boolean>): string | null {
  for (const field of fields) {
    if (!field.required) continue;
    const value = values[field.name];
    if (field.kind === "boolean" ? value !== true : typeof value !== "string" || value.trim() === "") return field.label;
  }
  return null;
}

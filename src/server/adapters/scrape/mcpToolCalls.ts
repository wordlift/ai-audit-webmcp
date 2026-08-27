import type { McpToolProbe } from "./ScrapeProvider.js";

/** At most this many tools are called per endpoint, to keep the load on an audited site small. */
export const MAX_TOOL_CALLS = 5;

/**
 * Verbs that must never be called whatever a server annotates them. A mis-annotated tool is exactly
 * the failure this list exists to survive, so the name is checked independently of the hints.
 */
const UNSAFE_NAME =
  /\b(checkout|purchase|pay|payment|order|reserve|reservation|cancel|refund|delete|remove|update|create|write|send|submit|subscribe|register|launch|start|complete|book)\b/;

export interface McpToolDescriptor {
  name: string;
  inputSchema?: JsonSchema;
  annotations?: { readOnlyHint?: unknown; destructiveHint?: unknown };
}

export interface JsonSchema {
  type?: unknown;
  format?: unknown;
  enum?: unknown[];
  minimum?: unknown;
  default?: unknown;
  required?: unknown;
  properties?: Record<string, JsonSchema>;
}

/** Only a listing returns things that can be looked up; a config result names the server itself. */
export const LISTING_TOOL = /\b(search|list|find|query|browse|catalog|catalogue|feed)\b/;

export interface ProbeSeed {
  /** A neutral search term taken from the audited page, never invented vocabulary. */
  query: string;
  /** An identifier harvested from an earlier call on this same server. */
  id?: string;
}

/**
 * Splits a tool name into words before matching. `_` is a word character, so `\bcheckout\b` does
 * not match `create_checkout_session`, and every snake_case name would slip past the block list.
 */
export function nameWords(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .toLowerCase()
    .trim();
}

/** A tool is callable only if the server says it is read-only and the name carries no verb of consequence. */
export function isSafeToCall(tool: McpToolDescriptor): { safe: boolean; note?: string } {
  const annotations = tool.annotations ?? {};
  if (annotations.readOnlyHint !== true) return { safe: false, note: "not annotated read-only" };
  if (annotations.destructiveHint === true) return { safe: false, note: "annotated destructive" };
  if (UNSAFE_NAME.test(nameWords(tool.name))) return { safe: false, note: "the name implies a transaction" };
  return { safe: true };
}

/**
 * Fills only the required arguments, and only from evidence: dates and neutral terms are safe to
 * synthesize, an identifier is not. Returns null when anything would have to be guessed.
 */
export function buildArguments(schema: JsonSchema | undefined, seed: ProbeSeed): Record<string, unknown> | null {
  const required = Array.isArray(schema?.required) ? (schema.required as unknown[]).filter((key): key is string => typeof key === "string") : [];
  if (required.length === 0) return {};

  const properties = schema?.properties ?? {};
  const args: Record<string, unknown> = {};
  for (const key of required) {
    const value = synthesize(key, properties[key], seed);
    if (value === undefined) return null;
    args[key] = value;
  }
  return args;
}

const DAY_MS = 86_400_000;

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function synthesize(key: string, property: JsonSchema | undefined, seed: ProbeSeed): unknown {
  const name = key.toLowerCase();
  if (property?.default !== undefined) return property.default;
  if (Array.isArray(property?.enum) && property.enum.length > 0) return property.enum[0];

  if (/check.?out|departure|end.?date/.test(name)) return isoDate(33);
  if (/check.?in|arrival|start.?date/.test(name) || property?.format === "date") return isoDate(30);
  if (/query|search|keyword|term|prompt|question|^q$|text/.test(name)) return seed.query;
  if (/locale|language|lang/.test(name)) return "en";
  // An identifier is never invented: it is either harvested from this server or the tool is skipped.
  if (/(^|_)id$|identifier|slug|sku/.test(name)) return seed.id;

  if (property?.type === "integer" || property?.type === "number") {
    return typeof property.minimum === "number" ? property.minimum : 1;
  }
  if (property?.type === "boolean") return false;
  return undefined;
}

/**
 * Pulls an identifier out of an MCP tool result so a detail-style tool can be tried for real.
 * Servers return their payload as `structuredContent` or as JSON inside a text block, so both are
 * unwrapped before the scan. An empty identifier is not an identifier.
 */
export function harvestIdentifier(result: unknown): string | undefined {
  for (const payload of unwrap(result)) {
    const found = scanForIdentifier(payload, 0);
    if (found) return found;
  }
  return undefined;
}

function unwrap(result: unknown): unknown[] {
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const payloads: unknown[] = [];

  if (record.structuredContent) payloads.push(record.structuredContent);
  for (const item of Array.isArray(record.content) ? record.content : []) {
    const body = item && typeof item === "object" ? (item as { text?: unknown }).text : undefined;
    if (typeof body !== "string") continue;
    try {
      payloads.push(JSON.parse(body));
    } catch {
      // Plain prose carries no identifier worth chaining on.
    }
  }
  payloads.push(record);
  return payloads;
}

/**
 * Servers do not always set `isError`. alpina.travel answers an unknown product with
 * `isError: false` and an `error` object in the payload, which would otherwise be recorded as a
 * verified invocation — the precise false positive this audit exists to prevent.
 */
export function resultError(result: unknown): string | undefined {
  for (const payload of unwrap(result)) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim().length > 0) return error.trim().slice(0, 160);
    if (error && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      return typeof message === "string" ? message.slice(0, 160) : "the tool reported an error";
    }
  }
  return undefined;
}

/** Identifiers that name the caller or the session rather than a thing that can be looked up. */
const CONTEXT_ID = /^(tenant|session|request|trace|correlation|merchant|account|user|customer|widget|order)_?id$/i;

function scanForIdentifier(payload: unknown, depth: number): string | undefined {
  if (depth > 6 || !payload) return undefined;
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = scanForIdentifier(entry, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof payload !== "object") return undefined;

  const record = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (CONTEXT_ID.test(key)) continue;
    if (/(^|_)id$|^sku$|^slug$/i.test(key) && typeof value === "string" && value.length > 0 && value.length <= 120) {
      return value;
    }
  }
  for (const value of Object.values(record)) {
    const found = scanForIdentifier(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function skipped(name: string, note: string): McpToolProbe {
  return { name, called: false, ok: false, note };
}

import { safeFetch, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import type { DeclaredEntryPoint, EntryPointProbe } from "./ScrapeProvider.js";

/**
 * The entry points a site declares in its markup — schema.org `potentialAction` with a `target`
 * — and what happens when an agent uses one. A read action over GET is executed once, with a
 * query taken from the page; a write action is never executed, and an entry point that needs an
 * input the audit cannot supply is left as declared. Verified by calling, or not at all.
 */
const MAX_DEPTH = 6;
const MAX_BYTES = 1_000_000;
export const MAX_ENTRY_POINTS = 5;

/** Schema.org action types and the action in the model each one serves. */
const ACTION_TYPES: Record<string, { actionId: string; read: boolean }> = {
  SearchAction: { actionId: "site.search", read: true },
  FindAction: { actionId: "site.search", read: true },
  DiscoverAction: { actionId: "site.search", read: true },
  ViewAction: { actionId: "detail.retrieve", read: true },
  ReadAction: { actionId: "detail.retrieve", read: true },
  WatchAction: { actionId: "detail.retrieve", read: true },
  ListenAction: { actionId: "detail.retrieve", read: true },
  CheckAction: { actionId: "availability.check", read: true },
  TrackAction: { actionId: "transaction.status", read: true },
  ReserveAction: { actionId: "checkout.create", read: false },
  BuyAction: { actionId: "checkout.complete", read: false },
  OrderAction: { actionId: "checkout.complete", read: false },
  PayAction: { actionId: "checkout.complete", read: false },
  RegisterAction: { actionId: "trial.start", read: false },
  SubscribeAction: { actionId: "subscription.start", read: false },
  JoinAction: { actionId: "subscription.start", read: false },
  ApplyAction: { actionId: "application.start", read: false },
  QuoteAction: { actionId: "quote.request", read: false },
  CommunicateAction: { actionId: "inquiry.submit", read: false },
  AskAction: { actionId: "inquiry.submit", read: false },
  SendAction: { actionId: "inquiry.submit", read: false },
  UpdateAction: { actionId: "transaction.modify", read: false },
  CancelAction: { actionId: "transaction.modify", read: false },
};

/** Placeholders the audit can fill from the page itself. Anything else is an input it would have to invent. */
const QUERY_PLACEHOLDERS = /\{(search_term_string|query|q|term|keyword|keywords|s)\}/gi;

/** Reads every declared entry point out of a page's JSON-LD, on the site's origin only, SearchAction aside. */
export function findEntryPoints(document: Document, base: URL, sourceUrl: string): DeclaredEntryPoint[] {
  const found: DeclaredEntryPoint[] = [];
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 25)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    walk(parsed, base, sourceUrl, found, 0);
  }
  const seen = new Set<string>();
  return found.filter((entry) => {
    const key = `${entry.actionType}|${entry.template}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function walk(node: unknown, base: URL, sourceUrl: string, found: DeclaredEntryPoint[], depth: number): void {
  if (depth > MAX_DEPTH || !node) return;
  if (Array.isArray(node)) {
    for (const entry of node) walk(entry, base, sourceUrl, found, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;

  const actions = Array.isArray(record.potentialAction) ? record.potentialAction : record.potentialAction ? [record.potentialAction] : [];
  for (const action of actions) {
    const declared = readAction(action, base, sourceUrl);
    if (declared) found.push(declared);
  }
  for (const key of ["@graph", "mainEntity", "itemListElement", "about"]) walk(record[key], base, sourceUrl, found, depth + 1);
}

function readAction(action: unknown, base: URL, sourceUrl: string): DeclaredEntryPoint | null {
  if (!action || typeof action !== "object") return null;
  const record = action as Record<string, unknown>;
  const types = (Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]])
    .filter((type): type is string => typeof type === "string")
    .map((type) => type.replace(/^https?:\/\/schema\.org\//, ""));
  // The SearchAction has its own executor, which judges a results page more carefully.
  const actionType = types.find((type) => type in ACTION_TYPES && type !== "SearchAction");
  if (!actionType) return null;
  const target = record.target;
  const template = typeof target === "string" ? target : target && typeof target === "object" ? (target as { urlTemplate?: unknown }).urlTemplate : undefined;
  if (typeof template !== "string") return null;
  const method = (target && typeof target === "object" ? (target as { httpMethod?: unknown }).httpMethod : undefined);
  const httpMethod = (typeof method === "string" ? method : Array.isArray(method) ? String(method[0] ?? "GET") : "GET").toUpperCase();
  try {
    if (new URL(template.replace(/\{[^}]+\}/g, "probe"), base).origin !== base.origin) return null;
  } catch {
    return null;
  }
  const rule = ACTION_TYPES[actionType]!;
  return {
    actionType,
    actionId: rule.actionId,
    template,
    httpMethod,
    read: rule.read && httpMethod === "GET",
    name: typeof record.name === "string" ? record.name.slice(0, 120) : undefined,
    sourceUrl,
  };
}

/**
 * Executes one declared entry point, or explains why it will not. A write is never executed. A
 * placeholder the page cannot fill is left alone. What answers is judged the way a search result
 * is: a 200 whose body acknowledges the query, or, for a fixed URL, a 200 with a body at all.
 */
export async function executeEntryPoint(entry: DeclaredEntryPoint, query: string, options: UrlPolicyOptions = {}): Promise<EntryPointProbe> {
  const base = { actionType: entry.actionType, actionId: entry.actionId, template: entry.template, sourceUrl: entry.sourceUrl };
  if (!entry.read) {
    return { ...base, url: entry.template, status: 0, invoked: false, ok: false, note: entry.httpMethod === "GET" ? "it would write: a reservation, a purchase, a message" : `it is declared over ${entry.httpMethod}, which an audit never sends` };
  }
  const filled = entry.template.replace(QUERY_PLACEHOLDERS, encodeURIComponent(query));
  const unfilled = /\{([^}]+)\}/.exec(filled);
  if (unfilled) {
    return { ...base, url: entry.template, status: 0, invoked: false, ok: false, note: `it needs an input the audit cannot supply: ${unfilled[1]!.slice(0, 40)}` };
  }
  const withQuery = filled !== entry.template;
  try {
    const response = await safeFetch(filled, { ...options, timeoutMs: options.timeoutMs ?? 8_000, maxBytes: MAX_BYTES });
    const answered = response.status === 200 && response.body.trim().length > 0;
    const ok = answered && (!withQuery || reflects(response.body, query));
    return {
      ...base,
      url: response.finalUrl,
      status: response.status,
      invoked: true,
      ok,
      ...(ok
        ? {}
        : {
            note:
              response.status === 200
                ? withQuery
                  ? "the page did not acknowledge the query without executing site scripts"
                  : "it answered with an empty body"
                : `it answered HTTP ${response.status}`,
          }),
    };
  } catch (error) {
    return { ...base, url: filled, status: 0, invoked: true, ok: false, note: error instanceof Error ? error.message.slice(0, 160) : "it could not be executed" };
  }
}

function reflects(body: string, query: string): boolean {
  const haystack = body.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (needle.length > 0 && haystack.includes(needle)) return true;
  const word = needle.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
  return word.length >= 4 && haystack.includes(word);
}

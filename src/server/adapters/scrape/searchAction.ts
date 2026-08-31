import { safeFetch, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import type { SearchActionProbe } from "./ScrapeProvider.js";

const MAX_DEPTH = 6;
const MAX_BYTES = 1_000_000;

/**
 * Reads the site's declared schema.org SearchAction URL template out of its JSON-LD. Only a
 * same-origin template with a substitutable placeholder counts: a template pointing at another
 * host is not this site's interface, and a fixed URL is a link, not an action.
 */
export function findSearchActionTemplate(document: Document, base: URL): string | null {
  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 25)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    const found = walk(parsed, base, 0);
    if (found) return found;
  }
  return null;
}

function walk(node: unknown, base: URL, depth: number): string | null {
  if (depth > MAX_DEPTH || !node) return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = walk(entry, base, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== "object") return null;

  const record = node as Record<string, unknown>;
  const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
  if (types.includes("SearchAction")) {
    const target = record.target;
    const template =
      typeof target === "string"
        ? target
        : target && typeof target === "object"
          ? (target as { urlTemplate?: unknown }).urlTemplate
          : undefined;
    if (typeof template === "string" && /\{[^}]+\}/.test(template)) {
      try {
        if (new URL(template.replace(/\{[^}]+\}/g, "probe")).origin === base.origin) return template;
      } catch {
        // An unparseable template is not an interface.
      }
    }
  }

  for (const key of ["@graph", "potentialAction", "mainEntity"]) {
    const found = walk(record[key], base, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Executes the declared template once, read-only, with a query taken from the page itself. The
 * result is judged carefully: a 200 whose body never acknowledges the query is *not* confirmed —
 * client-rendered results are invisible without executing scripts, and the audit will not turn
 * that blind spot into either an award or an accusation.
 */
export async function executeSearchAction(
  template: string,
  query: string,
  options: UrlPolicyOptions = {},
): Promise<SearchActionProbe> {
  const url = template.replace(/\{[^}]+\}/g, encodeURIComponent(query));
  try {
    const response = await safeFetch(url, { ...options, timeoutMs: options.timeoutMs ?? 8_000, maxBytes: MAX_BYTES });
    const confirmed = response.status === 200 && reflects(response.body, query);
    return {
      template,
      url: response.finalUrl,
      query,
      status: response.status,
      confirmed,
      ...(confirmed
        ? {}
        : {
            note:
              response.status === 200
                ? "the results page did not acknowledge the query without executing site scripts"
                : `the declared search template answered HTTP ${response.status}`,
          }),
    };
  } catch (error) {
    return {
      template,
      url,
      query,
      status: 0,
      confirmed: false,
      note: error instanceof Error ? error.message.slice(0, 160) : "the declared search template could not be executed",
    };
  }
}

/** Does the page acknowledge the query — verbatim, or by its longest word? */
function reflects(body: string, query: string): boolean {
  const haystack = body.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (needle.length > 0 && haystack.includes(needle)) return true;
  const word = needle.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? "";
  return word.length > 3 && haystack.includes(word);
}

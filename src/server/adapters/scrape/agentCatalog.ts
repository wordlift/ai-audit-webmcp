import type { DiscoveryDocument } from "./ScrapeProvider.js";

/**
 * The catalog a site publishes for agents: Agentic Resource Discovery (ARD), the envelope Google's
 * registry crawls. It names where a site's capabilities live — an MCP server card, an A2A agent
 * card, a skill an agent loads before acting — and nothing about whether they work. The audit
 * reads it as a declaration, follows what it points at on the site's own origin, and lets the
 * probes say the rest.
 *
 * The draft is still moving: the spec says `/.well-known/ard.json`, Google's announcement says
 * `ai-catalog.json`. Both are read; neither is preferred.
 */
export const CATALOG_KINDS: ReadonlySet<DiscoveryDocument["kind"]> = new Set(["ai-catalog", "ard"]);

export interface CatalogEntry {
  identifier?: string;
  type: string;
  url?: string;
}

const SERVER_CARD_TYPES = new Set(["application/mcp-server-card+json", "application/mcp-server+json"]);
const SKILL_TYPES = new Set(["application/ai-skill+md"]);

/** How many catalog entries are followed, and how many hints beyond the well-known path are read. */
export const MAX_CATALOG_ENTRIES = 40;
export const MAX_CATALOG_HINTS = 2;
export const MAX_NAMED_INTERFACES = 5;

/** A catalog's entries, read loosely: an entry without a type says nothing an agent could follow. */
export function parseCatalogEntries(body: string): CatalogEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const entries = (parsed as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      ...(typeof entry.identifier === "string" ? { identifier: entry.identifier.slice(0, 300) } : {}),
      type: typeof entry.type === "string" ? entry.type.trim().toLowerCase() : "",
      ...(typeof entry.url === "string" && /^https?:\/\//.test(entry.url) ? { url: entry.url.slice(0, 2_048) } : {}),
    }))
    .filter((entry) => entry.type.length > 0)
    .slice(0, MAX_CATALOG_ENTRIES);
}

export function isServerCardEntry(entry: CatalogEntry): boolean {
  return SERVER_CARD_TYPES.has(entry.type);
}

export function isSkillEntry(entry: CatalogEntry): boolean {
  return SKILL_TYPES.has(entry.type);
}

/** The catalog entries whose artifact sits on the site's own origin; anything elsewhere is someone else's claim. */
export function sameOriginEntries(entries: CatalogEntry[], base: URL): Array<CatalogEntry & { url: string }> {
  return entries.filter((entry): entry is CatalogEntry & { url: string } => {
    if (!entry.url) return false;
    try {
      return new URL(entry.url).origin === base.origin;
    } catch {
      return false;
    }
  });
}

/** The least a parsed page has to offer for the link hint to be read. */
interface LinkDocument {
  querySelectorAll(selector: string): Iterable<{ getAttribute(name: string): string | null }>;
}

/**
 * Where a site says its catalog is, beyond the well-known path: a `<link rel="ai-catalog">` on the
 * page, or an `Agentmap:` line in robots.txt. Only the site's own origin is followed.
 */
export function catalogHints(document: LinkDocument | null, robotsBody: string, base: URL): string[] {
  const hints: string[] = [];
  for (const node of document?.querySelectorAll('link[rel~="ai-catalog"]') ?? []) {
    const url = sameOrigin(node.getAttribute("href"), base);
    if (url) hints.push(url);
  }
  for (const line of robotsBody.split(/\r?\n/)) {
    const match = /^\s*agentmap\s*:\s*(\S+)/i.exec(line);
    const url = match ? sameOrigin(match[1] ?? null, base) : null;
    if (url) hints.push(url);
  }
  return [...new Set(hints)].slice(0, MAX_CATALOG_HINTS);
}

/**
 * The MCP endpoints a skill names on the site's own origin. A skill is memory an agent loads before
 * acting, so an interface it names is a declaration the audit can test, and one that then fails is
 * the memory promising what the site does not do.
 */
export function interfacesNamedIn(markdown: string, base: URL): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
    const url = sameOrigin(match[0].replace(/[.,;:]+$/, ""), base);
    if (!url) continue;
    if (!/(^|\/)mcp(\/|$|-)/.test(new URL(url).pathname.toLowerCase())) continue;
    found.add(url);
    if (found.size >= MAX_NAMED_INTERFACES) break;
  }
  return [...found];
}

/** The transports a server card names, streamable HTTP first: it is current, and the SSE one is deprecated. */
export function serverCardEndpoints(body: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const transports = (parsed as { transports?: unknown } | null)?.transports;
  if (!Array.isArray(transports)) return [];
  return transports
    .map((entry) => (entry && typeof entry === "object" ? (entry as { endpoint?: unknown; type?: unknown }) : {}))
    .map((entry) => ({ endpoint: String(entry.endpoint ?? ""), streamable: String(entry.type ?? "") !== "sse" }))
    .filter((entry) => /^https?:\/\//.test(entry.endpoint))
    .sort((left, right) => Number(right.streamable) - Number(left.streamable))
    .map((entry) => entry.endpoint)
    .slice(0, 10);
}

function sameOrigin(href: string | null, base: URL): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    if (url.origin !== base.origin) return null;
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

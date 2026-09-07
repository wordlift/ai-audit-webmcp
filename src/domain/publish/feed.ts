import type { CatalogEntry } from "../../server/adapters/scrape/agentCatalog.js";
import type { PublishedSite } from "../../server/adapters/published/PublishedSiteStore.js";
import type { DiscoveryDocument } from "../../server/adapters/scrape/ScrapeProvider.js";
import { ARD, ardEntrySchema, type ArdEntry, type ArdManifest } from "./ardSchema.js";

/**
 * Distribute, the part that is ours to prepare: one entry source a registry can read instead of
 * crawling every site one by one. It lists the entries of the sites that publish through this
 * service, each pointing at the site's own domain, so the trust anchor stays the publisher's and
 * we are the sitemap index, not the directory. No ranking, no browsing, nothing about a site that
 * did not publish. The spec allows a manifest at "any entry source"; this is one.
 */
const TERMS_OF_ACTION = /^urn:(air|ai):([a-z0-9.-]+):terms-of-action$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sameSite(url: string | undefined, host: string): boolean {
  const target = url ? hostOf(url) : null;
  return target === host;
}

/**
 * Whether a site's own catalog carries the Terms of Action this service writes, and what it lists.
 * Read from the discovery documents an audit fetched; nothing here is fetched again. Null when the
 * site publishes nothing of ours, which is also how a site that stopped is forgotten.
 */
export function publishedSiteIn(discovery: DiscoveryDocument[], canonicalUrl: string, reportId: string, seenAt: string, expiresAt: string): PublishedSite | null {
  const host = hostOf(canonicalUrl);
  if (!host) return null;
  for (const document of discovery) {
    if ((document.kind !== "ai-catalog" && document.kind !== "ard") || !document.found || !document.entries?.length) continue;
    if (!sameSite(document.url, host)) continue;
    const ours = document.entries.some((entry) => {
      const match = entry.identifier ? TERMS_OF_ACTION.exec(entry.identifier) : null;
      return Boolean(match && match[2]!.toLowerCase() === host && sameSite(entry.url, host));
    });
    if (!ours) continue;
    // Only what points back at the site travels: an entry naming another domain is someone else's claim.
    const entries = document.entries.filter((entry) => !entry.url || sameSite(entry.url, host));
    return { host, catalogUrl: document.url, entries, reportId, seenAt, expiresAt };
  }
  return null;
}

/** A site's entry, as the registry wants it: what the site said, made valid where the spec is stricter than the reader. */
function feedEntry(site: PublishedSite, entry: CatalogEntry): ArdEntry | null {
  if (!entry.identifier || !entry.url) return null;
  const candidate = {
    identifier: entry.identifier.replace(/^urn:ai:/i, `${ARD.urnPrefix}:`),
    displayName: entry.displayName ?? `${site.host} ${entry.type === ARD.skillType ? "Terms of Action" : entry.type}`,
    type: entry.type,
    url: entry.url,
    ...(entry.description ? { description: entry.description } : {}),
    ...(entry.capabilities ? { capabilities: entry.capabilities } : {}),
    ...(entry.representativeQueries ? { representativeQueries: entry.representativeQueries } : {}),
    updatedAt: site.seenAt,
    metadata: { publisher: site.host, catalog: site.catalogUrl, seenBy: "WordLift AI Audit" },
  };
  const parsed = ardEntrySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export interface FeedOptions {
  /** This service's own origin, named as the source. */
  base: string;
  now?: () => Date;
}

/** The entry source: every published site's valid entries, newest site first. */
export function buildFeed(sites: PublishedSite[], options: FeedOptions): ArdManifest & { source: Record<string, unknown> } {
  const entries = sites.flatMap((site) => site.entries.map((entry) => feedEntry(site, entry)).filter((entry): entry is ArdEntry => entry !== null));
  return {
    specVersion: ARD.specVersion,
    source: {
      displayName: "WordLift AI Audit",
      url: `${options.base}/feed/ai-catalog.json`,
      description: "The catalogs of the sites that publish their Terms of Action through WordLift AI Audit, each on its own domain.",
      publishers: sites.length,
      generatedAt: (options.now?.() ?? new Date()).toISOString(),
    },
    entries,
  };
}

/** This service's own catalog: the audit answers the questions it asks. One entry, its MCP server. */
export function ownCatalog(base: string): ArdManifest {
  const host = hostOf(base) ?? base;
  return {
    specVersion: ARD.specVersion,
    host: { displayName: "WordLift AI Audit", identifier: host },
    entries: [
      ardEntrySchema.parse({
        identifier: `${ARD.urnPrefix}:${host}:audit:mcp`,
        displayName: "WordLift AI Audit MCP server",
        type: "application/mcp-server-card+json",
        url: `${base}/.well-known/mcp/server-card.json`,
        description: "Audits a public website from an AI agent's perspective: what a human can do on it, which of those actions an agent can complete, and the evidence for each claim.",
        capabilities: ["audit-website", "get-audit-report", "inspect-terms-of-action", "refine-terms-of-action", "explain-capability", "explain-foundation-audit"],
        representativeQueries: ["Can AI agents use this website?", "Audit example.com for agent readiness", "What can an agent do on this site?"],
        metadata: { entrySource: `${base}/feed/ai-catalog.json`, documentation: `${base}/llms.txt` },
      }),
    ],
  };
}

/** The MCP server card the catalog points at: the transport, as the collector reads it. */
export function ownServerCard(base: string) {
  return {
    name: "WordLift AI Audit",
    description: "Audits a public website from an AI agent's perspective and publishes machine-generated Terms of Action.",
    documentation: `${base}/llms.txt`,
    privacyPolicy: `${base}/privacy`,
    transports: [{ type: "streamable-http", endpoint: `${base}/mcp` }],
  };
}

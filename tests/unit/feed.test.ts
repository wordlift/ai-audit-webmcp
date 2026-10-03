import { ardManifestSchema } from "../../src/domain/publish/ardSchema.js";
import { buildFeed, ownCatalog, ownServerCard, publishedSiteIn } from "../../src/domain/publish/feed.js";
import type { PublishedSite } from "../../src/server/adapters/published/PublishedSiteStore.js";
import { parseCatalogEntries } from "../../src/server/adapters/scrape/agentCatalog.js";
import type { DiscoveryDocument } from "../../src/server/adapters/scrape/ScrapeProvider.js";

const NOW = "2026-09-07T09:00:00.000Z";
const LATER = "2026-10-07T09:00:00.000Z";

/** The catalog this service writes for alpina.travel, as the site would serve it. */
const ALPINA_CATALOG = JSON.stringify({
  specVersion: "1.0",
  host: { displayName: "Alpina", identifier: "alpina.travel" },
  entries: [
    {
      identifier: "urn:air:alpina.travel:terms-of-action",
      displayName: "alpina.travel Terms of Action",
      type: "application/ai-skill+md",
      url: "https://alpina.travel/.well-known/agent-skills/terms-of-action.md",
      description: "What alpina.travel is, who runs each of its actions, and how to call the interfaces it publishes.",
      capabilities: ["site.search", "availability.check"],
      representativeQueries: ["Search the site on alpina.travel"],
    },
    { identifier: "urn:air:alpina.travel:site:search", displayName: "Search the site", type: "application/ld+json", url: "https://alpina.travel/.well-known/actions/site-search.jsonld", capabilities: ["site.search"] },
    { identifier: "urn:air:elsewhere.example:booking:reserve", displayName: "Reserve elsewhere", type: "application/ld+json", url: "https://elsewhere.example/reserve.jsonld" },
  ],
});

function catalogDocument(body: string, overrides: Partial<DiscoveryDocument> = {}): DiscoveryDocument {
  return {
    kind: "ai-catalog",
    url: "https://alpina.travel/.well-known/ai-catalog.json",
    status: "valid",
    found: true,
    declaredNames: [],
    entries: parseCatalogEntries(body),
    ...overrides,
  };
}

describe("which sites publish through us", () => {
  it("keeps a site whose own catalog carries its Terms of Action, and only the entries that point back at it", () => {
    const site = publishedSiteIn([catalogDocument(ALPINA_CATALOG)], "https://www.alpina.travel/", "report-1", NOW, LATER);
    expect(site).toMatchObject({ host: "alpina.travel", catalogUrl: "https://alpina.travel/.well-known/ai-catalog.json", reportId: "report-1", seenAt: NOW });
    expect(site?.entries.map((entry) => entry.identifier)).toEqual(["urn:air:alpina.travel:terms-of-action", "urn:air:alpina.travel:site:search"]);
    // The descriptive terms travel with the entry, so the feed can say what a registry indexes.
    expect(site?.entries[0]).toMatchObject({ displayName: "alpina.travel Terms of Action", capabilities: ["site.search", "availability.check"] });
  });

  it("reads Google's spelling of the identifier too", () => {
    const google = ALPINA_CATALOG.replaceAll("urn:air:", "urn:ai:");
    expect(publishedSiteIn([catalogDocument(google)], "https://alpina.travel/", "r", NOW, LATER)?.host).toBe("alpina.travel");
  });

  it("forgets a site whose catalog says nothing of ours, is missing, or lives on another domain", () => {
    const foreign = JSON.stringify({ entries: [{ identifier: "urn:air:alpina.travel:booking:mcp", type: "application/mcp-server-card+json", url: "https://alpina.travel/.well-known/mcp/server-card.json" }] });
    expect(publishedSiteIn([catalogDocument(foreign)], "https://alpina.travel/", "r", NOW, LATER)).toBeNull();
    expect(publishedSiteIn([catalogDocument(ALPINA_CATALOG, { found: false, status: "missing", entries: [] })], "https://alpina.travel/", "r", NOW, LATER)).toBeNull();
    // A catalog for alpina served from someone else's domain is someone else's claim.
    expect(publishedSiteIn([catalogDocument(ALPINA_CATALOG, { url: "https://audit.example/api/reports/x/publish/ai-catalog.json" })], "https://alpina.travel/", "r", NOW, LATER)).toBeNull();
    // Terms of Action naming another host are not this site's.
    const other = ALPINA_CATALOG.replaceAll("urn:air:alpina.travel:terms-of-action", "urn:air:other.example:terms-of-action");
    expect(publishedSiteIn([catalogDocument(other)], "https://alpina.travel/", "r", NOW, LATER)).toBeNull();
    expect(publishedSiteIn([], "https://alpina.travel/", "r", NOW, LATER)).toBeNull();
  });
});

describe("the entry source", () => {
  const alpina: PublishedSite = publishedSiteIn([catalogDocument(ALPINA_CATALOG)], "https://alpina.travel/", "report-1", NOW, LATER)!;

  it("lists every published site's entries, valid against the spec, pointing at the site's own domain", () => {
    const shop: PublishedSite = {
      host: "shop.example",
      catalogUrl: "https://shop.example/.well-known/ai-catalog.json",
      reportId: "report-2",
      seenAt: "2026-09-06T09:00:00.000Z",
      expiresAt: LATER,
      entries: parseCatalogEntries(
        JSON.stringify({
          entries: [
            // Google's spelling, and no display name: made valid where the spec is stricter than the reader.
            { identifier: "urn:ai:shop.example:terms-of-action", type: "application/ai-skill+md", url: "https://shop.example/.well-known/agent-skills/terms-of-action.md" },
            // Nothing to follow: dropped rather than published as a dead end.
            { identifier: "urn:air:shop.example:site:search", type: "application/ld+json" },
          ],
        }),
      ),
    };
    const feed = buildFeed([alpina, shop], { base: "https://audit.example", now: () => new Date(NOW) });
    const manifest = ardManifestSchema.parse(feed);
    expect(feed.source).toMatchObject({ displayName: "WordLift AI Audit", url: "https://audit.example/feed/ai-catalog.json", publishers: 2, generatedAt: NOW });
    expect(manifest.entries.map((entry) => entry.identifier)).toEqual([
      "urn:air:alpina.travel:terms-of-action",
      "urn:air:alpina.travel:site:search",
      "urn:air:shop.example:terms-of-action",
    ]);
    expect(manifest.entries[2]).toMatchObject({ displayName: "shop.example Terms of Action", url: "https://shop.example/.well-known/agent-skills/terms-of-action.md" });
    for (const entry of manifest.entries) {
      expect(new URL(entry.url!).hostname).toBe((entry.metadata as { publisher: string }).publisher);
      expect(entry.metadata).toMatchObject({ seenBy: "WordLift AI Audit" });
    }
  });

  it("is an empty, valid manifest when nobody has published yet", () => {
    const feed = buildFeed([], { base: "https://audit.example" });
    expect(ardManifestSchema.parse(feed).entries).toEqual([]);
    expect(feed.source).toMatchObject({ publishers: 0 });
  });
});

describe("our own catalog", () => {
  it("answers the questions the audit asks: one entry, the MCP server, and the card it points at", () => {
    const catalog = ardManifestSchema.parse(ownCatalog("https://audit.example"));
    expect(catalog).toMatchObject({ host: { identifier: "audit.example" } });
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]).toMatchObject({
      identifier: "urn:air:audit.example:audit:mcp",
      type: "application/mcp-server-card+json",
      url: "https://audit.example/.well-known/mcp/server-card.json",
      capabilities: expect.arrayContaining(["audit-website"]),
      metadata: { entrySource: "https://audit.example/feed/ai-catalog.json", documentation: "https://audit.example/llms.txt" },
    });
    expect(ownServerCard("https://audit.example").transports).toEqual([{ type: "streamable-http", endpoint: "https://audit.example/mcp" }]);
  });
});

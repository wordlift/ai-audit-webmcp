import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { ardManifestSchema } from "../../src/domain/publish/ardSchema.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryPublishedSiteStore } from "../../src/server/adapters/published/MemoryPublishedSiteStore.js";
import { parseCatalogEntries, serverCardEndpoints } from "../../src/server/adapters/scrape/agentCatalog.js";
import type { ScrapeProvider, SiteSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-09-07T09:00:00.000Z");

const OUR_CATALOG = JSON.stringify({
  entries: [
    { identifier: "urn:air:alpina.travel:terms-of-action", displayName: "alpina.travel Terms of Action", type: "application/ai-skill+md", url: "https://alpina.travel/.well-known/agent-skills/terms-of-action.md", capabilities: ["site.search"] },
  ],
});

/** A site as the collector reads it, with or without our catalog at its well-known path. */
function snapshotOf(host: string, catalog: string | null): SiteSnapshot {
  const base = `https://${host}/`;
  return {
    requestedUrl: base,
    canonicalUrl: base,
    title: host,
    description: "",
    pages: [
      { url: base, title: host, description: "", role: "entry", text: Array.from({ length: 80 }, (_, index) => `word${index} stays lodging`).join(" "), headings: ["Stays"], linkPaths: ["/stays"], linkLabels: ["stays"], forms: [], jsonLdTypes: ["LodgingBusiness"], entities: [], pageTools: [], truncated: false },
    ],
    text: Array.from({ length: 80 }, (_, index) => `word${index} stays lodging`).join(" "),
    headings: ["Stays"],
    linkPaths: ["/stays"],
    linkLabels: ["stays"],
    forms: [],
    jsonLdTypes: ["LodgingBusiness"],
    discovery: catalog
      ? [{ kind: "ai-catalog", url: `${base}.well-known/ai-catalog.json`, status: "valid", found: true, declaredNames: [], entries: parseCatalogEntries(catalog) }]
      : [{ kind: "ai-catalog", url: `${base}.well-known/ai-catalog.json`, status: "missing", found: false, declaredNames: [] }],
    pageTools: [],
    mcpEndpoints: [],
    softNotFound: false,
    truncated: false,
  };
}

function liveHarness(scrape: ScrapeProvider) {
  const published = new MemoryPublishedSiteStore(() => fixedNow);
  const orchestrator = new AuditOrchestrator(new MemoryReportStore(900_000, () => fixedNow), loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
    mode: "live",
    providers: { scrape },
    published,
  });
  return { published, orchestrator, app: createApp({ orchestrator, published, rateLimits: { enabled: false } }) };
}

const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

describe("the feed follows what the audits see", () => {
  it("lists a site once its own catalog carries our Terms of Action, and forgets it when it stops", async () => {
    let catalog: string | null = OUR_CATALOG;
    const { published, orchestrator, app } = liveHarness({ name: "stub", collect: async (target) => snapshotOf(new URL(target).hostname, catalog) });

    await orchestrator.create({ requestId: randomUUID(), url: "https://alpina.travel/" });
    await settled();
    expect((await published.list()).map((site) => site.host)).toEqual(["alpina.travel"]);

    const feed = await request(app).get("/feed/ai-catalog.json").set("host", "audit.example").expect(200);
    expect(feed.headers["content-type"]).toContain("application/json");
    const manifest = ardManifestSchema.parse(feed.body);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({ identifier: "urn:air:alpina.travel:terms-of-action", url: "https://alpina.travel/.well-known/agent-skills/terms-of-action.md", metadata: { publisher: "alpina.travel" } });
    expect(feed.body.source).toMatchObject({ publishers: 1, url: "http://audit.example/feed/ai-catalog.json" });

    // The next read finds no catalog: the site leaves the feed, and nothing points at a document that is gone.
    catalog = null;
    await orchestrator.create({ requestId: randomUUID(), url: "https://alpina.travel/", fresh: true });
    await settled();
    expect(await published.list()).toEqual([]);
    expect((await request(app).get("/feed/ai-catalog.json").expect(200)).body.entries).toEqual([]);
  });

  it("never lists a site that publishes nothing of ours", async () => {
    const someoneElses = JSON.stringify({ entries: [{ identifier: "urn:air:shop.example:store:mcp", type: "application/mcp-server-card+json", url: "https://shop.example/.well-known/mcp/server-card.json" }] });
    const { published, orchestrator } = liveHarness({ name: "stub", collect: async (target) => snapshotOf(new URL(target).hostname, someoneElses) });
    await orchestrator.create({ requestId: randomUUID(), url: "https://shop.example/" });
    await settled();
    expect(await published.list()).toEqual([]);
  });
});

describe("this service's own agent surface", () => {
  it("serves its catalog and the server card the catalog points at, which the collector can read", async () => {
    const app = createApp({ rateLimits: { enabled: false } });
    // Behind Cloud Run the proxy says https; supertest speaks plain http to the app.
    const host = "http://audit.example";
    const catalog = await request(app).get("/.well-known/ai-catalog.json").set("host", "audit.example").expect(200);
    const manifest = ardManifestSchema.parse(catalog.body);
    expect(manifest.entries[0]).toMatchObject({ identifier: "urn:air:audit.example:audit:mcp", url: `${host}/.well-known/mcp/server-card.json` });

    const card = await request(app).get("/.well-known/mcp/server-card.json").set("host", "audit.example").expect(200);
    expect(serverCardEndpoints(JSON.stringify(card.body))).toEqual([`${host}/mcp`]);
  });

  it("is indexable by default, and on a preview tells robots to stay out and marks every response noindex", async () => {
    const production = createApp({ rateLimits: { enabled: false } });
    const robots = await request(production).get("/robots.txt").expect(200);
    expect(robots.text).toContain("Allow: /");
    expect(robots.headers["x-robots-tag"]).toBeUndefined();

    const preview = createApp({ rateLimits: { enabled: false }, indexable: false });
    const previewRobots = await request(preview).get("/robots.txt").expect(200);
    expect(previewRobots.text).toContain("Disallow: /");
    expect(previewRobots.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect((await request(preview).get("/api/health").expect(200)).headers["x-robots-tag"]).toBe("noindex, nofollow");
  });
});

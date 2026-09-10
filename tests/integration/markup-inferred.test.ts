import { randomUUID } from "node:crypto";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import type { MarkupOutcome, MarkupPageInput, MarkupProvider } from "../../src/server/adapters/markup/MarkupProvider.js";
import type { ScrapeProvider, SiteSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator, type OrchestratorOptions } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-09-07T05:00:00.000Z");

/** Two pages: the entry declares one entity, the booking page declares nothing at all. */
function snapshot(): SiteSnapshot {
  return {
    requestedUrl: "https://alpina.travel/",
    canonicalUrl: "https://alpina.travel/",
    title: "Lungau Holidays & Family Apartment",
    description: "Alpine holiday apartments in Lungau, Austria.",
    pages: [
      {
        url: "https://alpina.travel/",
        title: "Lungau Holidays & Family Apartment",
        description: "Alpine holiday apartments in Lungau, Austria.",
        role: "entry",
        text: "alpine lungau apartment holiday samspitze family stay book your stay online",
        headings: ["Samspitze 4", "Book your stay"],
        linkPaths: ["/booking", "/rooms/samspitze-4"],
        linkLabels: ["book now"],
        forms: [],
        jsonLdTypes: ["LodgingBusiness"],
        entities: [
          { id: "https://alpina.travel/#property", types: ["LodgingBusiness"], name: "Samspitze 4", alternateNames: [], sourceUrl: "https://alpina.travel/", sameAs: [], offers: [] },
        ],
        pageTools: [],
        truncated: false,
      },
      {
        url: "https://alpina.travel/booking",
        title: "Check availability",
        description: "",
        role: "offer",
        text: "choose dates and guests for your stay in the lungau valley",
        headings: ["Choose dates"],
        linkPaths: ["/booking"],
        linkLabels: ["book now"],
        forms: [],
        jsonLdTypes: [],
        entities: [],
        pageTools: [],
        truncated: false,
      },
    ],
    text: "alpine lungau apartment holiday",
    headings: ["Samspitze 4"],
    linkPaths: ["/booking"],
    linkLabels: ["book now"],
    forms: [],
    jsonLdTypes: ["LodgingBusiness"],
    discovery: [],
    pageTools: [],
    mcpEndpoints: [],
    softNotFound: false,
    truncated: false,
  };
}

const scraper: ScrapeProvider = { name: "stub", collect: async () => snapshot() };

/** Answers with the same two entities for any page: one namesake of the declared entity, one new. */
function fakeMarkup(options: { fail?: boolean; withOffer?: boolean } = {}) {
  const asked: MarkupPageInput[] = [];
  const provider: MarkupProvider = {
    name: "fake",
    model: "fake-1",
    async generate(page) {
      asked.push(page);
      if (options.fail) throw new Error("model down");
      const outcome: MarkupOutcome = {
        model: "fake-1",
        issues: [],
        usage: { inputTokens: 100, outputTokens: 50, estimatedUsd: 0.0001 },
        entities: [
          // A namesake of the declared LodgingBusiness under another label, with a link and a description of its own.
          { id: `${page.url}#inferred-organization-samspitze-4`, types: ["Organization"], name: "Samspitze 4", alternateNames: ["Samspitze IV"], description: "A guess.", sourceUrl: page.url, sameAs: ["https://www.wikidata.org/wiki/Q1"], offers: [], origin: "inferred" },
          {
            id: "https://alpina.travel/#inferred-place-lungau-valley",
            types: ["Place"],
            name: "Lungau Valley",
            alternateNames: [],
            sourceUrl: page.url,
            sameAs: [],
            offers: options.withOffer ? [{ name: "Valley pass", price: "49", priceCurrency: "EUR" }] : [],
            origin: "inferred",
          },
        ],
      };
      return outcome;
    },
    totals: () => ({ pages: asked.length, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 }),
  };
  return { provider, asked };
}

function orchestrator(markup?: MarkupProvider, extra: Partial<OrchestratorOptions> = {}) {
  return new AuditOrchestrator(new MemoryReportStore(900_000, () => fixedNow), loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
    mode: "live",
    providers: { scrape: scraper, ...(markup ? { markup } : {}) },
    reuseWindowMs: 0,
    ...extra,
  });
}

const audit = (target: AuditOrchestrator, depth?: "basic" | "deep") =>
  target.create({ requestId: randomUUID(), url: "https://alpina.travel/", ...(depth ? { depth } : {}) });

describe("the markup a page should have", () => {
  it("tells the extractor what kind of site it is reading, and reads the evidence before anything is inferred", async () => {
    const { provider, asked } = fakeMarkup({ withOffer: true });
    const report = await audit(orchestrator(provider));
    // The site type the extractor was told is the one the report ends with.
    expect(asked.length).toBeGreaterThan(0);
    for (const page of asked) expect(page.siteType).toBe(report.classification?.primaryArchetype);
    // An offer a model read into the text is never evidence that people can see prices here.
    const claims = (report.capabilities ?? []).flatMap((capability) => capability.evidence.map((item) => item.claim));
    expect(claims.some((claim) => claim.includes("Lungau Valley"))).toBe(false);
    expect(report.contextGraph?.entities.find((entity) => entity.name === "Lungau Valley")?.offers).toEqual([{ name: "Valley pass", price: "49", priceCurrency: "EUR" }]);
  });

  it("adds inferred entities beside the declared ones, labelled, and merges a namesake into the declared one", async () => {
    const { provider } = fakeMarkup();
    const report = await audit(orchestrator(provider));

    const entities = report.contextGraph?.entities ?? [];
    const samspitze = entities.find((entity) => entity.name === "Samspitze 4");
    const valley = entities.find((entity) => entity.name === "Lungau Valley");
    expect(samspitze?.origin).toBeUndefined();
    expect(samspitze?.confidence).toBe(0.95);
    // The declared entity keeps its own facts: the inferred namesake brought no type, link, alias or description into it.
    expect(samspitze?.types).toEqual(["LodgingBusiness"]);
    expect(samspitze?.sameAs).toEqual([]);
    expect(samspitze?.alternateNames).toEqual([]);
    expect(samspitze?.description).toBeUndefined();
    expect(valley?.origin).toBe("inferred");
    expect(valley?.confidence).toBe(0.6);
    expect(report.markup).toEqual({ provider: "fake", model: "fake-1", pagesGenerated: 1, pagesFailed: 0, inferredEntities: 1, declaredEntities: entities.length - 1 });
  });

  it("sends only the pages that declare nothing on a basic scan, and every page on a deep one", async () => {
    const basic = fakeMarkup();
    await audit(orchestrator(basic.provider), "basic");
    expect(basic.asked.map((page) => page.url)).toEqual(["https://alpina.travel/booking"]);

    const deep = fakeMarkup();
    await audit(orchestrator(deep.provider), "deep");
    expect(deep.asked.map((page) => page.url)).toEqual(["https://alpina.travel/", "https://alpina.travel/booking"]);

    const none = fakeMarkup();
    await audit(orchestrator(none.provider, { markupOnBasic: "none" }), "basic");
    expect(none.asked).toEqual([]);
  });

  it("never moves readiness", async () => {
    const without = await audit(orchestrator());
    const withMarkup = await audit(orchestrator(fakeMarkup().provider));
    expect(withMarkup.score).toEqual(without.score);
    expect(withMarkup.capabilities?.map((item) => [item.actionId, item.state])).toEqual(
      without.capabilities?.map((item) => [item.actionId, item.state]),
    );
    // An inferred entity is a candidate: it is never evidence.
    const evidence = (withMarkup.capabilities ?? []).flatMap((item) => item.evidence);
    expect(evidence.some((item) => item.claim.includes("Lungau Valley"))).toBe(false);
  });

  it("loses the page, not the audit, when the model fails", async () => {
    const report = await audit(orchestrator(fakeMarkup({ fail: true }).provider));
    expect(report.status).not.toBe("failed");
    expect(report.markup).toMatchObject({ pagesGenerated: 0, pagesFailed: 1, inferredEntities: 0 });
    expect(report.contextGraph?.entities.some((entity) => entity.origin === "inferred")).toBe(false);
  });
});

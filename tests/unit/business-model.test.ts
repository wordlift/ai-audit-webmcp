import { describe, expect, it } from "vitest";
import { businessModel, businessModelText, entityDetail, entityDetailText, findEntity } from "../../src/shared/format/businessModel.js";
import type { CapabilityResult, DomainEntity, ReportRecord } from "../../src/shared/types/index.js";

const entity = (id: string, name: string, type: string, extra: Partial<DomainEntity> = {}): DomainEntity => ({
  id, types: [type], name, alternateNames: [], sourceUrls: ["https://alpina.travel/"], sameAs: [], offers: [], confidence: 0.9, ...extra,
});
const capability = (actionId: string, label: string, state: CapabilityResult["state"], appliesTo: string[]): CapabilityResult =>
  ({
    actionId, label, state, stage: "act", intent: "transact", importance: 3, expected: true, description: label, humanSupport: true, agentSupport: state === "agent-ready",
    expectationSource: ["archetype"], appliesTo: appliesTo.map((id) => ({ id, name: id, types: ["Thing"] })),
    evidence: [{ id: `${actionId}-e1`, audience: "human", kind: "form", claim: `People can ${label.toLowerCase()}`, verification: "observed", confidence: 0.8, sourceUrl: "https://alpina.travel/booking", collectedAt: "2026-09-10T00:00:00.000Z" }],
  }) as unknown as CapabilityResult;

const report = {
  id: "r1",
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://www.alpina.travel/",
  classification: { primaryArchetype: "travel-hospitality" },
  publishedWith: { name: "WordLift", evidence: "Entity ids on data.wordlift.io", sourceUrl: "https://alpina.travel/" },
  contextGraph: {
    pages: [
      { url: "https://alpina.travel/", title: "Alpina", role: "entry", headings: [], entityIds: ["org", "apt"] },
      { url: "https://alpina.travel/lungau/", title: "Lungau", role: "detail", headings: [], entityIds: ["lungau", "apt"] },
    ],
    entities: [
      entity("apt", "Samspitze 4", "Apartment", { origin: "inferred", alternateNames: ["Samspitze IV"] }),
      entity("org", "AlpiNest Feriendorf Lungau", "LodgingBusiness", { humanPriority: "primary" }),
      entity("lungau", "Lungau", "Place", { origin: "inferred", sameAs: ["https://www.wikidata.org/wiki/Q268090"] }),
      entity("andrea", "Andrea Volpini", "Person"),
      entity("site", "Alpina.travel", "WebSite"),
      entity("old", "Old brochure", "Product", { humanPriority: "demoted" }),
    ],
    lexicalEntries: [
      { id: "t1", label: "Alpine stays", aliases: [], kind: "topic", entityIds: ["apt"], sourceUrls: [], confidence: 0.7 },
      { id: "t2", label: "Samspitze 4", aliases: [], kind: "entity-name", entityIds: ["apt"], sourceUrls: [], confidence: 0.9 },
    ],
    interfaces: [],
    bindings: [],
  },
  capabilities: [
    capability("availability.check", "Check availability", "human-only", ["apt"]),
    capability("search.site", "Search the site", "agent-ready", ["site"]),
    capability("booking.reserve", "Book a stay", "missing", ["apt"]),
  ],
} as unknown as ReportRecord;

describe("the business as the audit modelled it", () => {
  it("leads with the business, groups the rest by role, and marks every entity's provenance", () => {
    const model = businessModel(report, "https://audit.example/reports/r1");
    expect(model.site).toEqual({ host: "alpina.travel", archetype: "travel-hospitality", runsOn: "WordLift" });
    expect(model.pagesRead).toBe(2);
    expect(model.business?.name).toBe("AlpiNest Feriendorf Lungau");
    expect(model.business?.provenance).toBe("human-confirmed");
    expect(model.entities.map((item) => [item.name, item.role, item.provenance])).toEqual([
      ["AlpiNest Feriendorf Lungau", "business", "human-confirmed"],
      ["Samspitze 4", "offering", "inferred"],
      ["Lungau", "place", "inferred"],
      ["Andrea Volpini", "person", "declared"],
      ["Alpina.travel", "content", "declared"],
    ]);
    // A demoted entity is out of the model; the counts say what is declared and what is only read.
    expect(model.counts).toEqual({ entities: 5, declared: 2, inferred: 2, humanConfirmed: 1, capabilities: 3, agentReady: 1 });
    const apartment = model.entities.find((item) => item.id === "apt")!;
    expect(apartment.answersFor.map((action) => [action.label, action.agentReady])).toEqual([["Check availability", false], ["Book a stay", false]]);
    expect(apartment.terms).toEqual(["Alpine stays"]);
  });

  it("says it in prose an agent reads once, boundaries included", () => {
    const text = businessModelText(businessModel(report, "https://audit.example/reports/r1"));
    expect(text).toContain("Business model of alpina.travel, read from 2 pages (travel-hospitality). The site runs on WordLift.");
    expect(text).toContain("5 entities: 2 declared in the site's markup, 2 inferred from its text, 1 confirmed by the owner. 3 expected actions, 1 agent-ready.");
    expect(text).toContain("- Samspitze 4 (Apartment, inferred); answers for Check availability [fix this], Book a stay [talk to us]; the site's words: \"Alpine stays\"");
    expect(text).toContain("- Lungau (Place, inferred, same as https://www.wikidata.org/wiki/Q268090)");
    expect(text).toContain("Actions an agent can perform today: Search the site.");
    expect(text).toContain("Actions people can do here that agents cannot yet: Check availability.");
    expect(text).toContain("never move readiness");
  });

  it("finds one entity by id, by name, by another name or by part of the name, and explains it with its evidence", () => {
    expect(findEntity(report, { entityId: "apt" })?.name).toBe("Samspitze 4");
    expect(findEntity(report, { name: "samspitze 4" })?.id).toBe("apt");
    expect(findEntity(report, { name: "Samspitze IV" })?.id).toBe("apt");
    expect(findEntity(report, { name: "feriendorf" })?.id).toBe("org");
    expect(findEntity(report, { name: "nobody" })).toBeNull();
    const detail = entityDetail(findEntity(report, { entityId: "apt" })!, report, "https://audit.example/reports/r1");
    expect(detail.pages.map((page) => page.url)).toEqual(["https://alpina.travel/", "https://alpina.travel/lungau/"]);
    expect(detail.evidence.map((item) => item.actionId)).toEqual(["availability.check", "booking.reserve"]);
    const text = entityDetailText(detail);
    expect(text).toContain("Samspitze 4 (Apartment), inferred, confidence 90%.");
    expect(text).toContain("Also called: Samspitze IV.");
    expect(text).toContain("- availability.check: People can check availability (observed, https://alpina.travel/booking)");
  });
});

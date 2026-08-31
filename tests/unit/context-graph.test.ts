import { compileContextGraph, appliesToForAction } from "../../src/domain/context/compileContextGraph.js";
import type { CapabilityResult } from "../../src/shared/types/index.js";
import type { SitePageSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";

const capability: CapabilityResult = {
  actionId: "availability.check",
  label: "Check availability",
  description: "Check dates and inventory.",
  stage: "act",
  intent: "informational",
  importance: 3,
  expected: true,
  expectationSource: ["archetype:travel-hospitality"],
  state: "unverified",
  humanSupport: true,
  agentSupport: false,
  appliesTo: [],
  evidence: [{
    id: "availability-form",
    actionId: "availability.check",
    audience: "human",
    kind: "form",
    sourceUrl: "https://alpina.travel/booking",
    claim: "People can check dates through a booking form",
    confidence: 1,
    verification: "observed",
    collectedAt: "2026-08-30T10:00:00.000Z",
  }],
};

const pages: SitePageSnapshot[] = [
  page("https://alpina.travel/", "entry", [entity("https://alpina.travel/#org", "Organization", "Alpina.travel")]),
  page("https://alpina.travel/property", "detail", [entity("https://alpina.travel/#stay", "LodgingBusiness", "AlpiNest")]),
  page("https://alpina.travel/booking", "offer", [entity("https://alpina.travel/#stay", "LodgingBusiness", "AlpiNest")]),
  page("https://alpina.travel/faq", "policy", []),
];

describe("context graph", () => {
  it("connects representative pages, domain entities, lexical meaning, actions and interfaces", () => {
    const context = compileContextGraph(
      pages,
      [{ name: "/Travel/Hotels & Accommodations", confidence: 0.97 }],
      [capability],
      "https://alpina.travel/",
    );

    expect(context.pages.map((item) => item.role)).toEqual(["entry", "detail", "offer", "policy"]);
    expect(context.entities.map((item) => item.name)).toEqual(["alpina.travel", "Alpina.travel", "AlpiNest"]);
    expect(context.lexicalEntries.some((item) => item.label === "Hotels & Accommodations")).toBe(true);
    expect(context.bindings).toContainEqual(expect.objectContaining({
      entityId: "https://alpina.travel/#stay",
      actionId: "availability.check",
      role: "object",
      state: "unverified",
    }));
    expect(context.interfaces).toContainEqual(expect.objectContaining({
      actionId: "availability.check",
      protocol: "human-form",
      entityIds: ["https://alpina.travel/#website", "https://alpina.travel/#stay"],
    }));
    expect(appliesToForAction(context, "availability.check")).toEqual([
      { id: "https://alpina.travel/#stay", name: "AlpiNest", types: ["LodgingBusiness"] },
    ]);
  });

  it.each([
    ["commerce-retail", "/Shopping/Apparel", "Product", "Trail Jacket", "offer.lookup"],
    ["publisher-content", "/News/Business News", "Article", "Agentic Web Briefing", "source.verify"],
    ["finance-insurance", "/Finance/Insurance", "FinancialService", "Travel Cover", "quote.request"],
    ["saas", "/Computers & Electronics/Software", "SoftwareApplication", "Context Cloud", "trial.start"],
    ["other", "/People & Society", "Organization", "Example Foundation", "inquiry.submit"],
  ])(
    "uses %s classification and entity types to bind the expected action layer",
    (_archetype, category, type, name, actionId) => {
      const url = `https://${String(_archetype)}.example/`;
      const target = entity(`${url}#entity`, String(type), String(name), url);
      const action = { ...capability, actionId: String(actionId), label: String(actionId), evidence: [] };
      const context = compileContextGraph(
        [page(url, "entry", [target])],
        [{ name: String(category), confidence: 0.92 }],
        [action],
        url,
      );

      expect(context.entities).toContainEqual(expect.objectContaining({ name, types: [type] }));
      expect(context.bindings).toContainEqual(expect.objectContaining({
        entityId: `${url}#entity`,
        actionId,
      }));
      expect(appliesToForAction(context, String(actionId))).toEqual([
        { id: `${url}#entity`, name, types: [type] },
      ]);
    },
  );

  it("keeps an unstructured site useful by binding classified actions to an inferred website provider", () => {
    const url = "https://unstructured.example/";
    const context = compileContextGraph(
      [page(url, "entry", [])],
      [{ name: "/Business & Industrial", confidence: 0.61 }],
      [{ ...capability, actionId: "inquiry.submit", label: "Submit inquiry", evidence: [] }],
      url,
    );

    expect(context.entities).toContainEqual(expect.objectContaining({
      id: "https://unstructured.example/#website",
      types: ["WebSite"],
    }));
    expect(context.bindings).toContainEqual(expect.objectContaining({
      entityId: "https://unstructured.example/#website",
      actionId: "inquiry.submit",
      role: "provider",
    }));
  });

  it("does not attach one product page's interface to a different product", () => {
    const firstUrl = "https://shop.example/products/first";
    const secondUrl = "https://shop.example/products/second";
    const detailCapability: CapabilityResult = {
      ...capability,
      actionId: "detail.retrieve",
      label: "Retrieve details",
      evidence: [{
        ...capability.evidence[0],
        id: "first-product-data",
        actionId: "detail.retrieve",
        kind: "structured-data",
        sourceUrl: firstUrl,
        claim: "Product structured data is declared",
        verification: "declared",
      }],
    };
    const context = compileContextGraph(
      [
        page("https://shop.example/", "entry", []),
        page(firstUrl, "detail", [entity(`${firstUrl}#product`, "Product", "First Product", firstUrl)]),
        page(secondUrl, "detail", [entity(`${secondUrl}#product`, "Product", "Second Product", secondUrl)]),
      ],
      [{ name: "/Shopping", confidence: 0.9 }],
      [detailCapability],
      "https://shop.example/",
    );

    expect(context.interfaces).toContainEqual(expect.objectContaining({
      evidenceId: "first-product-data",
      entityIds: ["https://shop.example/#website", `${firstUrl}#product`],
    }));
    expect(context.interfaces[0]?.entityIds).not.toContain(`${secondUrl}#product`);
  });
});

function page(url: string, role: SitePageSnapshot["role"], entities: SitePageSnapshot["entities"]): SitePageSnapshot {
  return {
    url,
    title: new URL(url).hostname,
    description: "",
    role,
    text: "Alpine stays and availability",
    headings: [role],
    linkPaths: [],
    linkLabels: [],
    forms: [],
    jsonLdTypes: entities.flatMap((item) => item.types),
    entities,
    pageTools: [],
    truncated: false,
  };
}

function entity(id: string, type: string, name: string, sourceUrl?: string): SitePageSnapshot["entities"][number] {
  return {
    id,
    types: [type],
    name,
    alternateNames: [],
    sourceUrl: sourceUrl ?? (id.includes("#stay") ? "https://alpina.travel/booking" : "https://alpina.travel/"),
    sameAs: [],
    offers: [],
  };
}

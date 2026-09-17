import { looksLikeCategory, modelView } from "../../src/shared/format/modelView.js";
import type { ReportRecord } from "../../src/shared/types/index.js";

const entity = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({ id, name, types: [type], alternateNames: [], sourceUrls: ["https://x/"], sameAs: [], offers: [], confidence: 0.8, ...extra });
const report = (host: string, entities: unknown[], relations: unknown[] = []) =>
  ({ id: "r", requestedUrl: `https://${host}/`, contextGraph: { pages: [{ url: "https://x/" }], entities, relations, lexicalEntries: [], interfaces: [], bindings: [] }, capabilities: [] }) as unknown as ReportRecord;

describe("the model a stranger meets", () => {
  it("folds a product's variants into one, and counts products, not sizes", () => {
    const view = modelView(report("allbirds.com", [
      entity("brand", "Allbirds", "Brand"),
      entity("p1", "Men's Runner NZ Slip On", "Product"),
      entity("p2", "Men's Runner NZ Slip On - Mushroom (Mushroom Sole) - Size 10", "Product"),
      entity("p3", "Men's Runner NZ Slip On - Mushroom (Mushroom Sole) - Size 10.5", "Product"),
      entity("p4", "Tree Dasher 2", "Product"),
      entity("g", "Google", "SoftwareApplication", { origin: "inferred" }),
    ]));
    expect(view.preview.map((item) => `${item.name}${item.variants ? ` +${item.variants}` : ""}`)).toEqual(["Allbirds", "Men's Runner NZ Slip On +2", "Tree Dasher 2"]);
    expect(view.counts.offerings).toEqual([{ label: "product", count: 2 }]);
    expect(view.sentence).toBe("Allbirds is a brand offering Men's Runner NZ Slip On and Tree Dasher 2.");
  });

  it("does not take the website's own name for a second business, nor a headline for an event", () => {
    const view = modelView(report("alpina.travel", [
      entity("org", "AlpiNest Feriendorf Lungau", "LodgingBusiness"),
      entity("site", "Alpina.travel", "Organization"),
      entity("event", "Mountain days", "Event", { origin: "inferred" }),
      entity("apt", "Samspitze 4", "Apartment", { origin: "inferred" }),
      entity("town", "Mariapfarr", "Place", { origin: "inferred" }),
      entity("region", "Lungau", "Place", { origin: "inferred" }),
    ], [
      { from: "apt", to: "town", kind: "located-in", provenance: "inferred", sourceUrl: "https://x/", evidence: "Samspitze 4 in sunny Mariapfarr." },
      { from: "town", to: "region", kind: "located-in", provenance: "inferred", sourceUrl: "https://x/", evidence: "Mariapfarr, Lungau." },
    ]));
    expect(view.preview.map((item) => item.name)).toEqual(["AlpiNest Feriendorf Lungau", "Samspitze 4", "Mariapfarr", "Lungau"]);
    expect(view.counts.businesses).toBe(1);
    expect(view.sentence).toBe("AlpiNest Feriendorf Lungau is a lodging business offering Samspitze 4, in Mariapfarr, Lungau.");
  });

  it("says where from the places the site is about when nothing ties the business to one, and counts a namesake business once", () => {
    const view = modelView(report("alpina.travel", [
      entity("org", "AlpiNest Feriendorf Lungau", "LodgingBusiness"),
      entity("brand", "AlpiNest Feriendorf Lungau", "Brand"),
      entity("sale", "Final Sale", "Offer", { origin: "inferred" }),
      entity("apt", "Samspitze 4", "Apartment", { origin: "inferred" }),
      entity("region", "Lungau", "Place", { origin: "inferred", sourceUrls: ["https://x/", "https://x/a", "https://x/b"] }),
      entity("town", "Mariapfarr", "Place", { origin: "inferred" }),
    ], [{ from: "town", to: "region", kind: "located-in", provenance: "inferred", sourceUrl: "https://x/" }]));
    expect(view.counts.businesses).toBe(1);
    expect(view.offerings.map((item) => item.name)).toEqual(["Samspitze 4"]);
    // The place inside another reads first, however often the larger one is named.
    expect(view.places.map((item) => item.name)).toEqual(["Mariapfarr", "Lungau"]);
    expect(view.sentence).toBe("AlpiNest Feriendorf Lungau is a lodging business offering Samspitze 4. The site is about Mariapfarr, in Lungau.");
  });

  it("names what the site declares before what its text mentions, and what its headings are about before a passing name", () => {
    const graphReport = report("allbirds.com", [
      entity("brand", "Allbirds", "Brand"),
      entity("inc", "Allbirds, Inc.", "Organization"),
      entity("runner", "Men's Runner NZ Slip On", "ProductGroup"),
      entity("shoes", "Men's Shoes", "Product", { origin: "inferred" }),
      entity("dasher", "Tree Dasher 2", "Product", { origin: "inferred" }),
    ]);
    (graphReport.contextGraph!.pages as unknown[]) = [{ url: "https://x/", title: "Allbirds", headings: ["Tree Dasher 2", "Shop now"] }];
    const view = modelView(graphReport);
    expect(view.counts.businesses).toBe(1);
    // A collection the text names ("Men's Shoes") is where things are filed, not one of them.
    expect(view.offerings.map((item) => item.name)).toEqual(["Men's Runner NZ Slip On", "Tree Dasher 2"]);
    expect(view.sentence).toBe("Allbirds is a brand offering Men's Runner NZ Slip On.");
  });

  it("reads a brand only the text names, beside a declared business, as a line it sells; and prefers specific names among equals", () => {
    const shop = modelView(report("allbirds.com", [entity("brand", "Allbirds", "Brand"), entity("line", "Runner NZ", "Brand", { origin: "inferred" })]));
    expect(shop.counts.businesses).toBe(1);
    expect(shop.offerings.map((item) => item.name)).toEqual(["Runner NZ"]);
    const software = modelView(report("wordlift.io", [
      entity("org", "WordLift", "Organization", { origin: "inferred" }),
      entity("eye", "Eyewear", "Product", { origin: "inferred", confidence: 0.6 }),
      entity("dc", "Data Connect", "SoftwareApplication", { origin: "inferred", confidence: 0.6 }),
      entity("agent", "WordLift Agent", "Service", { origin: "inferred", confidence: 0.6 }),
    ]));
    expect(software.offerings.map((item) => item.name)).toEqual(["WordLift Agent", "Data Connect", "Eyewear"]);
  });

  it("tells a collection from a thing, and says what a generic organization is by the kind of site it runs", () => {
    for (const name of ["Men's Shoes", "New Arrivals", "Apparel & Accessories", "Performance & Rank Tracking", "Wildly Comfortable", "Shop Tree Runners", "Discover More"]) expect(looksLikeCategory(name)).toBe(true);
    for (const name of ["Samspitze 4", "Data Connect", "WordLift Agent", "Tree Dasher 2", "AI-Powered SEO", "Runner NZ"]) expect(looksLikeCategory(name)).toBe(false);
    const saas = { ...report("wordlift.io", [entity("org", "WordLift", "Organization", { origin: "inferred" }), entity("dc", "Data Connect", "SoftwareApplication", { origin: "inferred" })]), classification: { primaryArchetype: "saas" } } as unknown as ReportRecord;
    expect(modelView(saas).sentence).toBe("WordLift is a software company offering Data Connect.");
  });

  it("reads a product line as a product line, and a declared thing read again from the text as the declared thing", () => {
    const view = modelView(report("allbirds.com", [
      entity("brand", "Allbirds", "Brand"),
      entity("runner", "Men's Runner NZ Slip On", "ProductGroup"),
      entity("line", "Runner NZ", "Brand", { origin: "inferred" }),
      entity("again", "Runner NZ Slip On", "Product", { origin: "inferred" }),
    ]));
    expect(view.preview.map((item) => `${item.name}:${item.type}`)).toEqual(["Allbirds:Brand", "Men's Runner NZ Slip On:ProductGroup"]);
  });

  it("keeps a platform a page mentions out of what the business offers, except on the platform's own site", () => {
    const mentions = [entity("org", "WordLift", "Organization"), entity("g", "Google", "SoftwareApplication", { origin: "inferred" }), entity("dc", "Data Connect", "SoftwareApplication", { origin: "inferred" })];
    expect(modelView(report("wordlift.io", mentions)).offerings.map((item) => item.name)).toEqual(["Data Connect"]);
    expect(modelView(report("google.com", mentions)).offerings.map((item) => item.name)).toContain("Google");
  });
});

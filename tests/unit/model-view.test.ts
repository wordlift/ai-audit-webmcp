import { looksGeneric, looksLikeCategory, modelView, siteKind } from "../../src/shared/format/modelView.js";
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
    expect(view.sentence).toBe("Allbirds is a brand offering products such as Men's Runner NZ Slip On.");
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
    for (const name of ["Men's Shoes", "New Arrivals", "Apparel & Accessories", "Performance & Rank Tracking", "Wildly Comfortable", "Shop Tree Runners", "Discover More", "Make a night of it", "Where work gets done"]) expect(looksLikeCategory(name)).toBe(true);
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

  it("names three offerings at most, and says there is more without a count to parse", () => {
    const names = ["Data Connect", "WordLift Agent", "Content Generation Tool", "Visibility Solution", "Product Performance Solution"];
    const four = modelView(report("wordlift.io", [entity("org", "WordLift", "Organization"), ...names.slice(0, 4).map((name, index) => entity(`o${index}`, name, "Service"))]));
    expect(four.sentence).toMatch(/^WordLift is an organization offering services such as [^,]+, [^,]+ and [^,]+\.$/);
    const mixed = modelView(report("wordlift.io", [entity("org", "WordLift", "Organization"), entity("a", "Data Connect", "SoftwareApplication"), entity("b", "WordLift Agent", "Service"), entity("c", "Content Generation Tool", "Service"), entity("d", "Visibility Solution", "Service")]));
    expect(mixed.sentence).toMatch(/and more\.$/);
    expect(mixed.sentence).not.toMatch(/\d more/);
  });

  it("keeps a bare one-word name out of the sentence when there are specific names to say", () => {
    const view = modelView(report("wordlift.io", [entity("org", "WordLift", "Organization"), entity("a", "WordLift Agent", "Service"), entity("b", "Data Connect", "SoftwareApplication"), entity("c", "Eyewear", "Product")]));
    expect(view.sentence).toBe("WordLift is an organization offering WordLift Agent, Data Connect and more.");
    expect(view.preview.map((item) => item.name)).toContain("Eyewear");
  });

  it("says a shop offers products such as one when it set collections aside, and says where a place is", () => {
    const shop = modelView(report("allbirds.com", [entity("brand", "Allbirds", "Brand"), entity("runner", "Men's Runner NZ Slip On", "ProductGroup"), entity("shoes", "Men's Shoes", "Product", { origin: "inferred" })]));
    expect(shop.sentence).toBe("Allbirds is a brand offering products such as Men's Runner NZ Slip On.");
    const lodging = modelView(report("alpina.travel", [entity("org", "AlpiNest", "LodgingBusiness"), entity("town", "Mariapfarr", "Place", { origin: "inferred" }), entity("region", "Lungau", "Place", { origin: "inferred" })], [{ from: "town", to: "region", kind: "located-in", provenance: "inferred", sourceUrl: "https://x/" }]));
    expect(lodging.places.find((place) => place.name === "Mariapfarr")).toBeDefined();
    expect(lodging.preview.find((item) => item.name === "Mariapfarr")?.within).toBe("Lungau");
  });

  it("leads with the name the site is built around, and keeps page labels out of the sentence (as on a software site)", () => {
    const pages = ["https://basecamp.com/", "https://basecamp.com/features", "https://basecamp.com/pricing", "https://basecamp.com/guides"];
    const graphReport = {
      ...report("basecamp.com", [
        entity("co", "37signals", "Organization", { origin: "inferred" }),
        entity("bc", "Basecamp", "SoftwareApplication", { origin: "inferred", sourceUrls: pages }),
        entity("bc5", "BC5", "SoftwareApplication", { origin: "inferred" }),
        entity("cli", "CLI", "SoftwareApplication", { origin: "inferred" }),
        entity("pro", "Pro", "Product", { origin: "inferred" }),
        entity("page", "Project page", "SoftwareApplication", { origin: "inferred" }),
        entity("skills", "Skills", "SoftwareApplication", { origin: "inferred" }),
      ]),
      classification: { primaryArchetype: "saas", categories: [{ name: "/Computers & Electronics/Software/Business & Productivity Software", confidence: 1 }] },
    } as unknown as ReportRecord;
    const view = modelView(graphReport);
    expect(view.sentence).toBe("37signals is a software company offering software such as Basecamp.");
    expect(view.preview.map((item) => item.name).slice(0, 2)).toEqual(["37signals", "Basecamp"]);
    for (const name of ["Project page", "CLI", "Pro", "Skills", "Eyewear"]) expect(looksGeneric(name)).toBe(true);
    for (const name of ["Data Connect", "Men's Runner NZ Slip On", "Samspitze 4", "BC5", "WordLift Agent"]) expect(looksGeneric(name)).toBe(false);
  });

  it("says what a business is by what its pages are about, and leaves mentions of other businesses out (as on a restaurant site)", () => {
    const shack = {
      ...report("shakeshack.com", [
        entity("org", "Shake Shack", "Organization"),
        entity("glued", "Help Center\nCatering", "Restaurant", { origin: "inferred" }),
        entity("candy", "Reese's", "Restaurant", { origin: "inferred" }),
        entity("deal", "$2 Sodas", "Offer", { origin: "inferred" }),
      ]),
      classification: { primaryArchetype: "travel-hospitality", categories: [{ name: "/Food & Drink/Restaurants/Fast Food", confidence: 1 }] },
    } as unknown as ReportRecord;
    const view = modelView(shack);
    expect(view.sentence).toBe("Shake Shack is a restaurant business offering $2 Sodas.");
    expect(view.counts.businesses).toBe(1);
    expect(view.preview.map((item) => item.name)).toEqual(["Shake Shack", "$2 Sodas"]);
  });

  it("reads a chain's places as what it offers, and says which places the site is about (as on a hotel group's site)", () => {
    const hotels = {
      ...report("thehoxton.com", [
        entity("org", "The Hoxton", "Organization", { sourceUrls: ["a", "b", "c", "d"] }),
        entity("bare", "Hoxton", "Hotel", { origin: "inferred" }),
        entity("brussels", "The Hoxton, Brussels", "Hotel", { origin: "inferred" }),
        entity("hox", "Hox", "Hotel", { origin: "inferred" }),
        ...["Amsterdam", "Barcelona", "Berlin", "Paris", "Rome"].map((name) => entity(name.toLowerCase(), name, "Place", { origin: "inferred" })),
      ]),
      classification: { primaryArchetype: "travel-hospitality", categories: [{ name: "/Travel & Transportation/Hotels & Accommodations/Other", confidence: 1 }] },
    } as unknown as ReportRecord;
    const view = modelView(hotels);
    expect(view.counts.businesses).toBe(1);
    expect(view.offerings.map((item) => item.name)).toEqual(["The Hoxton, Brussels"]);
    expect(view.sentence).toBe("The Hoxton is a hotel business offering The Hoxton, Brussels. The site is about Amsterdam, Barcelona, Berlin and 2 more places.");
  });

  it("counts a priced offer as what a restaurant sells, keeps bare words off the cards, and names the kind of site by its pages", () => {
    const shack = {
      ...report("shakeshack.com", [
        entity("org", "Shake Shack", "Organization"),
        entity("sodas", "$2 Sodas", "Offer", { origin: "inferred" }),
        entity("fries", "$4 Fries", "Offer", { origin: "inferred" }),
        entity("sale", "Final Sale", "Offer", { origin: "inferred" }),
      ]),
      classification: { primaryArchetype: "travel-hospitality", categories: [{ name: "/Food & Drink/Restaurants/Fast Food", confidence: 1 }] },
    } as unknown as ReportRecord;
    expect(modelView(shack).sentence).toBe("Shake Shack is a restaurant business offering $2 Sodas and $4 Fries.");
    expect(siteKind(shack)).toBe("food & drink");
    const bombas = modelView(report("bombas.com", [entity("brand", "Bombas", "Brand"), entity("slip", "Women's Saturday Suede Slip-On", "Product"), entity("under", "Underwear", "Product", { origin: "inferred" })]));
    expect(bombas.preview.map((item) => item.name)).toEqual(["Bombas", "Women's Saturday Suede Slip-On"]);
    expect(bombas.offerings.map((item) => item.name)).toContain("Underwear");
  });

  it("keeps a platform a page mentions out of what the business offers, except on the platform's own site", () => {
    const mentions = [entity("org", "WordLift", "Organization"), entity("g", "Google", "SoftwareApplication", { origin: "inferred" }), entity("dc", "Data Connect", "SoftwareApplication", { origin: "inferred" })];
    expect(modelView(report("wordlift.io", mentions)).offerings.map((item) => item.name)).toEqual(["Data Connect"]);
    expect(modelView(report("google.com", mentions)).offerings.map((item) => item.name)).toContain("Google");
  });

  it("never lists the business among its own offerings", () => {
    const view = modelView(report("theguardian.com", [
      entity("org", "The Guardian", "NewsMediaOrganization"),
      entity("paper", "The Guardian", "Product"),
      entity("live", "Guardian Live", "Event"),
      entity("app", "Guardian Weekly", "Product"),
    ]));
    expect(view.business?.name).toBe("The Guardian");
    expect(view.offerings.map((item) => item.name)).not.toContain("The Guardian");
    expect(view.offerings.map((item) => item.name)).toContain("Guardian Weekly");
  });

  it("reads a company's legal name as the company, never as a line it sells", () => {
    const view = modelView(report("ikea.com", [
      entity("org", "IKEA", "Organization"),
      entity("legal", "Inter IKEA Systems B.V.", "Brand", { origin: "inferred" }),
      entity("spa", "IKEA Italia S.p.A.", "Organization", { origin: "inferred" }),
      entity("family", "IKEA Family", "Brand", { origin: "inferred" }),
      entity("p", "BILLY", "Product"),
    ]));
    const offered = view.offerings.map((item) => item.name);
    expect(offered).not.toContain("Inter IKEA Systems B.V.");
    expect(offered).not.toContain("IKEA Italia S.p.A.");
    expect(offered).toContain("IKEA Family");
  });

  it("counts the names of one business as one, and shows it by the name a customer uses", () => {
    const pages = (count: number) => Array.from({ length: count }, (_, index) => `https://basecamp.example/${index}`);
    const view = modelView(report("basecamp.example", [
      entity("short", "37signals", "Organization", { origin: "inferred" }),
      entity("legal", "37signals LLC.", "Organization", { origin: "inferred", sourceUrls: pages(5) }),
      entity("noise", "K-12", "Organization", { origin: "inferred" }),
      entity("app", "Basecamp", "SoftwareApplication", { origin: "inferred" }),
    ]));
    expect(view.business?.name).toBe("37signals");
  });

  it("lists the places a site is about, not its rooms, its companies or the same town twice", () => {
    const rome = "https://www.wikidata.org/wiki/Q220";
    const view = modelView(report("hotel.example", [
      entity("h", "Hotel Example", "Hotel"),
      entity("rome", "Rome", "Place", { origin: "inferred", sameAs: [rome] }),
      entity("venice", "Venice", "Place", { origin: "inferred" }),
      entity("milan", "Milan", "Place", { origin: "inferred" }),
      entity("lounge", "Lounge Area", "Place", { origin: "inferred" }),
      entity("bar", "Rooftop Bar", "Place", { origin: "inferred" }),
      entity("sarl", "Example France SARL", "Place", { origin: "inferred" }),
      entity("town", "Älmhult", "Place", { origin: "inferred" }),
      entity("town2", "Älmhult, Sweden", "Place", { origin: "inferred" }),
    ]));
    expect(view.places.map((item) => item.name).sort()).toEqual(["Milan", "Rome", "Venice", "Älmhult"]);
    expect(view.sentence).not.toMatch(/Lounge|Rooftop|SARL|Sweden/);
  });

  it("never lets a label only the text read stand for what the business sells", () => {
    const view = modelView(report("shop.example", [
      entity("org", "Shop Example", "Organization"),
      entity("a", "Idee regalo", "Product", { origin: "inferred" }),
      entity("b", "Giochi di società", "Product", { origin: "inferred" }),
      entity("c", "Servizio Clienti", "Service", { origin: "inferred" }),
      entity("d", "Free Shipping", "Offer", { origin: "inferred" }),
    ]));
    expect(view.sentence).not.toMatch(/Idee regalo|Giochi|Servizio|Shipping/);
    expect(view.preview.map((item) => item.name)).toEqual(["Shop Example"]);
  });
});

import { ContentAnalysisProvider, ENTITY_LABELS, labelsFor, nodesFrom } from "../../src/server/adapters/markup/ContentAnalysis.js";

const page = {
  url: "https://alpina.travel/lungau/apartments/",
  title: "Apartments in Lungau",
  description: "Family apartments in Mariapfarr.",
  headings: ["Samspitze 4"],
  text: "Samspitze 4 is a two-bedroom family apartment in Mariapfarr, Lungau, Austria, run by AlpiNest and bookable through Mountain Nests Rentals, an agency from Rome. Guests get breakfast on Tuesday. Book Samspitze 4Enter",
};

/** What the service answered on a text like this one, scores included: the linker sure of Austria, guessing about Lungau. */
const answer = {
  language: "en",
  text_length: 160,
  processing_time_ms: 13544,
  pipeline_version: "0.1.0",
  entities: [
    { text: "Samspitze 4", label: "Apartment", start: 0, end: 11, score: 0.83, entity_id: "Q1774463", entity_label: "Klimmspitze", entity_description: "mountain in Austria", disambiguation_score: 0.5 },
    { text: "two-bedroom family apartment", label: "Apartment", start: 17, end: 45, score: 0.51 },
    { text: "Mariapfarr", label: "City", start: 49, end: 59, score: 0.94, entity_id: "Q266703", entity_label: "Salzkammergut", disambiguation_score: 0.5 },
    { text: "Lungau", label: "Place", start: 61, end: 67, score: 0.65, entity_id: "Q47621", entity_label: "Longone al Segrino", disambiguation_score: 0.5 },
    { text: "Lungau", label: "Place", start: 100, end: 106, score: 0.7 },
    { text: "Austria", label: "Country", start: 69, end: 76, score: 0.97, entity_id: "Q40", entity_label: "Austria", entity_description: "country in Central Europe", disambiguation_score: 0.73 },
    { text: "Mountain Nests Rentals", label: "Organization", start: 120, end: 142, score: 0.75 },
    { text: "Guests", label: "Person", start: 150, end: 156, score: 0.78 },
    { text: "Breakfast", label: "Event", start: 160, end: 169, score: 0.51 },
    { text: "Rome", label: "City", start: 170, end: 174, score: 0.77, entity_id: "Q220", entity_label: "Rome", entity_description: "capital of Italy", disambiguation_score: 0.73 },
    { text: "Tuesday", label: "Date", start: 180, end: 187, score: 0.9 },
    { text: "Samspitze 4Enter", label: "Apartment", start: 190, end: 206, score: 0.8 },
    { text: "Lungau", label: "City", start: 210, end: 216, score: 0.9 },
    { text: "cutting-edge AI platforms", label: "Platform", start: 220, end: 245, score: 0.8 },
    // Not in the text at all: whatever produced it, it never becomes an entity of this page.
    { text: "Grand Hotel Lungau", label: "Hotel", start: 0, end: 0, score: 0.95 },
  ],
};

function fakeFetch(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("Content Analysis v3 as the entities behind Fix", () => {
  it("asks for the things a business is made of, by name, with the WordLift key", async () => {
    const { impl, calls } = fakeFetch(answer);
    const provider = new ContentAnalysisProvider({ apiKey: "wl-key", fetch: impl });
    await provider.generate(page);

    expect(calls[0]?.url).toBe("https://wordlift-lab--content-analysis-v3-web-app.modal.run/analyze/text");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Key wl-key");
    const body = JSON.parse(String(calls[0]?.init.body)) as { text: string; labels: string[]; confidence: number };
    expect(body.labels).toEqual([...ENTITY_LABELS]);

    // Told what kind of site it is reading, the provider asks for the things that kind of business is made of.
    await provider.generate({ ...page, siteType: "travel-hospitality" });
    const travel = JSON.parse(String(calls[1]?.init.body)) as { labels: string[] };
    expect(travel.labels).toEqual(expect.arrayContaining(["Apartment", "Hotel", "Tour", "Pass", "Attraction", "Restaurant"]));
    expect(travel.labels).not.toContain("Integration");
    expect(body.text.startsWith("Apartments in Lungau\nFamily apartments in Mariapfarr.\nSamspitze 4\n")).toBe(true);
    expect(body.confidence).toBe(0.45);
  });

  it("keeps names above the floor, links only what the linker is sure of, and leaves role nouns, phrases and dates aside", async () => {
    const { impl } = fakeFetch(answer);
    const provider = new ContentAnalysisProvider({ apiKey: "wl-key", fetch: impl });
    const outcome = await provider.generate(page);

    // One Lungau, whatever the recogniser labelled it the second time; no country; no name with a button glued on.
    expect(outcome.entities.map((entity) => [entity.types[0], entity.name, entity.origin])).toEqual([
      ["Apartment", "Samspitze 4", "inferred"],
      ["Place", "Mariapfarr", "inferred"],
      ["Place", "Lungau", "inferred"],
      ["Organization", "Mountain Nests Rentals", "inferred"],
      ["Place", "Rome", "inferred"],
    ]);
    const byName = Object.fromEntries(outcome.entities.map((entity) => [entity.name, entity]));
    // Sure: Rome at 0.73 carries its link and description. Guessed: Samspitze 4 at 0.5 carries nothing of "Klimmspitze".
    expect(byName["Rome"]).toMatchObject({ sameAs: ["https://www.wikidata.org/wiki/Q220"], description: "capital of Italy" });
    expect(byName["Samspitze 4"]).toMatchObject({ sameAs: [], alternateNames: [] });
    expect(byName["Samspitze 4"]?.description).toBeUndefined();
    expect(byName["Samspitze 4"]?.id).toBe("https://alpina.travel/#inferred-apartment-samspitze-4");
    // Nothing is below the floor any more; the phrase and the meal are kept out by the name rules instead.
    expect(outcome.issues).toEqual(["6 mentions skipped as not a name", "1 name dropped as not on the page", "1 entity skipped as not domain entities: Date"]);
    expect(outcome.model).toBe("content-analysis-v3/0.1.0");
    expect(outcome.usage).toEqual({ inputTokens: expect.any(Number), outputTokens: 5, estimatedUsd: 0 });
    expect(provider.totals()).toMatchObject({ pages: 1, outputTokens: 5, estimatedUsd: 0 });
  });

  it("says only the status when the service refuses, never what it was sent", async () => {
    const { impl } = fakeFetch({ detail: "Invalid key for text 'Samspitze 4 is…'" }, 401);
    const provider = new ContentAnalysisProvider({ apiKey: "wl-key", fetch: impl });
    await expect(provider.generate(page)).rejects.toThrow("Content analysis refused the page (HTTP 401)");
  });

  it("never lets a name the page does not contain through, whatever the service says", () => {
    const nodes = nodesFrom([{ text: "Samspitze 4", label: "Apartment", score: 0.9 }, { text: "Hotel Invented", label: "Hotel", score: 0.99 }], 0.6, 0.7, [], "Welcome to Samspitze 4 in Lungau.");
    expect(nodes.map((node) => node.name)).toEqual(["Samspitze 4"]);
  });

  it("asks each kind of site for what it is made of, on top of what every site is asked for", () => {
    expect(labelsFor(undefined)).toEqual([...ENTITY_LABELS]);
    expect(labelsFor("commerce-retail")).toEqual(expect.arrayContaining(["Product", "Brand", "Collection", "Store"]));
    expect(labelsFor("saas")).toEqual(expect.arrayContaining(["Plan", "Integration", "API"]));
    expect(labelsFor("publisher-content")).toEqual(expect.arrayContaining(["Article", "Author", "Podcast"]));
    expect(labelsFor("finance-insurance")).toEqual(expect.arrayContaining(["Policy", "Fund", "Card"]));
    expect(labelsFor("other")).toEqual([...ENTITY_LABELS]);
    // A trip, a pass and a plan land on types the map already speaks.
    const nodes = nodesFrom([{ text: "Lungau Card", label: "Pass", score: 0.9 }, { text: "Glacier Tour", label: "Tour", score: 0.9 }, { text: "Team plan", label: "Plan", score: 0.9 }], 0.6, 0.7, []);
    expect(nodes.map((node) => `${node.types[0]}:${node.name}`)).toEqual(["Product:Lungau Card", "TouristTrip:Glacier Tour", "Product:Team plan"]);
  });

  it("maps the service's labels onto schema.org types the map already speaks", () => {
    const nodes = nodesFrom(
      [
        { text: "Katschberg", label: "Attraction", score: 0.71 },
        { text: "Salzburg region", label: "Region", score: 0.9 },
        { text: "Longone", label: "Location", score: 0.8 },
        { text: "ACME", label: "Company", score: 0.8 },
        { text: "ACME", label: "Organization", score: 0.9 },
      ],
      0.6,
      0.7,
      [],
    );
    // Every geographic label is a Place, so the same name on two pages merges into one entity.
    expect(nodes.map((node) => `${node.types[0]}:${node.name}`)).toEqual(["Place:Katschberg", "Place:Salzburg region", "Place:Longone", "Organization:ACME"]);
  });
});

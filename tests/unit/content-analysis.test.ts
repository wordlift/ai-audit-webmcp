import { ContentAnalysisProvider, ENTITY_LABELS, nodesFrom } from "../../src/server/adapters/markup/ContentAnalysis.js";

const page = {
  url: "https://alpina.travel/lungau/apartments/",
  title: "Apartments in Lungau",
  description: "Family apartments in Mariapfarr.",
  headings: ["Samspitze 4"],
  text: "Samspitze 4 is a two-bedroom family apartment in Mariapfarr, Lungau, Austria, run by AlpiNest and bookable through Mountain Nests Rentals.",
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
    expect(body.text.startsWith("Apartments in Lungau\nFamily apartments in Mariapfarr.\nSamspitze 4\n")).toBe(true);
    expect(body.confidence).toBeLessThanOrEqual(0.5);
  });

  it("keeps names above the floor, links only what the linker is sure of, and leaves role nouns, phrases and dates aside", async () => {
    const { impl } = fakeFetch(answer);
    const provider = new ContentAnalysisProvider({ apiKey: "wl-key", fetch: impl });
    const outcome = await provider.generate(page);

    expect(outcome.entities.map((entity) => [entity.types[0], entity.name, entity.origin])).toEqual([
      ["Apartment", "Samspitze 4", "inferred"],
      ["City", "Mariapfarr", "inferred"],
      ["Place", "Lungau", "inferred"],
      ["Country", "Austria", "inferred"],
      ["Organization", "Mountain Nests Rentals", "inferred"],
      ["City", "Rome", "inferred"],
    ]);
    const byName = Object.fromEntries(outcome.entities.map((entity) => [entity.name, entity]));
    // Sure: Austria at 0.73 carries its link and description. Guessed: Samspitze 4 at 0.5 carries nothing of "Klimmspitze".
    expect(byName["Austria"]).toMatchObject({ sameAs: ["https://www.wikidata.org/wiki/Q40"], description: "country in Central Europe" });
    expect(byName["Samspitze 4"]).toMatchObject({ sameAs: [], alternateNames: [] });
    expect(byName["Samspitze 4"]?.description).toBeUndefined();
    expect(byName["Samspitze 4"]?.id).toBe("https://alpina.travel/#inferred-apartment-samspitze-4");
    expect(outcome.issues).toEqual(["2 entities below the confidence floor", "1 mention skipped as not a name", "1 entity skipped as not domain entities: Date"]);
    expect(outcome.model).toBe("content-analysis-v3/0.1.0");
    expect(outcome.usage).toEqual({ inputTokens: expect.any(Number), outputTokens: 6, estimatedUsd: 0 });
    expect(provider.totals()).toMatchObject({ pages: 1, outputTokens: 6, estimatedUsd: 0 });
  });

  it("says only the status when the service refuses, never what it was sent", async () => {
    const { impl } = fakeFetch({ detail: "Invalid key for text 'Samspitze 4 is…'" }, 401);
    const provider = new ContentAnalysisProvider({ apiKey: "wl-key", fetch: impl });
    await expect(provider.generate(page)).rejects.toThrow("Content analysis refused the page (HTTP 401)");
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
    expect(nodes.map((node) => `${node.types[0]}:${node.name}`)).toEqual(["TouristAttraction:Katschberg", "AdministrativeArea:Salzburg region", "Place:Longone", "Organization:ACME"]);
  });
});

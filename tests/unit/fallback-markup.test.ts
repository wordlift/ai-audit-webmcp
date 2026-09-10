import { FallbackMarkupProvider } from "../../src/server/adapters/markup/FallbackMarkup.js";
import type { MarkupOutcome, MarkupPageInput, MarkupProvider } from "../../src/server/adapters/markup/MarkupProvider.js";

const page: MarkupPageInput = {
  url: "https://alpina.travel/lungau/apartments/",
  title: "Apartments in Lungau",
  description: "",
  headings: ["Samspitze 4"],
  text: "Samspitze 4 is a family apartment in Mariapfarr, bookable through Mountain Nests Rentals.",
};

function provider(name: string, behaviour: "answers" | "fails" | "times-out"): MarkupProvider & { asked: number } {
  const self = {
    name,
    model: `${name}-1`,
    asked: 0,
    async generate(): Promise<MarkupOutcome> {
      self.asked += 1;
      if (behaviour === "fails") throw new Error("Content analysis refused the page (HTTP 502)");
      if (behaviour === "times-out") throw new Error("Content analysis did not answer in time");
      return {
        model: `${name}-1`,
        issues: [],
        usage: { inputTokens: 100, outputTokens: 3, estimatedUsd: name === "gemini" ? 0.002 : 0 },
        entities: [
          // On the page, with facts a model wrote around it.
          { id: "https://alpina.travel/#inferred-apartment-samspitze-4", types: ["Apartment"], name: "Samspitze 4", alternateNames: ["Samspitze IV"], description: "Invented.", sourceUrl: page.url, sameAs: ["https://www.wikidata.org/wiki/Q1"], offers: [{ price: "128", priceCurrency: "EUR" }], origin: "inferred" },
          // On the page.
          { id: "https://alpina.travel/#inferred-organization-mountain-nests-rentals", types: ["Organization"], name: "Mountain Nests Rentals", alternateNames: [], sourceUrl: page.url, sameAs: [], offers: [], origin: "inferred" },
          // Not on the page at all.
          { id: "https://alpina.travel/#inferred-hotel-grand-hotel-lungau", types: ["Hotel"], name: "Grand Hotel Lungau", alternateNames: [], sourceUrl: page.url, sameAs: [], offers: [], origin: "inferred" },
        ],
      };
    },
    totals: () => ({ pages: self.asked, inputTokens: 100 * self.asked, outputTokens: 3 * self.asked, estimatedUsd: name === "gemini" ? 0.002 * self.asked : 0 }),
  };
  return self;
}

describe("a second extractor behind the first", () => {
  it("is never asked while the first answers", async () => {
    const first = provider("content-analysis", "answers");
    const second = provider("gemini", "answers");
    const fallback = new FallbackMarkupProvider(first, second);
    const outcome = await fallback.generate(page);
    expect(fallback.name).toBe("content-analysis+gemini");
    expect(second.asked).toBe(0);
    expect(fallback.fellBack).toBe(0);
    // The first provider's answer travels whole, facts included: it is the source of facts.
    expect(outcome.entities[0]?.offers).toHaveLength(1);
    expect(outcome.entities[0]?.sameAs).toEqual(["https://www.wikidata.org/wiki/Q1"]);
  });

  it("steps in for names only when the first does not answer, and the page confirms each name", async () => {
    for (const behaviour of ["times-out", "fails"] as const) {
      const first = provider("content-analysis", behaviour);
      const second = provider("gemini", "answers");
      const fallback = new FallbackMarkupProvider(first, second);
      const outcome = await fallback.generate(page);
      expect(second.asked).toBe(1);
      expect(fallback.fellBack).toBe(1);
      expect(outcome.model).toBe("gemini-1 (names only)");
      expect(outcome.entities.map((entity) => entity.name)).toEqual(["Samspitze 4", "Mountain Nests Rentals"]);
      // A name, a type, where it was seen, and nothing a model wrote around it.
      expect(outcome.entities[0]).toMatchObject({ types: ["Apartment"], alternateNames: [], sameAs: [], offers: [], origin: "inferred" });
      expect(outcome.entities[0]?.description).toBeUndefined();
      expect(outcome.issues[0]).toBe(`content-analysis did not answer (${behaviour === "fails" ? "Content analysis refused the page (HTTP 502)" : "Content analysis did not answer in time"}); gemini proposed names and the page confirmed 2 of 3`);
    }
  });

  it("adds up what both extractors were asked and what the second cost", async () => {
    const first = provider("content-analysis", "times-out");
    const second = provider("gemini", "answers");
    const fallback = new FallbackMarkupProvider(first, second);
    await fallback.generate(page);
    expect(fallback.totals()).toEqual({ pages: 2, inputTokens: 200, outputTokens: 6, estimatedUsd: 0.002 });
  });
});

import { GeminiMarkupProvider } from "../../src/server/adapters/markup/GeminiMarkup.js";
import { domainNodes, entitiesFromJsonLd, readJsonLd } from "../../src/server/adapters/markup/jsonLd.js";

const page = {
  url: "https://alpina.travel/rooms/samspitze-4",
  title: "Samspitze 4",
  description: "A family apartment in Lungau.",
  headings: ["Samspitze 4", "Book your stay"],
  text: "Samspitze 4 sleeps four. From 128 EUR per night. Check availability and book online.",
};

const generated = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Apartment",
      name: "Samspitze 4",
      url: "https://alpina.travel/rooms/samspitze-4",
      description: "A family apartment in Lungau.",
      offers: { "@type": "Offer", price: "128", priceCurrency: "EUR", availability: "https://schema.org/InStock" },
    },
    { "@type": "https://schema.org/LodgingBusiness", "@id": "https://alpina.travel/#alpinest", name: "AlpiNest Feriendorf Lungau", sameAs: ["https://www.instagram.com/alpinest"] },
    { "@type": "Product", url: "https://alpina.travel/x" },
    { "@type": "not a type", name: "Nope" },
  ],
};

function geminiAnswer(
  document: unknown,
  usage: { promptTokenCount: number; candidatesTokenCount: number; thoughtsTokenCount?: number } = { promptTokenCount: 1_200, candidatesTokenCount: 400 },
) {
  return {
    candidates: [{ content: { parts: [{ text: JSON.stringify(document) }] } }],
    usageMetadata: usage,
  };
}

function fakeFetch(payload: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("the Gemini markup stand-in", () => {
  it("turns the model's JSON-LD into inferred entities and prices the call", async () => {
    const { impl, calls } = fakeFetch(geminiAnswer(generated));
    const provider = new GeminiMarkupProvider({ apiKey: "test-key", fetch: impl });

    const outcome = await provider.generate(page);

    expect(outcome.model).toBe("gemini-2.5-flash");
    expect(outcome.entities.map((entity) => [entity.types[0], entity.name, entity.origin])).toEqual([
      ["Apartment", "Samspitze 4", "inferred"],
      ["LodgingBusiness", "AlpiNest Feriendorf Lungau", "inferred"],
    ]);
    expect(outcome.entities[0]?.offers).toEqual([{ price: "128", priceCurrency: "EUR", availability: "InStock" }]);
    expect(outcome.entities[0]?.id).toBe("https://alpina.travel/#inferred-apartment-samspitze-4");
    expect(outcome.entities[1]?.id).toBe("https://alpina.travel/#alpinest");
    expect(outcome.issues).toEqual(["Product 3 has no name", 'Entity 4 has a type that is not a schema.org name: "not a type"']);
    // 1,200 input tokens at $0.30/M and 400 output at $2.50/M.
    expect(outcome.usage).toEqual({ inputTokens: 1_200, outputTokens: 400, estimatedUsd: expect.closeTo(0.00136, 6) });

    const call = calls[0];
    expect(call?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(call?.url).not.toContain("test-key");
    expect((call?.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(String(call?.init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
    expect(body.contents[0].parts[0].text).toContain("Page: https://alpina.travel/rooms/samspitze-4");
  });

  it("keeps a running total for the health endpoint", async () => {
    const provider = new GeminiMarkupProvider({ apiKey: "k", fetch: fakeFetch(geminiAnswer(generated)).impl });
    await provider.generate(page);
    await provider.generate(page);
    expect(provider.totals()).toEqual({ pages: 2, inputTokens: 2_400, outputTokens: 800, estimatedUsd: expect.closeTo(0.00272, 6) });
  });

  it("counts thinking tokens as output, because the bill does", async () => {
    const provider = new GeminiMarkupProvider({
      apiKey: "k",
      fetch: fakeFetch(geminiAnswer(generated, { promptTokenCount: 1_000, candidatesTokenCount: 300, thoughtsTokenCount: 200 })).impl,
    });
    const outcome = await provider.generate(page);
    expect(outcome.usage.outputTokens).toBe(500);
  });

  it("answers with nothing, and says why, when the model does not answer with JSON", async () => {
    const provider = new GeminiMarkupProvider({
      apiKey: "k",
      fetch: fakeFetch({ candidates: [{ content: { parts: [{ text: "Sorry, here is prose." }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }).impl,
    });
    const outcome = await provider.generate(page);
    expect(outcome.entities).toEqual([]);
    expect(outcome.issues).toEqual(["Gemini did not answer with JSON"]);
  });

  it("fails the page, not the audit, on an HTTP error", async () => {
    const provider = new GeminiMarkupProvider({ apiKey: "k", fetch: fakeFetch({ error: "quota" }, 429).impl });
    await expect(provider.generate(page)).rejects.toThrow(/HTTP 429/);
    expect(provider.totals().pages).toBe(0);
  });
});

describe("reading generated JSON-LD", () => {
  it("accepts a single node, an array, or a graph, and strips the schema.org prefix", () => {
    const single = readJsonLd({ "@context": "https://schema.org", "@type": "Organization", name: "Alpina" });
    expect(single.nodes.map((node) => node.types)).toEqual([["Organization"]]);
    const array = readJsonLd([{ "@type": ["https://schema.org/Hotel", "LodgingBusiness"], name: "AlpiNest" }]);
    expect(array.nodes[0]?.types).toEqual(["Hotel", "LodgingBusiness"]);
  });

  it("keeps the business's entities and leaves the page's furniture aside, counted", () => {
    const { nodes, issues } = readJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Plan your Lungau days" },
        { "@type": "Question", name: "Who is coming?" },
        { "@type": "Rating", name: "Google Maps rating" },
        { "@type": "Apartment", name: "Samspitze 4" },
        { "@type": ["City", "Place"], name: "Mariapfarr" },
      ],
    });
    const kept = domainNodes(nodes, issues);
    expect(kept.map((node) => node.name)).toEqual(["Samspitze 4", "Mariapfarr"]);
    expect(issues).toContain("3 entities skipped as not domain entities: WebPage, Question, Rating");
  });

  it("leaves the parts of a listing aside: a room is described, never listed as a thing the business is", () => {
    const { nodes, issues } = readJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Apartment", name: "Samspitze 4" },
        { "@type": "Accommodation", name: "Bedroom 1" },
        { "@type": "Accommodation", name: "Living room" },
        { "@type": "Accommodation", name: "Master bedroom" },
        { "@type": "LodgingBusiness", name: "Mountain Nests Rentals" },
      ],
    });
    expect(domainNodes(nodes, issues).map((node) => node.name)).toEqual(["Samspitze 4", "Mountain Nests Rentals"]);
    expect(issues).toContain("3 entities skipped as not domain entities: Accommodation");
  });

  it("refuses what is not a document, and notes a missing context", () => {
    expect(readJsonLd("text")).toEqual({ nodes: [], issues: ["The document is not a JSON object"] });
    expect(readJsonLd({ "@type": "Thing", name: "X" }).issues).toContain("The document does not declare the schema.org context");
  });

  it("drops a url that is not one and keeps the entity", () => {
    const { nodes, issues } = readJsonLd({ "@context": "https://schema.org", "@type": "Product", name: "Jacket", url: "not a url" });
    expect(nodes[0]?.url).toBeUndefined();
    expect(issues).toEqual(['Product "Jacket" has a url that is not one']);
  });

  it("gives an inferred entity an id on the page's origin unless the model gave it one there", () => {
    const nodes = readJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Product", name: "Trail Jacket" },
        { "@type": "Brand", "@id": "https://elsewhere.example/#brand", name: "Elsewhere" },
      ],
    }).nodes;
    const entities = entitiesFromJsonLd(nodes, "https://shop.example/products/trail-jacket");
    expect(entities.map((entity) => entity.id)).toEqual([
      "https://shop.example/#inferred-product-trail-jacket",
      "https://shop.example/#inferred-brand-elsewhere",
    ]);
    expect(entities.every((entity) => entity.origin === "inferred")).toBe(true);
  });
});

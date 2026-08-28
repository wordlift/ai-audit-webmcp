import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { collectJsonLdEntities } from "../../src/server/adapters/scrape/jsonLdEntities.js";

const SOURCE = "https://alpina.travel/";

function documentWith(...blocks: unknown[]): Document {
  const scripts = blocks
    .map((block) => `<script type="application/ld+json">${typeof block === "string" ? block : JSON.stringify(block)}</script>`)
    .join("");
  return parseHTML(`<html><head>${scripts}</head><body></body></html>`).document as unknown as Document;
}

describe("reading entities out of a page's JSON-LD", () => {
  it("reads a named entity with its offer out of an @graph", () => {
    const document = documentWith({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Alpina Travel" },
        {
          "@type": "Apartment",
          "@id": "https://alpina.travel/#samspitze-4",
          name: "Samspitze 4",
          description: "Alpine holiday apartment for up to 6 guests.",
          url: "https://alpina.travel/apartments/samspitze-4",
          offers: { "@type": "Offer", price: 644.8, priceCurrency: "EUR", availability: "https://schema.org/InStock" },
        },
      ],
    });

    const entities = collectJsonLdEntities(document, SOURCE);

    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      id: "https://alpina.travel/#samspitze-4",
      type: "Apartment",
      name: "Samspitze 4",
      url: "https://alpina.travel/apartments/samspitze-4",
      offer: { price: "644.8", priceCurrency: "EUR", availability: "InStock" },
      sourceUrl: SOURCE,
      method: "json-ld",
    });
  });

  it("unwraps list items and reads an AggregateOffer's lowest price", () => {
    const document = documentWith({
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          item: {
            "@type": "Product",
            name: "Alpine Trail Runner 2",
            sku: "ATR2-44",
            offers: { "@type": "AggregateOffer", lowPrice: "129.00", highPrice: "159.00", priceCurrency: "EUR" },
          },
        },
      ],
    });

    const entities = collectJsonLdEntities(document, SOURCE);

    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      type: "Product",
      name: "Alpine Trail Runner 2",
      sku: "ATR2-44",
      offer: { price: "129.00", priceCurrency: "EUR" },
    });
  });

  it("refuses page furniture and things without a name", () => {
    const document = documentWith({
      "@graph": [
        { "@type": "WebSite", name: "Site" },
        { "@type": "BreadcrumbList", name: "Crumbs" },
        { "@type": "Product" },
        { "@type": "SearchAction", name: "Search" },
      ],
    });

    expect(collectJsonLdEntities(document, SOURCE)).toEqual([]);
  });

  it("deduplicates by identity and survives a malformed block", () => {
    const entity = { "@type": "Hotel", "@id": "https://alpina.travel/#hotel", name: "Alpina Lodge" };
    const document = documentWith(entity, "{not json", entity);

    const entities = collectJsonLdEntities(document, SOURCE);

    expect(entities).toHaveLength(1);
    expect(entities[0].name).toBe("Alpina Lodge");
  });

  it("treats site-authored text as data: control characters collapse, lengths cap", () => {
    const document = documentWith({
      "@type": "Product",
      name: `Alpine\u0000\u0007 Runner\n  Special ${"x".repeat(400)}`,
      description: "d".repeat(500),
    });

    const entities = collectJsonLdEntities(document, SOURCE);

    expect(entities[0].name.startsWith("Alpine Runner Special")).toBe(true);
    expect(entities[0].name.length).toBeLessThanOrEqual(200);
    expect(entities[0].description?.length).toBeLessThanOrEqual(300);
  });

  it("never keeps more than the entity budget", () => {
    const document = documentWith({
      "@graph": Array.from({ length: 40 }, (_, index) => ({ "@type": "Product", name: `Item ${index}` })),
    });

    expect(collectJsonLdEntities(document, SOURCE)).toHaveLength(24);
  });

  it("drops a non-http url instead of storing it", () => {
    const document = documentWith({ "@type": "Product", name: "Thing", url: "javascript:alert(1)" });

    expect(collectJsonLdEntities(document, SOURCE)[0].url).toBeUndefined();
  });
});

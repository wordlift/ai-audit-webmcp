import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { firstPartyPath, pickEntityPages, readableText } from "../../src/server/adapters/scrape/NativeFetch.js";

describe("readable text for classification", () => {
  it("excludes script, style, and JSON-LD text on a page without a main landmark", () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <nav>Menu</nav>
      <script>var BUNDLE_ONLY_TOKEN = 1;</script>
      <style>.hero { color: red; }</style>
      <script type="application/ld+json">{"@type":"Product","name":"LD_ONLY_TOKEN"}</script>
      <p>Alpine apartments in Lungau for families.</p>
    </body></html>`);

    const text = readableText(document as unknown as Document);

    expect(text).toContain("Alpine apartments in Lungau");
    expect(text).not.toContain("BUNDLE_ONLY_TOKEN");
    expect(text).not.toContain("LD_ONLY_TOKEN");
    expect(text).not.toContain("color: red");
  });

  it("leaves the document intact for the extractors that still need its scripts", () => {
    const { document } = parseHTML(
      `<html><body><script type="application/ld+json">{"@type":"Product"}</script><p>Copy</p></body></html>`,
    );

    readableText(document as unknown as Document);

    expect([...document.querySelectorAll("script")]).toHaveLength(1);
  });
});

describe("picking pages for entity extraction", () => {
  const base = new URL("https://alpina.travel/");
  const emptyDocument = () => parseHTML("<html><body></body></html>").document as unknown as Document;

  it("takes same-origin detail-looking paths first, deduplicated, within budget", () => {
    const picked = pickEntityPages(
      emptyDocument(),
      [
        "https://alpina.travel/apartments/samspitze-4",
        "https://alpina.travel/apartments/samspitze-4",
        "https://alpina.travel/about",
        "https://other.example/products/x",
        "https://alpina.travel/rooms/panorama",
        "https://alpina.travel/products/extra",
        "https://alpina.travel/products/fourth",
        null,
      ],
      base,
    );

    expect(picked).toEqual([
      "https://alpina.travel/apartments/samspitze-4",
      "https://alpina.travel/rooms/panorama",
      "https://alpina.travel/products/extra",
    ]);
  });

  it("falls back to the top navigation, skipping utility pages", () => {
    const { document } = parseHTML(`<html><body><header>
      <a href="/collection/winter">Winter</a>
      <a href="/login">Login</a>
      <a href="/contact">Contact</a>
      <a href="/experiences">Experiences</a>
    </header></body></html>`);

    const picked = pickEntityPages(document as unknown as Document, [], base);

    expect(picked).toEqual([
      "https://alpina.travel/collection/winter",
      "https://alpina.travel/experiences",
    ]);
  });

  it("never re-reads the page being audited", () => {
    expect(
      pickEntityPages(emptyDocument(), ["https://alpina.travel/products/"], new URL("https://alpina.travel/products/")),
    ).toEqual([]);
  });
});

describe("first-party paths", () => {
  const base = new URL("https://www.freedomdebtrelief.com/");

  it("keeps same-host paths as before", () => {
    expect(firstPartyPath("/how-it-works?src=nav", base)).toBe("/how-it-works?src=nav");
  });

  it("keeps a first-party subdomain as //host/path so path rules can read its name", () => {
    expect(firstPartyPath("https://apply.freedomdebtrelief.com/start", base)).toBe(
      "//apply.freedomdebtrelief.com/start",
    );
  });

  it("drops third-party hosts entirely", () => {
    expect(firstPartyPath("https://apply.example.com/", base)).toBe("");
    expect(firstPartyPath("https://notfreedomdebtrelief.com/", base)).toBe("");
  });
});

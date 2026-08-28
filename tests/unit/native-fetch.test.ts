import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { readableText } from "../../src/server/adapters/scrape/NativeFetch.js";

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

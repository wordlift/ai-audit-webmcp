import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { NativeFetchCollector, blockedResponse, javascriptShell, readableText } from "../../src/server/adapters/scrape/NativeFetch.js";

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

  it("reads the whole body when the main landmark is an empty shell", () => {
    const { document } = parseHTML(`<!doctype html><html><body>
      <header><h1>Makeup, Skincare, Fragrance</h1></header>
      <main id="root"></main>
      <section><h2>Today Only: 50% Off Select Beauty</h2><p>${"Transformative products for frizzy hair, now at the counter. ".repeat(6)}</p></section>
    </body></html>`);

    const text = readableText(document as unknown as Document);

    expect(text).toContain("50% Off Select Beauty");
    expect(text).toContain("Transformative products");
  });

  it("leaves the document intact for the extractors that still need its scripts", () => {
    const { document } = parseHTML(
      `<html><body><script type="application/ld+json">{"@type":"Product"}</script><p>Copy</p></body></html>`,
    );

    readableText(document as unknown as Document);

    expect([...document.querySelectorAll("script")]).toHaveLength(1);
  });
});

describe("the catalog second hop", () => {
  const filler = `<p>${"Fine jewellery for every day, made to be worn. ".repeat(30)}</p>`;
  const site: Record<string, string> = {
    "https://shop.example/": `<html><head><title>Ring Shop</title></head><body><main><h1>Rings and things</h1>${filler}</main>
      <nav><a href="/collections/rings">Rings</a><a href="/help">Help</a><a href="/cart">Cart</a></nav></body></html>`,
    "https://shop.example/collections/rings": `<html><head><title>Rings</title></head><body><main><h1>All rings</h1>${filler}</main>
      <a href="/collections/rings/gold-ring-123">Gold ring</a><a href="/collections/rings">All</a></body></html>`,
    "https://shop.example/collections/rings/gold-ring-123": `<html><head><title>Gold ring</title></head><body><main><h1>Gold ring</h1>${filler}</main>
      <script type="application/ld+json">{"@type":"Product","name":"Gold Ring","offers":{"@type":"Offer","price":"99","priceCurrency":"EUR"}}</script></body></html>`,
    "https://shop.example/help": `<html><head><title>Help</title></head><body><main><h1>Help</h1>${filler}</main></body></html>`,
  };
  const fetcher = async (url: URL) => ({
    finalUrl: url.toString(),
    body: site[url.toString()] ?? "<html><head><title>Not found</title></head><body>Not found</body></html>",
    truncated: false,
    status: site[url.toString()] ? 200 : 404,
  });

  it("follows one link from a listing to an item page when the sample has no Product yet", async () => {
    const collector = new NativeFetchCollector({}, fetcher);
    const snapshot = await collector.collect(new URL("https://shop.example/"));

    const item = snapshot.pages.find((page) => page.url.endsWith("/gold-ring-123"));
    expect(item?.role).toBe("detail");
    expect(item?.entities[0]?.offers[0]?.price).toBe("99");
    // The item page joins the pages a report displays (the first four).
    expect(snapshot.pages.indexOf(item!)).toBeLessThan(4);
  });

  it("does not spend the hop when a sampled page already carries the Product", async () => {
    const withProduct: Record<string, string> = {
      ...site,
      "https://shop.example/collections/rings": site["https://shop.example/collections/rings"].replace(
        "</body>",
        `<script type="application/ld+json">{"@type":"Product","name":"Silver Ring"}</script></body>`,
      ),
    };
    const collector = new NativeFetchCollector({}, async (url: URL) => ({
      finalUrl: url.toString(),
      body: withProduct[url.toString()] ?? "<html><head><title>Not found</title></head><body>Not found</body></html>",
      truncated: false,
      status: withProduct[url.toString()] ? 200 : 404,
    }));
    const snapshot = await collector.collect(new URL("https://shop.example/"));

    expect(snapshot.pages.some((page) => page.url.endsWith("/gold-ring-123"))).toBe(false);
  });
});

describe("telling a site's bouncer from its page", () => {
  it("reads a refusal, a rate limit, and a challenge page as what they are", () => {
    expect(blockedResponse(403, "<html><title>Access Denied</title></html>")).toMatch(/refused automated access \(HTTP 403\)/);
    expect(blockedResponse(429, "")).toMatch(/rate-limited/);
    expect(blockedResponse(503, "<html><head><title>Just a moment...</title></head></html>")).toMatch(/bot challenge/);
    // CloudFront's refusal page, as illy.com served it, even when the status is lost on the way.
    expect(blockedResponse(200, "<html><head><title>ERROR: The request could not be satisfied</title></head></html>")).toMatch(/bot challenge/);
    expect(blockedResponse(200, '<html><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script></body></html>')).toMatch(
      /bot challenge/,
    );
  });

  it("leaves an ordinary page alone, even one that talks about access", () => {
    expect(blockedResponse(200, "<html><title>Lungau Holidays</title><p>Access denied? Never at our reception.</p></html>")).toBeNull();
    expect(blockedResponse(404, "<html><title>Not found</title></html>")).toBeNull();
  });

  it("reports a blocked site instead of auditing the block page", async () => {
    const collector = new NativeFetchCollector({}, async (url) => ({
      finalUrl: url.toString(),
      body: "<html><head><title>Access Denied</title></head><body>Reference #18.2f3e</body></html>",
      truncated: false,
      status: 403,
    }));

    await expect(collector.collect(new URL("https://blocked.example/"))).rejects.toMatchObject({
      code: "site_blocked",
      message: expect.stringMatching(/HTTP 403/),
    });
  });

  it("recognizes an empty JavaScript shell, but not a real page that merely mentions JavaScript", () => {
    expect(javascriptShell({ title: "", headings: ["JavaScript is disabled"], text: "JavaScript is disabled in your browser." })).toBe(true);
    expect(
      javascriptShell({
        title: "Lungau Holidays",
        headings: ["Samspitze 4", "Book your stay"],
        text: `Alpine apartments in Lungau for families. ${"Our booking widget requires JavaScript, but every rate is listed below. ".repeat(8)}`,
      }),
    ).toBe(false);
  });

  it("reports a JavaScript shell as a block instead of auditing the notice", async () => {
    const collector = new NativeFetchCollector({}, async (url) => ({
      finalUrl: url.toString(),
      body: "<html><head><title></title></head><body><h1>JavaScript is disabled</h1><p>Enable JavaScript to continue.</p></body></html>",
      truncated: false,
      status: 200,
    }));

    await expect(collector.collect(new URL("https://shell.example/"))).rejects.toMatchObject({
      code: "site_blocked",
      message: expect.stringMatching(/JavaScript shell/),
    });
  });
});

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

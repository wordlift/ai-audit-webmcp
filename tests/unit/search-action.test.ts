import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeSearchAction, findSearchActionTemplate } from "../../src/server/adapters/scrape/searchAction.js";

const BASE = new URL("https://alpina.travel/");
const POLICY = { resolve: async () => ["93.184.216.34"] };

function documentWith(block: unknown): Document {
  return parseHTML(
    `<html><head><script type="application/ld+json">${JSON.stringify(block)}</script></head><body></body></html>`,
  ).document as unknown as Document;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finding the declared SearchAction template", () => {
  it("reads a template from WebSite potentialAction, EntryPoint form included", () => {
    const document = documentWith({
      "@graph": [{
        "@type": "WebSite",
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: "https://alpina.travel/search?q={search_term_string}" },
        },
      }],
    });
    expect(findSearchActionTemplate(document, BASE)).toBe("https://alpina.travel/search?q={search_term_string}");
  });

  it("reads a plain string target", () => {
    const document = documentWith({
      "@type": "WebSite",
      potentialAction: { "@type": "SearchAction", target: "https://alpina.travel/search?q={query}" },
    });
    expect(findSearchActionTemplate(document, BASE)).toBe("https://alpina.travel/search?q={query}");
  });

  it("refuses a template on another host — that is not this site's interface", () => {
    const document = documentWith({
      "@type": "WebSite",
      potentialAction: { "@type": "SearchAction", target: "https://google.com/search?q={q}+site:alpina.travel" },
    });
    expect(findSearchActionTemplate(document, BASE)).toBeNull();
  });

  it("refuses a fixed URL without a placeholder — a link is not an action", () => {
    const document = documentWith({
      "@type": "WebSite",
      potentialAction: { "@type": "SearchAction", target: "https://alpina.travel/search" },
    });
    expect(findSearchActionTemplate(document, BASE)).toBeNull();
  });
});

describe("executing the declared SearchAction", () => {
  const TEMPLATE = "https://alpina.travel/search?q={search_term_string}";

  function stubResponse(body: string, status = 200) {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(body, { status, headers: { "content-type": "text/html" } }),
    ));
  }

  it("confirms a results page that acknowledges the query", async () => {
    stubResponse("<html><body><h1>Results for alpine apartments</h1></body></html>");
    const probe = await executeSearchAction(TEMPLATE, "alpine apartments", POLICY);

    expect(probe.confirmed).toBe(true);
    expect(probe.status).toBe(200);
    expect(probe.url).toBe("https://alpina.travel/search?q=alpine%20apartments");
  });

  it("does not confirm a blind 200 — client-rendered results are invisible here", async () => {
    stubResponse("<html><body><div id=\"root\"></div></body></html>");
    const probe = await executeSearchAction(TEMPLATE, "alpine apartments", POLICY);

    expect(probe.confirmed).toBe(false);
    expect(probe.status).toBe(200);
    expect(probe.note).toMatch(/without executing site scripts/);
  });

  it("records a non-200 answer as exactly that", async () => {
    stubResponse("Server error", 500);
    const probe = await executeSearchAction(TEMPLATE, "alpine apartments", POLICY);

    expect(probe.confirmed).toBe(false);
    expect(probe.status).toBe(500);
    expect(probe.note).toMatch(/HTTP 500/);
  });
});

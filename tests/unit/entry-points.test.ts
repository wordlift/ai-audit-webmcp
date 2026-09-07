import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeEntryPoint, findEntryPoints } from "../../src/server/adapters/scrape/entryPoints.js";
import { detectSiteEvidence } from "../../src/domain/evidence/detectSiteEvidence.js";
import type { EntryPointProbe, SiteSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";

const POLICY = { resolve: async () => ["93.184.216.34"] };
const base = new URL("https://alpina.travel/");

function page(jsonLd: unknown): Document {
  return parseHTML(`<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`).document;
}

describe("the entry points a site declares", () => {
  it("reads read and write actions on the site's origin, and leaves the search action to its own executor", () => {
    const found = findEntryPoints(
      page({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "WebSite",
            potentialAction: [
              { "@type": "SearchAction", target: { urlTemplate: "https://alpina.travel/search?q={search_term_string}" } },
              { "@type": "ViewAction", name: "See the apartment", target: "https://alpina.travel/lungau/apartments/samspitze-4-mariapfarr/" },
            ],
          },
          {
            "@type": "LodgingBusiness",
            name: "Samspitze 4",
            potentialAction: [
              { "@type": "CheckAction", target: { urlTemplate: "https://alpina.travel/api/booking/availability?q={query}", httpMethod: "GET" } },
              { "@type": "ReserveAction", target: { urlTemplate: "https://alpina.travel/api/booking/reserve", httpMethod: "POST" } },
              { "@type": "ViewAction", target: "https://elsewhere.example/apartment" },
            ],
          },
        ],
      }),
      base,
      "https://alpina.travel/",
    );

    expect(found.map((entry) => [entry.actionType, entry.actionId, entry.read])).toEqual([
      ["ViewAction", "detail.retrieve", true],
      ["CheckAction", "availability.check", true],
      ["ReserveAction", "checkout.create", false],
    ]);
  });

  it("dedupes the same declaration across scripts", () => {
    const action = { "@type": "ViewAction", target: "https://alpina.travel/x" };
    const html = `<script type="application/ld+json">${JSON.stringify({ "@type": "Thing", potentialAction: action })}</script>`;
    const document = parseHTML(`<html><head>${html}${html}</head></html>`).document;
    expect(findEntryPoints(document, base, "https://alpina.travel/")).toHaveLength(1);
  });
});

describe("executing an entry point", () => {
  afterEach(() => vi.unstubAllGlobals());

  const entry = (overrides: Partial<Parameters<typeof executeEntryPoint>[0]> = {}) => ({
    actionType: "CheckAction",
    actionId: "availability.check",
    template: "https://alpina.travel/api/availability?q={query}",
    httpMethod: "GET",
    read: true,
    sourceUrl: "https://alpina.travel/",
    ...overrides,
  });

  it("never executes a write, and says so", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const probe = await executeEntryPoint(entry({ actionType: "ReserveAction", actionId: "checkout.create", read: false, httpMethod: "POST" }), "lungau", POLICY);
    expect(probe.invoked).toBe(false);
    expect(probe.note).toMatch(/never sends|would write/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("leaves an entry point alone when it needs an input the audit cannot supply", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const probe = await executeEntryPoint(entry({ template: "https://alpina.travel/api/availability?from={checkIn}&to={checkOut}" }), "lungau", POLICY);
    expect(probe.invoked).toBe(false);
    expect(probe.note).toContain("checkIn");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("executes a read once, fills the query from the page, and judges the answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => new Response(`<html><body>Results for lungau at ${String(url)}</body></html>`, { status: 200, headers: { "content-type": "text/html" } })),
    );
    const probe = await executeEntryPoint(entry(), "lungau", POLICY);
    expect(probe.invoked).toBe(true);
    expect(probe.ok).toBe(true);
    expect(probe.url).toContain("q=lungau");
  });

  it("records a failure with its reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("gone", { status: 404 })));
    const probe = await executeEntryPoint(entry(), "lungau", POLICY);
    expect(probe.invoked).toBe(true);
    expect(probe.ok).toBe(false);
    expect(probe.note).toBe("it answered HTTP 404");
  });
});

describe("what an executed entry point proves", () => {
  function snapshotWith(entryPoints: EntryPointProbe[]): SiteSnapshot {
    return {
      requestedUrl: "https://alpina.travel/",
      canonicalUrl: "https://alpina.travel/",
      title: "Alpina",
      description: "",
      pages: [],
      text: "",
      headings: [],
      linkPaths: [],
      linkLabels: [],
      forms: [],
      jsonLdTypes: [],
      discovery: [],
      pageTools: [],
      mcpEndpoints: [],
      entryPoints,
      softNotFound: false,
      truncated: false,
    };
  }
  const probe = (overrides: Partial<EntryPointProbe>): EntryPointProbe => ({
    actionType: "CheckAction",
    actionId: "availability.check",
    template: "https://alpina.travel/api/availability?q={query}",
    url: "https://alpina.travel/api/availability?q=lungau",
    sourceUrl: "https://alpina.travel/",
    status: 200,
    invoked: true,
    ok: true,
    ...overrides,
  });

  it("an entry point that answered is invocation evidence for its action", () => {
    const detection = detectSiteEvidence(snapshotWith([probe({})]), "2026-09-07T10:00:00.000Z");
    const evidence = detection.evidence.find((item) => item.id.startsWith("entry-point-"));
    expect(evidence).toMatchObject({ actionId: "availability.check", audience: "agent", verification: "invoked", kind: "api-result" });
    expect(detection.signals).toContain("agent:entry-point");
  });

  it("one that failed is a failed declaration, with the reason", () => {
    const detection = detectSiteEvidence(snapshotWith([probe({ ok: false, status: 500, note: "it answered HTTP 500" })]), "2026-09-07T10:00:00.000Z");
    const evidence = detection.evidence.find((item) => item.id.startsWith("entry-point-"));
    expect(evidence?.verification).toBe("failed");
    expect(evidence?.claim).toContain("HTTP 500");
  });

  it("one that was not called stays declared, and says why it was not", () => {
    const detection = detectSiteEvidence(
      snapshotWith([probe({ actionType: "ReserveAction", actionId: "checkout.create", invoked: false, ok: false, status: 0, note: "it would write: a reservation, a purchase, a message" })]),
      "2026-09-07T10:00:00.000Z",
    );
    const evidence = detection.evidence.find((item) => item.id.startsWith("entry-point-"));
    expect(evidence?.verification).toBe("declared");
    expect(evidence?.claim).toContain("would write");
  });
});

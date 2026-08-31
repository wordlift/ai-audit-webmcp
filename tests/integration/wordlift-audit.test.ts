import { AuditProviderError, WordLiftAuditProvider } from "../../src/server/adapters/audit/WordLiftAudit.js";

/** Shaped after a real `POST https://api.wordlift.io/audit` response, trimmed for the test. */
const liveShapedResponse = {
  success: true,
  data: {
    url: "https://alpina.travel/",
    domain: "https://alpina.travel",
    timestamp: "2026-08-27T08:44:18.926Z",
    summary: "Alpina.travel demonstrates a strong commitment to both traditional SEO and agent readiness.",
    siteFiles: {
      score: 8,
      status: "Good",
      explanation: "robots.txt is well configured.",
      robotsTxt: "found",
      llmsTxt: "found",
      hasLlmsTxt: true,
      hasSkillMd: true,
      botStatus: [{ name: "GPTBot", vendor: "OpenAI", status: "Allowed" }],
      wellKnown: { mcpJson: true, mcpServerCard: true, webmcpToolsJson: true, mcpLinkTag: false, agentSkillsCount: 0 },
    },
    seoFundamentals: { score: 20, status: "Good", title: "Lungau Holidays", description: "Alpine holiday apartments." },
    structuredData: {
      score: 15,
      status: "Good",
      hasJsonLd: true,
      detectedSchemas: [
        { type: "Organization", format: "JSON-LD" },
        { type: "LodgingBusiness", format: "JSON-LD" },
        { type: "Offer", format: "JSON-LD" },
      ],
    },
    automationReadiness: {
      score: 10,
      status: "Good",
      issues: [{ priority: "P1", criterion: "Agent Discovery", what: "Discovery files return invalid JSON." }],
    },
    jsRendering: { score: 15, status: "Good", frameworkDetected: "Astro", renderingType: "SSR" },
    quickWins: { status: "Needs Improvement", wins: [{ title: "Correct .well-known JSON endpoints", impact: "High" }] },
    overallScore: 94,
    score: 94,
    status: "completed",
    // A field the public adapter has never seen must not break the mapping.
    experimentalNewCriterion: { score: 3, note: "added after this build shipped" },
  },
};

function provider(fetchImpl: typeof fetch) {
  return new WordLiftAuditProvider({
    baseUrl: "https://api.wordlift.io",
    apiKey: "test-key",
    fetchImpl,
    now: () => new Date("2026-08-27T09:00:00.000Z"),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("WordLift audit provider", () => {
  it("calls the documented endpoint with a server-side key and never leaks it into the bundle", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(liveShapedResponse));
    const bundle = await provider(fetchImpl as unknown as typeof fetch).audit(new URL("https://alpina.travel/"));

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.wordlift.io/audit");
    expect((init.headers as Record<string, string>).authorization).toBe("Key test-key");
    expect(JSON.parse(String(init.body))).toEqual({ url: "https://alpina.travel/" });
    expect(JSON.stringify(bundle)).not.toMatch(/test-key/);
  });

  it("maps the foundation score, summary, and findings without blending them into readiness", async () => {
    const bundle = await provider(vi.fn(async () => jsonResponse(liveShapedResponse)) as unknown as typeof fetch).audit(
      new URL("https://alpina.travel/"),
    );

    expect(bundle.status).toBe("completed");
    expect(bundle.foundation).toMatchObject({ score: 94, provider: "wordlift-ai-audit" });
    expect(bundle.foundation?.findings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Quick win: Correct .well-known JSON endpoints"),
        expect.stringContaining("Automation gap: Agent Discovery"),
      ]),
    );
    expect(bundle.foundation?.sections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "site-files", label: "Site files & agent discovery" }),
        expect.objectContaining({ id: "structured-data", label: "Structured data inventory" }),
        expect.objectContaining({ id: "automation-readiness", label: "Automation readiness" }),
      ]),
    );
    expect(bundle.foundation?.quickWins).toContainEqual({
      title: "Correct .well-known JSON endpoints",
      impact: "High",
    });
    expect(bundle.foundation).toMatchObject({
      collectedAt: "2026-08-27T09:00:00.000Z",
      sourceUrl: "https://alpina.travel/",
    });
    expect(bundle.foundation?.sections).toContainEqual(
      expect.objectContaining({
        id: "experimental-new-criterion",
        label: "Experimental New Criterion",
        score: 3,
        details: [{ label: "Note", value: "added after this build shipped" }],
      }),
    );
    // Foundation score is separate: the bundle contributes no verified invocation evidence.
    expect(bundle.evidence.every((item) => item.verification === "declared")).toBe(true);
  });

  it("preserves the documented nested response and every safe future criterion", async () => {
    const response = {
      success: true,
      data: {
        url: "https://example.com/",
        timestamp: "2026-08-31T04:00:00.000Z",
        status: "completed",
        results: {
          score: 67,
          summary: "A documented nested audit response.",
          robotsTxt: { status: "found", botStatus: [{ name: "GPTBot", status: "Allowed" }] },
          llmsTxt: { status: "found" },
          semanticHtml: { score: 8, status: "Good", headings: ["Products", "Support"] },
          contentFreshness: {
            score: 4,
            status: "Needs Improvement",
            recommendations: ["Publish visible modification dates", "Refresh the product documentation"],
            diagnostics: { oldestPageDays: 721, rawHtml: "<html>must not survive</html>", apiKey: "secret" },
          },
          jsRendering: {
            status: "Good",
            aiAccessibility: "Excellent",
            contentAvailability: "All content in HTML",
            recommendations: [],
          },
        },
      },
    };

    const bundle = await provider(vi.fn(async () => jsonResponse(response)) as unknown as typeof fetch).audit(
      new URL("https://example.com/"),
    );

    expect(bundle.foundation).toMatchObject({ score: 67, summary: "A documented nested audit response." });
    expect(bundle.signals).toContain("agent:llms-txt");
    const freshness = bundle.foundation?.sections.find((section) => section.id === "content-freshness");
    expect(freshness).toMatchObject({ score: 4, status: "Needs Improvement" });
    expect(freshness?.details).toEqual(expect.arrayContaining([
      { label: "Recommendations · 1", value: "Publish visible modification dates" },
      { label: "Diagnostics · Oldest Page Days", value: "721" },
    ]));
    expect(JSON.stringify(bundle.foundation)).not.toMatch(/must not survive|secret/);
    expect(bundle.foundation?.findings).toEqual(expect.arrayContaining([
      expect.stringContaining("Content Freshness"),
      expect.stringContaining("Publish visible modification dates"),
    ]));
  });

  it("derives archetype signals and declared agent evidence from the real response shape", async () => {
    const bundle = await provider(vi.fn(async () => jsonResponse(liveShapedResponse)) as unknown as typeof fetch).audit(
      new URL("https://alpina.travel/"),
    );

    expect(bundle.signals).toEqual(
      expect.arrayContaining([
        "schema:LodgingBusiness",
        "schema:Offer",
        "agent:llms-txt",
        "agent:skill-md",
        "agent:mcp-json",
        "agent:well-known-tools-json",
        "framework:Astro",
      ]),
    );

    // A `.well-known` tools file is not part of WebMCP, so it must never produce WebMCP evidence.
    expect(bundle.evidence.some((item) => item.kind === "webmcp")).toBe(false);
    expect(bundle.evidence.some((item) => item.actionId === "offer.lookup")).toBe(true);
  });

  it.each([
    [401, "audit_unauthorized", false],
    [429, "audit_rate_limited", true],
    [500, "audit_upstream_error", true],
  ])("maps HTTP %s to a typed provider error", async (status, code, retryable) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, status));
    const call = provider(fetchImpl as unknown as typeof fetch).audit(new URL("https://alpina.travel/"));

    await expect(call).rejects.toBeInstanceOf(AuditProviderError);
    await expect(call).rejects.toMatchObject({ code, retryable });
  });

  it("reports an unreachable service instead of throwing a raw network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });

    await expect(provider(fetchImpl as unknown as typeof fetch).audit(new URL("https://alpina.travel/"))).rejects.toMatchObject({
      code: "audit_unreachable",
    });
  });

  it("fails closed when the service returns no data", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: true }));

    await expect(provider(fetchImpl as unknown as typeof fetch).audit(new URL("https://alpina.travel/"))).rejects.toMatchObject({
      code: "audit_empty_response",
    });
  });
});

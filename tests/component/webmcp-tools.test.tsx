// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/client/App";
import { installModelContextStub, toolText, type ModelContextStub } from "../../src/client/webmcp/testing/modelContextStub";
import type { ReportRecord } from "../../src/shared/types/index.js";

const REPORT_ID = "4a8a04c0-e247-4bec-a440-d9f3506f9212";

const completedReport: ReportRecord = {
  id: REPORT_ID,
  status: "completed",
  phase: "complete",
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://alpina.travel/",
  createdAt: "2026-08-27T05:00:00.000Z",
  completedAt: "2026-08-27T05:00:41.000Z",
  expiresAt: "2026-09-26T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  classification: {
    primaryArchetype: "travel-hospitality",
    categories: [{ name: "/Travel & Transportation/Hotels & Accommodations", confidence: 0.92 }],
    rankedArchetypes: [
      { archetype: "travel-hospitality", score: 6.4 },
      { archetype: "other", score: 1.1 },
    ],
    confidence: "high",
    margin: 5.3,
    provisional: false,
    model: "google-v2-fixture",
    collectedAt: "2026-08-27T05:00:10.000Z",
  },
  contextGraph: {
    pages: [
      {
        url: "https://alpina.travel/",
        title: "Alpina.travel",
        role: "entry",
        headings: ["Find an alpine stay"],
        entityIds: ["https://alpina.travel/#stay"],
      },
      {
        url: "https://alpina.travel/booking",
        title: "Check availability",
        role: "offer",
        headings: ["Choose dates"],
        entityIds: ["https://alpina.travel/#stay"],
      },
    ],
    entities: [{
      id: "https://alpina.travel/#stay",
      types: ["LodgingBusiness"],
      name: "AlpiNest",
      alternateNames: [],
      sourceUrls: ["https://alpina.travel/", "https://alpina.travel/booking"],
      sameAs: [],
      offers: [],
      confidence: 0.95,
    }],
    lexicalEntries: [],
    interfaces: [{
      id: "interface:availability-form",
      actionId: "availability.check",
      entityIds: ["https://alpina.travel/#stay"],
      name: "Check availability via form",
      protocol: "human-form",
      audience: "human",
      status: "observed",
      sourceUrl: "https://alpina.travel/booking",
      evidenceId: "availability-form",
    }],
    bindings: [{
      entityId: "https://alpina.travel/#stay",
      actionId: "availability.check",
      role: "object",
      basis: ["archetype", "observed-interface"],
      state: "human-only",
      evidenceIds: ["availability-form"],
      interfaceIds: ["interface:availability-form"],
      confidence: 0.9,
    }],
  },
  foundationAudit: {
    score: 71,
    summary: "Strong content foundations with limited agent-facing functions.",
    findings: ["robots.txt allows major agents"],
    sections: [],
    quickWins: [],
    provider: "fixtures",
  },
  capabilities: [
    {
      actionId: "availability.check",
      label: "Check availability",
      description: "Check time-sensitive availability for a date range.",
      stage: "act",
      intent: "informational",
      importance: 3,
      expected: true,
      expectationSource: ["archetype:travel-hospitality"],
      state: "human-only",
      humanSupport: true,
      agentSupport: false,
      appliesTo: [{ id: "https://alpina.travel/#stay", name: "AlpiNest", types: ["LodgingBusiness"] }],
      evidence: [
        {
          id: "availability-form",
          actionId: "availability.check",
          audience: "human",
          kind: "form",
          sourceUrl: "https://alpina.travel/",
          claim: "A booking form accepts dates and guests",
          confidence: 1,
          verification: "observed",
          collectedAt: "2026-08-27T05:00:20.000Z",
        },
      ],
      recommendation: "Expose availability as a read-only agent function.",
      contract: {
        "@context": ["https://schema.org"],
        "@id": "https://alpina.travel/#action/availability.check",
        "@type": ["Action"],
        name: "Check availability",
        object: { "@id": "https://alpina.travel/" },
        stage: "act",
        intent: "informational",
        inputSchema: { type: "object" },
        outputSchema: { type: "object" },
        governance: {
          requiresAuthentication: false,
          requiresAuthorization: false,
          requiresConfirmation: false,
          sideEffects: "none",
        },
        recommendedDelivery: "approved-sidecar",
        modelVersion: "0.1.0",
        expectationSource: ["archetype:travel-hospitality"],
      },
    },
    {
      actionId: "search.find",
      label: "Find a stay",
      description: "Search the site catalogue.",
      stage: "discover",
      intent: "informational",
      importance: 3,
      expected: true,
      expectationSource: ["archetype:travel-hospitality"],
      state: "agent-ready",
      humanSupport: true,
      agentSupport: true,
      appliesTo: [],
      evidence: [],
    },
  ],
  score: {
    value: 38,
    verifiedWeight: 3,
    expectedWeight: 8,
    counts: { expected: 2, ready: 1, unverified: 0, humanOnly: 1, missing: 0 },
  },
  priorities: [
    {
      actionId: "availability.check",
      label: "Check availability",
      state: "human-only",
      priorityScore: 9,
      reason: "People can check dates on the site, but no agent-callable function exists.",
    },
  ],
  errors: [],
  evidenceTruncated: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

let modelContext: ModelContextStub;

beforeEach(() => {
  modelContext = installModelContextStub();
});

afterEach(() => {
  modelContext.uninstall();
  vi.unstubAllGlobals();
});

describe("WebMCP tool layer", () => {
  it("registers audit-website globally with a static, safe description", async () => {
    render(<MemoryRouter><App /></MemoryRouter>);

    await waitFor(() => expect(modelContext.toolNames()).toEqual(["audit-website"]));
    const tool = modelContext.get("audit-website");
    expect(tool?.description).toMatch(/verified action-readiness score/);
    expect(tool?.annotations).toMatchObject({ readOnlyHint: true });
    expect(JSON.stringify(tool?.inputSchema)).not.toMatch(/alpina/i);
    expect(await screen.findByTestId("webmcp-badge")).toBeVisible();
  });

  it("resolves audit-website only when a terminal report exists and returns structured findings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/reports" && init?.method === "POST") {
          return jsonResponse({ reportId: REPORT_ID, phase: "understanding", retryUrl: `/api/reports/${REPORT_ID}` }, 202);
        }
        if (url === `/api/reports/${REPORT_ID}`) return jsonResponse(completedReport);
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => expect(modelContext.get("audit-website")).toBeDefined());

    const result = await act(async () => modelContext.call("audit-website", { url: "alpina.travel" }));

    expect(result.isError).toBeFalsy();
    const text = toolText(result);
    expect(text).toMatch(/travel\/hospitality/);
    expect(text).toMatch(/Verified agent readiness: 38\/100/);
    expect(text).toMatch(/AI Audit foundation score: 71\/100/);
    expect(text).toMatch(/act 0\/1/);
    expect(text).toContain(`/reports/${REPORT_ID}`);
    expect(text).not.toMatch(/audit started/i);
    expect(result.structuredContent).toMatchObject({
      reportId: REPORT_ID,
      archetype: "travel-hospitality",
      agentReadinessScore: 38,
      partial: false,
      pagesAnalyzed: 2,
      entities: [{ id: "https://alpina.travel/#stay", name: "AlpiNest", types: ["LodgingBusiness"] }],
      stages: { act: { ready: 0, expected: 1 }, discover: { ready: 1, expected: 1 } },
    });
  });

  it("returns tool errors as errors instead of throwing into the agent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "forbidden_url", message: "That destination is not a public website" }, 403)),
    );

    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => expect(modelContext.get("audit-website")).toBeDefined());

    const result = await act(async () => modelContext.call("audit-website", { url: "http://127.0.0.1" }));

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/not a public website/);
  });

  it("rejects an unknown archetype without contacting the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => expect(modelContext.get("audit-website")).toBeDefined());

    const result = await act(async () => modelContext.call("audit-website", { url: "alpina.travel", archetype: "airline" }));

    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/Unknown archetype/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scopes explain-capability to the visible report and unregisters it on unmount", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(completedReport)));

    const view = render(
      <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
        <App />
      </MemoryRouter>,
    );

    // The Alpina report also enables the approved sidecar tool for its own host.
    await waitFor(() =>
      expect(modelContext.toolNames()).toEqual(["audit-website", "check-alpina-availability", "explain-capability"]),
    );

    const result = await act(async () => modelContext.call("explain-capability", { actionId: "availability.check" }));
    const text = toolText(result);
    expect(text).toMatch(/human only/);
    expect(text).toMatch(/Human support: yes\. Agent support: no\./);
    expect(text).toMatch(/Expose availability as a read-only agent function/);
    expect(text).toMatch(/contracts\/availability.check/);
    expect(result.structuredContent).toMatchObject({
      actionId: "availability.check",
      state: "human-only",
      appliesTo: [{ id: "https://alpina.travel/#stay", name: "AlpiNest" }],
      interfaces: [{ protocol: "human-form", status: "observed" }],
    });

    const missing = await act(async () => modelContext.call("explain-capability", { actionId: "does.not.exist" }));
    expect(missing.isError).toBe(true);
    expect(toolText(missing)).toMatch(/Known actions: availability.check, search.find/);

    view.unmount();
    await waitFor(() => expect(modelContext.toolNames()).toEqual([]));
  });

  it("keeps the normal web interface working when WebMCP is unavailable", () => {
    modelContext.uninstall();
    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.queryByTestId("webmcp-badge")).toBeNull();
  });
});

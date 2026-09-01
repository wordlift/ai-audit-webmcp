// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "../../src/client/App";
import { AuditWebsiteTool } from "../../src/client/webmcp/AuditWebsiteTool";
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
      {
        url: "https://alpina.travel/experiences",
        title: "Alpine experiences",
        role: "detail",
        headings: ["Things to do"],
        entityIds: ["https://alpina.travel/#stay"],
      },
      {
        url: "https://alpina.travel/faq",
        title: "Guest information",
        role: "policy",
        headings: ["Guest information"],
        entityIds: [],
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

    await waitFor(() => expect(modelContext.toolNames()).toEqual(["audit-website", "get-audit-report"]));
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
    expect(text).toMatch(/Foundation audit: Strong content foundations/);
    expect(text).toMatch(/robots\.txt allows major agents/);
    expect(text).toMatch(/act 0\/1/);
    expect(text).toContain(`/reports/${REPORT_ID}`);
    expect(text).not.toMatch(/audit started/i);
    expect(result.structuredContent).toMatchObject({
      reportId: REPORT_ID,
      archetype: "travel-hospitality",
      agentReadinessScore: 38,
      foundationSummary: "Strong content foundations with limited agent-facing functions.",
      foundationFindings: ["robots.txt allows major agents"],
      partial: false,
      pagesAnalyzed: 4,
      entities: [{ id: "https://alpina.travel/#stay", name: "AlpiNest", types: ["LodgingBusiness"] }],
      stages: { act: { ready: 0, expected: 1 }, discover: { ready: 1, expected: 1 } },
    });
  });

  it("answers with the report id and the status tool when the audit outlives the grace window", async () => {
    // The tool mints its own report id; the stub answers whichever id it asks about.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/reports" && init?.method === "POST") {
          const body = JSON.parse(String(init?.body)) as { requestId: string };
          return jsonResponse({ reportId: body.requestId, phase: "mapping", retryUrl: `/api/reports/${body.requestId}` }, 202);
        }
        const match = url.match(/^\/api\/reports\/([0-9a-f-]{36})$/);
        if (match) {
          return jsonResponse({
            id: match[1],
            status: "running",
            phase: "mapping",
            mode: "live",
            requestedUrl: "https://slow.example/",
            createdAt: "2026-08-27T05:00:00.000Z",
            expiresAt: "2026-09-26T05:00:00.000Z",
            actionModelVersion: "0.1.0",
            contextGraph: completedReport.contextGraph,
            errors: [],
            evidenceTruncated: false,
          } satisfies ReportRecord);
        }
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    // The grace window is tiny and the background poll is frozen, so the early answer is forced.
    render(<AuditWebsiteTool graceMs={10} pollWaitMs={() => new Promise(() => undefined)} />);
    await waitFor(() => expect(modelContext.get("audit-website")).toBeDefined());

    const result = await act(async () => modelContext.call("audit-website", { url: "slow.example" }));

    expect(result.isError).toBeFalsy();
    const payload = result.structuredContent as { reportId: string };
    expect(result.structuredContent).toMatchObject({
      status: "running",
      phase: "mapping",
      statusTool: "get-audit-report",
      pagesAnalyzed: 4,
    });
    const text = toolText(result);
    expect(text).toMatch(/still running \(phase: mapping\)/);
    expect(text).toMatch(/get-audit-report/);
    expect(text).toContain(payload.reportId);
    expect(text).not.toMatch(/Verified agent readiness/);
  });

  it("turns a reportId into progress while running and into the finished summary once terminal", async () => {
    const runningReport: ReportRecord = {
      id: REPORT_ID,
      status: "running",
      phase: "checking",
      mode: "live",
      requestedUrl: "https://alpina.travel/",
      createdAt: "2026-08-27T05:00:00.000Z",
      expiresAt: "2026-09-26T05:00:00.000Z",
      actionModelVersion: "0.1.0",
      foundationAudit: completedReport.foundationAudit,
      errors: [],
      evidenceTruncated: false,
    };
    const responses = [jsonResponse(runningReport), jsonResponse(completedReport)];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        // The home page's own health probe is not the audit API.
        if (String(input).endsWith("/api/health")) return jsonResponse({ status: "ok", mode: "demo" });
        return responses.shift() ?? jsonResponse(completedReport);
      }),
    );

    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => expect(modelContext.get("get-audit-report")).toBeDefined());

    const pending = await act(async () => modelContext.call("get-audit-report", { reportId: REPORT_ID }));
    expect(pending.isError).toBeFalsy();
    expect(toolText(pending)).toMatch(/still running \(phase: checking\)/);
    expect(toolText(pending)).toMatch(/foundation audit has landed/);

    const finished = await act(async () => modelContext.call("get-audit-report", { reportId: REPORT_ID }));
    expect(finished.isError).toBeFalsy();
    expect(toolText(finished)).toMatch(/Verified agent readiness: 38\/100/);
    expect(finished.structuredContent).toMatchObject({ reportId: REPORT_ID, agentReadinessScore: 38 });
  });

  it("reports a failed audit as an error through get-audit-report", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          ...completedReport,
          status: "failed",
          capabilities: undefined,
          score: undefined,
          priorities: undefined,
          contextGraph: undefined,
          classification: undefined,
          foundationAudit: undefined,
          errors: [{ code: "site_blocked", phase: "understanding", message: "The site refused automated access.", retryable: false }],
        }),
      ),
    );

    render(<MemoryRouter><App /></MemoryRouter>);
    await waitFor(() => expect(modelContext.get("get-audit-report")).toBeDefined());

    const result = await act(async () => modelContext.call("get-audit-report", { reportId: REPORT_ID }));
    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/could not be completed/);
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
    // The home page's own health probe is not the audit API.
    const auditCalls = fetchMock.mock.calls.filter(([input]) => !String(input).endsWith("/api/health"));
    expect(auditCalls).toHaveLength(0);
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
      expect(modelContext.toolNames()).toEqual([
        "audit-website",
        "check-alpina-availability",
        "explain-capability",
        "explain-foundation-audit",
        "get-audit-report",
        "inspect-service-map",
        "refine-service-map",
      ]),
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

    const foundation = await act(async () => modelContext.call("explain-foundation-audit", { reportId: REPORT_ID }));
    expect(toolText(foundation)).toMatch(/foundation score of 71\/100/);
    expect(toolText(foundation)).toMatch(/Main WordLift AI Audit: https:\/\/audit\.wordlift\.io/);
    expect(foundation.structuredContent).toMatchObject({
      reportId: REPORT_ID,
      score: 71,
      findings: ["robots.txt allows major agents"],
      mainAuditUrl: "https://audit.wordlift.io",
    });

    const missing = await act(async () => modelContext.call("explain-capability", { actionId: "does.not.exist" }));
    expect(missing.isError).toBe(true);
    expect(toolText(missing)).toMatch(/Known actions: availability.check, search.find/);

    view.unmount();
    await waitFor(() => expect(modelContext.toolNames()).toEqual([]));
  });

  it("registers the report tools the moment the route mounts, before the report has loaded", async () => {
    const runningReport: ReportRecord = {
      id: REPORT_ID,
      status: "running",
      phase: "mapping",
      mode: "live",
      requestedUrl: "https://alpina.travel/",
      createdAt: "2026-08-27T05:00:00.000Z",
      expiresAt: "2026-09-26T05:00:00.000Z",
      actionModelVersion: "0.1.0",
      errors: [],
      evidenceTruncated: false,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/api/health")) return jsonResponse({ status: "ok", mode: "demo" });
        return jsonResponse(runningReport);
      }),
    );

    render(
      <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
        <App />
      </MemoryRouter>,
    );

    // The page still shows progress, but the agent interface is already discoverable.
    await waitFor(() =>
      expect(modelContext.toolNames()).toEqual(
        expect.arrayContaining(["inspect-service-map", "explain-capability", "explain-foundation-audit", "refine-service-map"]),
      ),
    );
    const result = await act(async () => modelContext.call("inspect-service-map", {}));
    expect(result.isError).toBe(true);
    expect(toolText(result)).toMatch(/still running \(phase: mapping\)/);
  });

  it("gives an agent the whole interview brief through inspect-service-map", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(completedReport)));

    render(
      <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(modelContext.get("inspect-service-map")).toBeDefined());

    const result = await act(async () => modelContext.call("inspect-service-map", { reportId: REPORT_ID }));

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      reportId: REPORT_ID,
      refined: false,
      operatingRole: { inferred: "travel-hospitality", source: "machine-inferred" },
    });
    const payload = result.structuredContent as {
      entities: Array<{ name: string; machinePriority: string }>;
      actions: Array<{ actionId: string; agentReady: boolean; boundary: string | null }>;
      nextStep: string;
    };
    expect(payload.entities).toContainEqual(expect.objectContaining({ name: "AlpiNest", machinePriority: "primary" }));
    expect(payload.actions).toContainEqual(
      expect.objectContaining({ actionId: "availability.check", agentReady: false, boundary: null }),
    );
    expect(payload.nextStep).toMatch(/refine-service-map/);
    const text = toolText(result);
    expect(text).toMatch(/Machine-generated service map/);
    expect(text).toMatch(/availability\.check/);
  });

  it("compiles a reviewer's decisions into an immutable refined report through refine-service-map", async () => {
    const CHILD_ID = "9b1c22de-3f44-4a55-8b66-77cc88dd99ee";
    const refinedReport: ReportRecord = {
      ...completedReport,
      id: CHILD_ID,
      parentReportId: REPORT_ID,
      classification: { ...completedReport.classification!, businessRole: "destination-organization" },
      capabilities: completedReport.capabilities!.map((capability) =>
        capability.actionId === "availability.check"
          ? {
              ...capability,
              boundary: "partner-handoff" as const,
              boundarySource: "human-provided" as const,
              boundaryRationale: "Partners own the inventory.",
            }
          : capability,
      ),
      refinement: {
        assertions: {
          businessRole: "destination-organization",
          actionDecisions: [
            { actionId: "availability.check", decision: "confirm", boundary: "partner-handoff", rationale: "Partners own the inventory." },
          ],
        },
        decisions: 2,
        conflicts: [],
        provenance: "human-provided",
        appliedAt: "2026-09-01T10:00:00.000Z",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/health")) return jsonResponse({ status: "ok", mode: "demo" });
        if (url === `/api/reports/${REPORT_ID}/refine` && init?.method === "POST") return jsonResponse(refinedReport);
        if (url === `/api/reports/${REPORT_ID}`) return jsonResponse(completedReport);
        throw new Error(`Unexpected request ${url}`);
      }),
    );

    render(
      <MemoryRouter initialEntries={[`/reports/${REPORT_ID}`]}>
        <App />
      </MemoryRouter>,
    );
    await waitFor(() => expect(modelContext.get("refine-service-map")).toBeDefined());

    const result = await act(async () =>
      modelContext.call("refine-service-map", {
        businessRole: "destination-organization",
        actionDecisions: [
          { actionId: "availability.check", decision: "confirm", boundary: "partner-handoff", rationale: "Partners own the inventory." },
        ],
      }),
    );

    expect(result.isError).toBeFalsy();
    const text = toolText(result);
    expect(text).toMatch(/Human-refined service map created/);
    expect(text).toContain(`/reports/${CHILD_ID}`);
    expect(text).toMatch(/Check availability \(availability\.check\) → partner handoff/);
    expect(text).toMatch(/never mark an action agent-ready/);
    expect(result.structuredContent).toMatchObject({
      parentReportId: REPORT_ID,
      reportId: CHILD_ID,
      decisionsApplied: 2,
      businessRole: "destination-organization",
      boundaries: [{ actionId: "availability.check", boundary: "partner-handoff" }],
    });
  });

  it("keeps the normal web interface working when WebMCP is unavailable", () => {
    modelContext.uninstall();
    render(<MemoryRouter><App /></MemoryRouter>);

    expect(screen.getByLabelText(/website url/i)).toBeVisible();
    expect(screen.queryByTestId("webmcp-badge")).toBeNull();
  });
});

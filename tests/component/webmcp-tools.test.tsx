// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { createReport } from "../../src/client/api/client";
import { AuditWebsiteTool, ExplainCapabilityTool } from "../../src/client/webmcp/WebMCPTools";
import type { ReportRecord } from "../../src/shared/types/index.js";

vi.mock("../../src/client/api/client", () => ({ createReport: vi.fn() }));

type RegisteredTool = {
  name: string;
  description: string;
  inputSchema?: object;
  annotations?: object;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

const registered = new Map<string, RegisteredTool>();

const report: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "completed",
  phase: "complete",
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://alpina.travel/",
  createdAt: "2026-08-27T05:00:00.000Z",
  completedAt: "2026-08-27T05:00:01.000Z",
  expiresAt: "2026-09-03T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  classification: {
    primaryArchetype: "travel-hospitality",
    categories: [{ name: "/Travel/Hotels & Accommodations", confidence: 0.96 }],
    rankedArchetypes: [{ archetype: "travel-hospitality", score: 0.96 }],
    confidence: "high",
    margin: 0.8,
    provisional: false,
    model: "fixture-v2",
    collectedAt: "2026-08-27T05:00:00.000Z",
  },
  foundationAudit: { score: 86, summary: "Strong foundation.", findings: [], provider: "fixtures" },
  capabilities: [{
    actionId: "availability.check",
    label: "Check availability",
    description: "Check time-sensitive availability.",
    stage: "act",
    intent: "informational",
    importance: 3,
    expected: true,
    expectationSource: ["archetype:travel-hospitality"],
    state: "unverified",
    humanSupport: true,
    agentSupport: false,
    evidence: [],
    recommendation: "Expose a controlled availability function.",
  }],
  score: { value: 0, verifiedWeight: 0, expectedWeight: 3, counts: { expected: 1, ready: 0, unverified: 1, humanOnly: 0, missing: 0 } },
  priorities: [{ actionId: "availability.check", label: "Check availability", state: "unverified", priorityScore: 9, reason: "Invocation proof is missing." }],
  errors: [],
  evidenceTruncated: false,
};

function installModelContext() {
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool(tool: RegisteredTool, options: { signal: AbortSignal }) {
        registered.set(tool.name, tool);
        options.signal.addEventListener("abort", () => registered.delete(tool.name), { once: true });
      },
    },
  });
}

describe("WebMCP audit tools", () => {
  beforeEach(() => {
    registered.clear();
    installModelContext();
    vi.mocked(createReport).mockResolvedValue(report);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "modelContext");
  });

  it("returns a completed structured audit rather than an audit-started acknowledgement", async () => {
    const view = render(<AuditWebsiteTool />);
    await waitFor(() => expect(registered.has("audit-website")).toBe(true));
    const tool = registered.get("audit-website")!;
    expect(tool.description).not.toContain("alpina.travel");
    expect(tool.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });

    const response = await tool.execute({ url: "https://alpina.travel" });
    expect(response).not.toHaveProperty("isError");
    expect(response.structuredContent).toMatchObject({
      status: "completed",
      reportUrl: "http://localhost:3000/reports/4a8a04c0-e247-4bec-a440-d9f3506f9212",
      stageCounts: { discover: 0, "understand-decide": 0, act: 1, manage: 0 },
      scores: { agentReadiness: 0, auditFoundation: 86 },
    });
    expect(JSON.stringify(response)).not.toContain("audit started");
    view.unmount();
    await waitFor(() => expect(registered.has("audit-website")).toBe(false));
  });

  it("normalizes execution failures into explicit tool errors", async () => {
    vi.mocked(createReport).mockRejectedValue(new Error("Fixture provider unavailable"));
    render(<AuditWebsiteTool />);
    await waitFor(() => expect(registered.has("audit-website")).toBe(true));
    await expect(registered.get("audit-website")!.execute({ url: "https://alpina.travel" })).resolves.toMatchObject({
      isError: true,
      content: [{ type: "text", text: "Fixture provider unavailable" }],
    });
  });

  it("registers explain-capability only for the visible report lifecycle", async () => {
    const view = render(<ExplainCapabilityTool report={report} />);
    await waitFor(() => expect(registered.has("explain-capability")).toBe(true));
    const response = await registered.get("explain-capability")!.execute({ actionId: "availability.check" });
    expect(response.structuredContent).toMatchObject({
      reportId: report.id,
      actionId: "availability.check",
      state: "unverified",
      humanSupport: true,
      agentSupport: false,
    });
    view.unmount();
    await waitFor(() => expect(registered.has("explain-capability")).toBe(false));
  });

  it("keeps the normal interface independent when the browser has no WebMCP API", () => {
    Reflect.deleteProperty(document, "modelContext");
    expect(() => render(<AuditWebsiteTool />)).not.toThrow();
    expect(registered.size).toBe(0);
  });
});

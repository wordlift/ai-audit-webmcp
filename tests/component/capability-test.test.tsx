// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CapabilityTest, testable } from "../../src/client/components/CapabilityTest";
import type { CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

const ENDPOINT = "https://alpina.travel/mcp/alpina/http/mcp";
const report = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://www.alpina.travel/",
  contextGraph: {
    pages: [], entities: [], lexicalEntries: [], bindings: [],
    interfaces: [{ id: "interface:mcp-tool-get_product", actionId: "detail.retrieve", entityIds: [], name: "get_product", protocol: "mcp", audience: "agent", status: "declared", sourceUrl: ENDPOINT, evidenceId: "e" }],
  },
} as unknown as ReportRecord;
const capability = { actionId: "detail.retrieve", label: "Retrieve details", state: "unverified", evidence: [], appliesTo: [] } as unknown as CapabilityResult;

function Probe() {
  const { id } = useParams();
  return <p>opened {id}</p>;
}

function renderTest() {
  return render(
    <MemoryRouter initialEntries={["/here"]}>
      <Routes>
        <Route path="/here" element={<CapabilityTest report={report} capability={capability} />} />
        <Route path="/reports/:id" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fakeApi(calls: Array<{ url: string; body?: unknown }>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
    if (init?.method !== "POST") {
      return json({ interfaces: [
        { id: `mcp-tool:${ENDPOINT}#get_product`, name: "get_product", protocol: "mcp", endpoint: ENDPOINT, safe: true, description: "One property by id", inputSchema: { type: "object", properties: { id: { type: "string", description: "The property's id" }, checkIn: { type: "string", format: "date" } }, required: ["id"] } },
        { id: `mcp-tool:${ENDPOINT}#purchase`, name: "purchase", protocol: "mcp", endpoint: ENDPOINT, safe: false, note: "The server does not mark this tool read-only, so it is not called from here." },
      ] });
    }
    return json({
      outcome: "answered", latencyMs: 812, answer: "Samspitze 4: 2 bedrooms", request: { endpoint: ENDPOINT, tool: "get_product", arguments: body.arguments }, testedAt: "2026-09-11T08:00:00.000Z",
      ...(body.save ? { updatedReportId: "5b8a04c0-e247-4bec-a440-d9f3506f9213", updatedReportUrl: "/reports/5b8a04c0-e247-4bec-a440-d9f3506f9213" } : {}),
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("test it yourself", () => {
  it("is offered where the report names something a server can reach", () => {
    expect(testable(report, capability)).toBe(true);
    expect(testable({ ...report, contextGraph: { ...report.contextGraph!, interfaces: [] } } as ReportRecord, capability)).toBe(false);
    expect(testable({ ...report, contextGraph: { ...report.contextGraph!, interfaces: [] } } as ReportRecord, { ...capability, actionId: "availability.check" } as CapabilityResult)).toBe(true);
  });

  it("builds the form from the tool's own schema, runs one call with the person's inputs, and saves only on request", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal("fetch", fakeApi(calls));
    renderTest();
    expect(await screen.findByText(/purchase: The server does not mark this tool read-only/)).toBeVisible();
    const id = screen.getByLabelText("Id");
    expect(screen.getByLabelText("Check in (optional)")).toHaveAttribute("type", "date");
    // A required field left empty stops the call before it is made.
    fireEvent.click(screen.getByRole("button", { name: /run the call/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("Id is needed.");
    fireEvent.change(id, { target: { value: "samspitze-4" } });
    fireEvent.click(screen.getByRole("button", { name: /run the call/i }));
    expect(await screen.findByText(/It answered in 0\.8 s/)).toBeVisible();
    expect(screen.getByText("Samspitze 4: 2 bedrooms")).toBeVisible();
    const run = calls.find((call) => call.body && (call.body as { save?: boolean }).save === undefined);
    expect(run?.body).toEqual({ interfaceId: `mcp-tool:${ENDPOINT}#get_product`, arguments: { id: "samspitze-4" } });
    fireEvent.click(screen.getByRole("button", { name: /save as evidence/i }));
    await waitFor(() => expect(screen.getByText("opened 5b8a04c0-e247-4bec-a440-d9f3506f9213")).toBeVisible());
    expect(calls.at(-1)?.body).toEqual({ interfaceId: `mcp-tool:${ENDPOINT}#get_product`, arguments: { id: "samspitze-4" }, save: true });
  });
});

import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import type { ReportRecord } from "../../src/shared/types/index.js";

const fixedNow = new Date("2026-09-11T08:00:00.000Z");
const ENDPOINT = "https://alpina.travel/mcp/alpina/http/mcp";

/** A site's MCP server over the current transport: get_product is read-only and needs an id; purchase is not for calling. */
function siteMcpServer(calls: Array<{ name: string; arguments: Record<string, unknown> }>) {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(ENDPOINT)) return new Response("not here", { status: 404 });
    const message = JSON.parse(String(init?.body)) as { method: string; id?: number; params?: { name?: string; arguments?: Record<string, unknown> } };
    const reply = (result: unknown) => new Response(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }), { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "s1" } });
    if (message.method === "initialize") return reply({ protocolVersion: "2025-06-18", serverInfo: { name: "Alpina Travel Commerce" } });
    if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (message.method === "tools/list") {
      return reply({
        tools: [
          { name: "get_product", description: "One property by id", annotations: { readOnlyHint: true, destructiveHint: false }, inputSchema: { type: "object", properties: { id: { type: "string", description: "The property's id" } }, required: ["id"] } },
          { name: "purchase", annotations: { readOnlyHint: false }, inputSchema: { type: "object", properties: {} } },
        ],
      });
    }
    if (message.method === "tools/call") {
      calls.push({ name: message.params?.name ?? "", arguments: message.params?.arguments ?? {} });
      if (message.params?.arguments?.id === "nowhere") return reply({ isError: true, content: [{ type: "text", text: "No property with that id" }] });
      return reply({ content: [{ type: "text", text: "Samspitze 4: 2 bedrooms, sleeps 4, Mariapfarr" }] });
    }
    return new Response(null, { status: 400 });
  });
}

async function appWithReport() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), { publicAppUrl: "https://audit.example/", ttlDays: 30, now: () => fixedNow });
  const app = createApp({ orchestrator, rateLimits: { enabled: false }, capabilityTest: { resolve: async () => ["93.184.216.34"], timeoutMs: 5_000 } });
  const parent = await orchestrator.create({ requestId: randomUUID(), url: "https://alpina.travel/" });
  // The report names one MCP tool for "Retrieve details" at the site's current-transport endpoint, and one at the deprecated one.
  const graph = parent.contextGraph!;
  const child: ReportRecord = {
    ...parent,
    id: randomUUID(),
    parentReportId: parent.id,
    contextGraph: {
      ...graph,
      interfaces: [
        ...graph.interfaces,
        { id: "interface:mcp-tool-get_product", actionId: "detail.retrieve", entityIds: [], name: "get_product", protocol: "mcp", audience: "agent", status: "declared", sourceUrl: ENDPOINT, evidenceId: "mcp-tool-get_product" },
        { id: "interface:mcp-tool-purchase", actionId: "detail.retrieve", entityIds: [], name: "purchase", protocol: "mcp", audience: "agent", status: "declared", sourceUrl: ENDPOINT, evidenceId: "mcp-tool-purchase" },
        { id: "interface:mcp-tool-complete_order", actionId: "detail.retrieve", entityIds: [], name: "complete_order", protocol: "mcp", audience: "agent", status: "declared", sourceUrl: "https://alpina.travel/mcp/sse", evidenceId: "mcp-tool-complete_order" },
      ],
    },
  };
  const report = await store.createRevision(parent.id, child);
  return { app, orchestrator, report };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a person's own call on one capability", () => {
  it("lists what can be called, live from the site's server, the safe tool with its schema and the unsafe one with the reason", async () => {
    vi.stubGlobal("fetch", siteMcpServer([]));
    const { app, report } = await appWithReport();
    const listed = await request(app).get(`/api/reports/${report.id}/capabilities/detail.retrieve/test`).expect(200);
    const interfaces = listed.body.interfaces as Array<Record<string, unknown>>;
    expect(interfaces.map((item) => [item.name, item.safe])).toEqual([["get_product", true], ["purchase", false]]);
    expect(interfaces[0]).toMatchObject({ protocol: "mcp", endpoint: ENDPOINT, description: "One property by id", inputSchema: { required: ["id"] } });
    expect(interfaces[1]!.note).toBe("The server does not mark this tool read-only, so it is not called from here.");
    // The deprecated transport is not listed at all: it is not called.
    expect(interfaces.some((item) => item.name === "complete_order")).toBe(false);
    // The sidecar is offered on the action it serves, on this host only.
    const availability = await request(app).get(`/api/reports/${report.id}/capabilities/availability.check/test`).expect(200);
    expect((availability.body.interfaces as Array<{ id: string }>).map((item) => item.id)).toEqual(["sidecar:alpina-availability"]);
  });

  it("makes one call with the person's inputs, reports the answer as it came, and records it only on request as a new version", async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", siteMcpServer(calls));
    const { app, orchestrator, report } = await appWithReport();
    const path = `/api/reports/${report.id}/capabilities/detail.retrieve/test`;

    const answered = await request(app).post(path).send({ interfaceId: `mcp-tool:${ENDPOINT}#get_product`, arguments: { id: "samspitze-4" } }).expect(200);
    expect(answered.body).toMatchObject({ outcome: "answered", answer: "Samspitze 4: 2 bedrooms, sleeps 4, Mariapfarr", request: { endpoint: ENDPOINT, tool: "get_product", arguments: { id: "samspitze-4" } } });
    expect(answered.body.updatedReportId).toBeUndefined();
    expect(calls).toEqual([{ name: "get_product", arguments: { id: "samspitze-4" } }]);
    // Nothing changed on the report: the person did not ask for that.
    expect((await orchestrator.get(report.id))?.capabilities?.find((capability) => capability.actionId === "detail.retrieve")?.state).not.toBe("agent-ready");

    const failed = await request(app).post(path).send({ interfaceId: `mcp-tool:${ENDPOINT}#get_product`, arguments: { id: "nowhere" } }).expect(200);
    expect(failed.body).toMatchObject({ outcome: "failed", error: "No property with that id" });

    const saved = await request(app).post(path).send({ interfaceId: `mcp-tool:${ENDPOINT}#get_product`, arguments: { id: "samspitze-4" }, save: true }).expect(200);
    expect(saved.body.updatedReportId).toBeTruthy();
    const child = await orchestrator.get(saved.body.updatedReportId as string);
    const details = child?.capabilities?.find((capability) => capability.actionId === "detail.retrieve");
    expect(details?.state).toBe("agent-ready");
    expect(details?.evidence.some((item) => item.verification === "invoked" && /A person ran the site's MCP tool "get_product"/.test(item.claim))).toBe(true);
    // The parent is untouched: a version, never an edit.
    expect((await orchestrator.get(report.id))?.capabilities?.find((capability) => capability.actionId === "detail.retrieve")?.state).not.toBe("agent-ready");
  });

  it("refuses a tool the server does not mark read-only, and an address the report does not name", async () => {
    vi.stubGlobal("fetch", siteMcpServer([]));
    const { app, report } = await appWithReport();
    const path = `/api/reports/${report.id}/capabilities/detail.retrieve/test`;
    const unsafe = await request(app).post(path).send({ interfaceId: `mcp-tool:${ENDPOINT}#purchase`, arguments: {} }).expect(409);
    expect(unsafe.body.message).toMatch(/not mark this tool read-only/);
    const elsewhere = await request(app).post(path).send({ interfaceId: "mcp-tool:https://evil.example/mcp#get_product", arguments: {} }).expect(404);
    expect(elsewhere.body.message).toMatch(/does not name an MCP tool/);
    await request(app).post(path).send({ interfaceId: "sidecar:alpina-availability", arguments: {} }).expect(400);
    await request(app).get(`/api/reports/${report.id}/capabilities/no.such/test`).expect(404);
  });
});

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
    const page = sitePage(url, init, calls);
    if (page) return page;
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

/** The site's own pages over GET: a results page that echoes the query unless asked to stay silent, and an availability API. */
function sitePage(url: string, init: RequestInit | undefined, calls: Array<{ name: string; arguments: Record<string, unknown> }>): Response | null {
  const target = new URL(url);
  if (target.origin !== "https://alpina.travel") return null;
  if (target.pathname === "/lungau/plan/") {
    const mood = target.searchParams.get("mood") ?? "";
    calls.push({ name: `GET ${target.pathname}`, arguments: { mood, method: init?.method ?? "GET" } });
    const body = mood === "silent" ? "<html><body><h1>Plan</h1><script>render()</script></body></html>" : `<html><body><h1>Plan</h1><p>Stays for a ${mood} mood</p></body></html>`;
    return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
  }
  if (target.pathname === "/api/availability") {
    calls.push({ name: `GET ${target.pathname}`, arguments: Object.fromEntries(target.searchParams) });
    return new Response(JSON.stringify({ from: target.searchParams.get("from"), available: true }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return null;
}

const SEARCH_TEMPLATE = "https://alpina.travel/lungau/plan/?mood={mood}";
const CHECK_TEMPLATE = "https://alpina.travel/api/availability?from={checkin}&to={checkout}";

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
  // The report also carries the site's declared entry points, the templates with the read ones only.
  const collectedAt = fixedNow.toISOString();
  child.capabilities = parent.capabilities!.map((capability) => {
    if (capability.actionId === "site.search") {
      return { ...capability, evidence: [...capability.evidence, { id: "search-action-unconfirmed", actionId: "site.search", audience: "agent", kind: "api-result", sourceUrl: "https://alpina.travel/lungau/plan/?mood=lungau", claim: "The declared SearchAction template answered, but results could not be confirmed without executing site scripts", confidence: 0.7, verification: "declared", collectedAt, snippet: SEARCH_TEMPLATE }] };
    }
    if (capability.actionId === "availability.check") {
      return { ...capability, evidence: [...capability.evidence, { id: "entry-point-availability.check-CheckAction", actionId: "availability.check", audience: "agent", kind: "structured-data", sourceUrl: "https://alpina.travel/", claim: "A CheckAction entry point is declared for this action; the audit did not call it: it needs an input the audit cannot supply: checkin", confidence: 0.8, verification: "declared", collectedAt, snippet: CHECK_TEMPLATE }] };
    }
    if (capability.actionId === "checkout.create") {
      return { ...capability, evidence: [...capability.evidence, { id: "entry-point-checkout.create-ReserveAction", actionId: "checkout.create", audience: "agent", kind: "structured-data", sourceUrl: "https://alpina.travel/", claim: "A ReserveAction entry point is declared for this action; the audit did not call it: it would write: a reservation, a purchase, a message", confidence: 0.8, verification: "declared", collectedAt }] };
    }
    return capability;
  });
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
    // The sidecar is offered on the action it serves, on this host only, ahead of the site's own declared GET.
    const availability = await request(app).get(`/api/reports/${report.id}/capabilities/availability.check/test`).expect(200);
    expect((availability.body.interfaces as Array<{ id: string }>).map((item) => item.id)).toEqual(["sidecar:alpina-availability", `http-get:${CHECK_TEMPLATE}`]);
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

describe("a person's own GET on a declared entry point", () => {
  it("offers the site's read templates with a field per placeholder, and never a write", async () => {
    vi.stubGlobal("fetch", siteMcpServer([]));
    const { app, report } = await appWithReport();
    const search = await request(app).get(`/api/reports/${report.id}/capabilities/site.search/test`).expect(200);
    const template = (search.body.interfaces as Array<Record<string, unknown>>).find((item) => item.protocol === "http-get");
    expect(template).toMatchObject({ id: `http-get:${SEARCH_TEMPLATE}`, name: "SearchAction", endpoint: SEARCH_TEMPLATE, safe: true, inputSchema: { properties: { mood: { type: "string" } }, required: ["mood"] } });
    const availability = await request(app).get(`/api/reports/${report.id}/capabilities/availability.check/test`).expect(200);
    expect((availability.body.interfaces as Array<Record<string, unknown>>).map((item) => [item.id, (item.inputSchema as { required?: string[] } | undefined)?.required])).toEqual([
      ["sidecar:alpina-availability", ["checkIn", "checkOut", "adults"]],
      [`http-get:${CHECK_TEMPLATE}`, ["checkin", "checkout"]],
    ]);
    const reserve = await request(app).get(`/api/reports/${report.id}/capabilities/checkout.create/test`).expect(200);
    expect(reserve.body.interfaces).toEqual([]);
  });

  it("makes one GET with the person's inputs in the placeholders, judges the page as the audit does, and records it only on request", async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", siteMcpServer(calls));
    const { app, orchestrator, report } = await appWithReport();
    const path = `/api/reports/${report.id}/capabilities/site.search/test`;

    const answered = await request(app).post(path).send({ interfaceId: `http-get:${SEARCH_TEMPLATE}`, arguments: { mood: "sunny days" } }).expect(200);
    expect(answered.body).toMatchObject({ outcome: "answered", request: { endpoint: "https://alpina.travel/lungau/plan/?mood=sunny%20days", tool: "SearchAction", arguments: { mood: "sunny days" } } });
    expect(answered.body.answer).toBe("HTTP 200\nThe page acknowledges your input.\nPlan Stays for a sunny days mood");
    expect(answered.body.updatedReportId).toBeUndefined();
    expect(calls).toEqual([{ name: "GET /lungau/plan/", arguments: { mood: "sunny days", method: "GET" } }]);

    // A 200 that never mentions the input is an answer without proof: said so, and saved as declared, not invoked.
    const silent = await request(app).post(path).send({ interfaceId: `http-get:${SEARCH_TEMPLATE}`, arguments: { mood: "silent" }, save: true }).expect(200);
    expect(silent.body.outcome).toBe("answered");
    expect(silent.body.answer).toMatch(/does not mention your input/);
    const unproven = await orchestrator.get(silent.body.updatedReportId as string);
    expect(unproven?.capabilities?.find((capability) => capability.actionId === "site.search")?.evidence.some((item) => item.verification === "declared" && /A person ran the site's declared SearchAction entry point/.test(item.claim))).toBe(true);

    const saved = await request(app).post(path).send({ interfaceId: `http-get:${SEARCH_TEMPLATE}`, arguments: { mood: "sunny days" }, save: true }).expect(200);
    const child = await orchestrator.get(saved.body.updatedReportId as string);
    const search = child?.capabilities?.find((capability) => capability.actionId === "site.search");
    expect(search?.evidence.some((item) => item.verification === "invoked" && item.snippet === SEARCH_TEMPLATE && /the site answered for them/.test(item.claim))).toBe(true);

    // JSON comes back as it came.
    const checked = await request(app).post(`/api/reports/${report.id}/capabilities/availability.check/test`).send({ interfaceId: `http-get:${CHECK_TEMPLATE}`, arguments: { checkin: "2026-12-20", checkout: "2026-12-27" } }).expect(200);
    expect(checked.body.request.endpoint).toBe("https://alpina.travel/api/availability?from=2026-12-20&to=2026-12-27");
    expect(checked.body.answer).toContain('"available": true');
  });

  it("refuses an address the report does not name, and a placeholder left empty", async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", siteMcpServer(calls));
    const { app, report } = await appWithReport();
    const path = `/api/reports/${report.id}/capabilities/site.search/test`;
    const elsewhere = await request(app).post(path).send({ interfaceId: "http-get:https://alpina.travel/anything?q={q}", arguments: { q: "x" } }).expect(404);
    expect(elsewhere.body.message).toMatch(/does not name that address/);
    const empty = await request(app).post(path).send({ interfaceId: `http-get:${SEARCH_TEMPLATE}`, arguments: {} }).expect(400);
    expect(empty.body.message).toBe("mood is needed.");
    // The write's template was never recorded, so it cannot be asked for by name either.
    await request(app).post(`/api/reports/${report.id}/capabilities/checkout.create/test`).send({ interfaceId: "http-get:https://alpina.travel/book?date={date}", arguments: { date: "2026-12-20" } }).expect(404);
    expect(calls).toEqual([]);
  });
});

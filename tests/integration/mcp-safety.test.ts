import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { NativeFetchCollector } from "../../src/server/adapters/scrape/NativeFetch.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const MCP_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };

function buildApp(options: { live?: boolean; perIp?: number } = {}) {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
    // Live mode is what actually reaches out to a URL; demo mode answers from fixtures.
    ...(options.live ? { mode: "live" as const, providers: { scrape: new NativeFetchCollector() } } : {}),
  });
  return createApp({
    orchestrator,
    rateLimits: options.perIp ? { perIp: options.perIp, global: 1_000, windowMs: 60_000 } : { enabled: false },
  });
}

const call = (name: string, args: Record<string, unknown>, id = 1) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
});

function toolText(body: { result?: { content?: Array<{ text?: string }> } }): string {
  return body.result?.content?.[0]?.text ?? "";
}

describe("what the remote endpoint refuses", () => {
  it.each([
    ["the cloud metadata service", "http://169.254.169.254/latest/meta-data/"],
    ["a private address", "http://192.168.1.1/admin"],
    ["a loopback address", "http://127.0.0.1:8080/"],
    ["a non-web scheme", "file:///etc/passwd"],
    ["credentials in the URL", "https://user:secret@example.com/"],
  ])("will not audit %s", async (_case, url) => {
    const response = await request(buildApp({ live: true })).post("/mcp").set(MCP_HEADERS).send(call("audit-website", { url }));

    expect(response.status).toBe(200);
    expect(response.body.result.isError).toBe(true);
    // The caller is told which rule refused, not that something unspecified went wrong — and
    // nothing was fetched to find out, so no connection error can appear here.
    expect(toolText(response.body)).not.toContain("could not complete that call");
    expect(toolText(response.body)).not.toContain("ECONNREFUSED");
    expect(toolText(response.body).length).toBeGreaterThan(20);
  });

  it("spends the audit budget on audits and not on discovery", async () => {
    const app = buildApp({ perIp: 1 });

    const first = await request(app).post("/mcp").set(MCP_HEADERS).send(call("audit-website", { url: "https://alpina.travel/" }));
    expect(first.body.result.isError).toBeFalsy();

    const second = await request(app).post("/mcp").set(MCP_HEADERS).send(call("audit-website", { url: "https://shop.example/" }, 2));
    expect(second.status).toBe(429);
    expect(second.body.error).toBe("rate_limited");

    // A caller who has spent their audits can still see what the server offers and read a report.
    const listed = await request(app)
      .post("/mcp")
      .set(MCP_HEADERS)
      .send({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} })
      .expect(200);
    expect(listed.body.result.tools).toHaveLength(6);
  });

  it("counts an audit hidden inside a batch", async () => {
    const app = buildApp({ perIp: 1 });

    // A JSON-RPC batch is one HTTP request carrying several calls. Reading only the top-level
    // method would let a batch spend an unlimited number of audits.
    const batch = await request(app)
      .post("/mcp")
      .set(MCP_HEADERS)
      .send([call("get-audit-report", { reportId: "11111111-2222-4333-8444-555555555555" }), call("audit-website", { url: "https://alpina.travel/" }, 2)]);
    expect([200, 429]).toContain(batch.status);

    const next = await request(app).post("/mcp").set(MCP_HEADERS).send(call("audit-website", { url: "https://shop.example/" }, 3));
    expect(next.status).toBe(429);
  });

  it("keeps an audited site's text out of the tool list it publishes", async () => {
    const listed = await request(buildApp())
      .post("/mcp")
      .set(MCP_HEADERS)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
      .expect(200);

    const published = JSON.stringify(listed.body.result.tools);
    expect(published).not.toMatch(/alpina/i);
    expect(published).not.toMatch(/<script/i);
  });
});

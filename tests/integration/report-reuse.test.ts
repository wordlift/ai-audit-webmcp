import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { MemoryClaimStore } from "../../src/server/adapters/claims/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const MCP_HEADERS = { accept: "application/json, text/event-stream", "content-type": "application/json" };

/** A clock the tests can move, so "within a day" is a fact and not a race. */
function clock(start = "2026-09-07T09:00:00.000Z") {
  let now = new Date(start);
  return { now: () => now, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

function orchestratorWith(time = clock(), reuseWindowMs?: number) {
  const store = new MemoryReportStore(900_000, time.now);
  return new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: time.now,
    ...(reuseWindowMs === undefined ? {} : { reuseWindowMs }),
  });
}

const audit = (orchestrator: AuditOrchestrator, extra: Record<string, unknown> = {}) =>
  orchestrator.create({ requestId: randomUUID(), url: "https://shop.example/", ...extra });

describe("one crawl per site per day", () => {
  it("builds the second report of a site from the first crawl, with its own id", async () => {
    const orchestrator = orchestratorWith();
    const first = await audit(orchestrator);
    const second = await audit(orchestrator);

    expect(second.id).not.toBe(first.id);
    expect(second.reusedFrom).toBe(first.id);
    expect(second.collectedAt).toBe(first.createdAt);
    expect(second.score).toEqual(first.score);
    expect(second.capabilities).toEqual(first.capabilities);
    expect(first.reusedFrom).toBeUndefined();
    expect(first.collectedAt).toBe(first.createdAt);
  });

  it("reads the site again when asked to, and after a day", async () => {
    const time = clock();
    const orchestrator = orchestratorWith(time);
    const first = await audit(orchestrator);

    const fresh = await audit(orchestrator, { fresh: true });
    expect(fresh.reusedFrom).toBeUndefined();

    time.advance(25 * 60 * 60 * 1_000);
    const later = await audit(orchestrator);
    expect(later.reusedFrom).toBeUndefined();
    expect(later.id).not.toBe(first.id);
  });

  it("reuses the crawl whatever depth a caller still names, and never a different site's crawl", async () => {
    const orchestrator = orchestratorWith();
    const first = await audit(orchestrator, { depth: "basic" });

    const named = await audit(orchestrator, { depth: "deep" });
    expect(named.reusedFrom).toBe(first.id);

    const other = await orchestrator.create({ requestId: randomUUID(), url: "https://publisher.example/" });
    expect(other.reusedFrom).toBeUndefined();
  });

  it("reads again when the caller asks for a different archetype", async () => {
    const orchestrator = orchestratorWith();
    await audit(orchestrator);
    const overridden = await audit(orchestrator, { archetypeOverride: "saas" });
    expect(overridden.reusedFrom).toBeUndefined();
  });

  it("never uses a refined report as a source", async () => {
    const orchestrator = orchestratorWith();
    const first = await audit(orchestrator);
    const refined = await orchestrator.refine(first.id, { businessRole: "merchant" });
    expect(refined.refinement).toBeDefined();

    const next = await audit(orchestrator);
    expect(next.reusedFrom).toBe(first.id);
    expect(next.refinement).toBeUndefined();
  });

  it("never uses a revision as a source, even a newer one", async () => {
    const orchestrator = orchestratorWith();
    const first = await audit(orchestrator);
    const recompiled = await orchestrator.recompile(first.id, { archetype: "saas" });
    expect(recompiled.parentReportId).toBe(first.id);

    const next = await audit(orchestrator);
    expect(next.reusedFrom).toBe(first.id);
    expect(next.classification?.primaryArchetype).toBe(first.classification?.primaryArchetype);
  });

  it("can be switched off", async () => {
    const orchestrator = orchestratorWith(clock(), 0);
    await audit(orchestrator);
    const second = await audit(orchestrator);
    expect(second.reusedFrom).toBeUndefined();
  });

  it("gives each remote caller a report of their own, with no claim, and keeps a fresh crawl off the remote surface", async () => {
    const time = clock();
    const store = new MemoryReportStore(900_000, time.now);
    const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
      publicAppUrl: "https://audit.example/",
      ttlDays: 30,
      now: time.now,
    });
    // A claim store is configured for the browser; the anonymous remote transport must still issue none.
    const app = createApp({ orchestrator, claims: new MemoryClaimStore(), rateLimits: { enabled: false } });
    const call = (id: number, extra: Record<string, unknown> = {}) =>
      request(app)
        .post("/mcp")
        .set(MCP_HEADERS)
        .send({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "audit-website", arguments: { url: "https://shop.example/", ...extra } } });

    const first = (await call(1)).body.result.structuredContent;
    const second = (await call(2)).body.result.structuredContent;
    const askedFresh = (await call(3, { fresh: true })).body.result.structuredContent;

    expect(second.reportId).not.toBe(first.reportId);
    for (const result of [first, second, askedFresh]) expect(JSON.stringify(result)).not.toMatch(/claim[_-]?token|bearer/i);
    const stored = await orchestrator.get(second.reportId);
    expect(stored?.reusedFrom).toBe(first.reportId);
    // The remote contract the app directory reviewed has no fresh input; a caller who sends one gets the reuse default.
    const reread = await orchestrator.get(askedFresh.reportId);
    expect(reread?.reusedFrom).toBe(first.reportId);

    const listed = await request(app).post("/mcp").set(MCP_HEADERS).send({ jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
    const audit = listed.body.result.tools.find((tool: { name: string }) => tool.name === "audit-website");
    expect(Object.keys(audit.inputSchema.properties).sort()).toEqual(["archetype", "depth", "email", "url"]);
  });
});

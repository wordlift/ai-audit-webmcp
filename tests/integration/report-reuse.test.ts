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

  it("does not hand a deep scan a basic crawl, or a different site's crawl", async () => {
    const orchestrator = orchestratorWith();
    await audit(orchestrator, { depth: "basic" });

    const deep = await audit(orchestrator, { depth: "deep" });
    expect(deep.reusedFrom).toBeUndefined();

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

  it("can be switched off", async () => {
    const orchestrator = orchestratorWith(clock(), 0);
    await audit(orchestrator);
    const second = await audit(orchestrator);
    expect(second.reusedFrom).toBeUndefined();
  });

  it("gives each remote caller a report and a claim of their own", async () => {
    const time = clock();
    const store = new MemoryReportStore(900_000, time.now);
    const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
      publicAppUrl: "https://audit.example/",
      ttlDays: 30,
      now: time.now,
    });
    const app = createApp({ orchestrator, claims: new MemoryClaimStore(), rateLimits: { enabled: false } });
    const call = (id: number, extra: Record<string, unknown> = {}) =>
      request(app)
        .post("/mcp")
        .set(MCP_HEADERS)
        .send({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "audit-website", arguments: { url: "https://shop.example/", ...extra } } });

    const first = (await call(1)).body.result.structuredContent;
    const second = (await call(2)).body.result.structuredContent;
    const fresh = (await call(3, { fresh: true })).body.result.structuredContent;

    expect(second.reportId).not.toBe(first.reportId);
    expect(second.claimToken).not.toBe(first.claimToken);
    const stored = await orchestrator.get(second.reportId);
    expect(stored?.reusedFrom).toBe(first.reportId);
    const reread = await orchestrator.get(fresh.reportId);
    expect(reread?.reusedFrom).toBeUndefined();
  });
});

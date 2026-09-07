import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { MemoryVisitStore } from "../../src/server/adapters/visits/MemoryVisitStore.js";
import { PlatformEgress } from "../../src/server/security/platformEgress.js";
import { VisitorClassifier } from "../../src/server/security/visitorClass.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { bucketFor, SITE_BUCKET, VisitLedger } from "../../src/server/services/VisitLedger.js";

const fixedNow = new Date("2026-09-07T09:00:00.000Z");
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15";

function buildApp() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  const visits = new VisitLedger({
    store: new MemoryVisitStore(() => fixedNow),
    classifier: new VisitorClassifier({
      platforms: new PlatformEgress([{ platform: "anthropic", cidr: "160.79.104.0/21" }]),
      crawlers: new PlatformEgress([{ platform: "google-crawlers", cidr: "66.249.64.0/19" }]),
    }),
    ttlDays: 30,
    flushMs: 5,
    now: () => fixedNow,
  });
  const app = createApp({ orchestrator, trustProxy: true, rateLimits: { enabled: false }, visits });
  return { app, visits };
}

async function report(app: ReturnType<typeof buildApp>["app"]): Promise<string> {
  const response = await request(app).post("/api/reports").send({ requestId: randomUUID(), url: "https://shop.example/" }).expect(200);
  return response.body.id as string;
}

const read = (app: ReturnType<typeof buildApp>["app"], path: string, userAgent: string, from: string) =>
  request(app).get(path).set("user-agent", userAgent).set("x-forwarded-for", from);

describe("who read a report", () => {
  it("counts each read by class and by day, never by person", async () => {
    const { app, visits } = buildApp();
    const id = await report(app);

    await read(app, `/api/reports/${id}`, GOOGLEBOT, "66.249.66.1").expect(200);
    await read(app, `/api/reports/${id}`, GOOGLEBOT, "198.51.100.7").expect(200);
    await read(app, `/api/reports/${id}`, BROWSER, "160.79.105.7").expect(200);
    await read(app, `/api/reports/${id}`, BROWSER, "198.51.100.7").expect(200);
    await read(app, `/api/reports/${id}`, BROWSER, "198.51.100.8").expect(200);
    await visits.flush();

    const ledger = await request(app).get(`/api/reports/${id}/visits`).expect(200);
    expect(ledger.body.reportId).toBe(id);
    expect(ledger.body.days).toEqual([
      { day: "2026-09-07", counts: { "crawler:googlebot": 1, "crawler:claimed-googlebot": 1, "agent:anthropic": 1, human: 2 } },
    ]);
    expect(ledger.body.activations).toEqual([]);
    expect(JSON.stringify(ledger.body)).not.toContain("198.51.100");
  });

  it("does not count reading the ledger itself, and counts what we publish for agents under one bucket", async () => {
    const { app, visits } = buildApp();
    const id = await report(app);

    await read(app, `/api/reports/${id}/visits`, GOOGLEBOT, "66.249.66.1").expect(200);
    await read(app, "/llms.txt", GOOGLEBOT, "66.249.66.1").expect(200);
    await read(app, "/.well-known/webmcp/tools.json", BROWSER, "198.51.100.7").expect(200);
    await visits.flush();

    expect((await request(app).get(`/api/reports/${id}/visits`).expect(200)).body.days).toEqual([]);
    expect(await visits.visits(SITE_BUCKET)).toEqual([
      expect.objectContaining({ day: "2026-09-07", counts: { "crawler:googlebot": 1, human: 1 } }),
    ]);
  });

  it("answers for a report that does not exist with a 404, and without a ledger with empty counts", async () => {
    const { app } = buildApp();
    await request(app).get(`/api/reports/${randomUUID()}/visits`).expect(404);

    const plain = createApp({
      orchestrator: new AuditOrchestrator(new MemoryReportStore(900_000, () => fixedNow), loadActionModel(), new FixtureProvider(), {
        publicAppUrl: "https://audit.example/",
        ttlDays: 30,
        now: () => fixedNow,
      }),
      rateLimits: { enabled: false },
    });
    const id = await report(plain);
    expect((await request(plain).get(`/api/reports/${id}/visits`).expect(200)).body).toEqual({ reportId: id, since: fixedNow.toISOString(), days: [], activations: [] });
  });

  it("knows which paths are a read of a report", () => {
    const id = "4a8a04c0-e247-4bec-a440-d9f3506f9212";
    expect(bucketFor(`/reports/${id}`)).toBe(id);
    expect(bucketFor(`/api/reports/${id}`)).toBe(id);
    expect(bucketFor(`/api/reports/${id}/contracts/availability.check`)).toBe(id);
    expect(bucketFor(`/api/reports/${id}/visits`)).toBeNull();
    expect(bucketFor("/llms.txt")).toBe(SITE_BUCKET);
    expect(bucketFor("/.well-known/ai-catalog.json")).toBe(SITE_BUCKET);
    expect(bucketFor("/privacy")).toBeNull();
    expect(bucketFor("/api/health")).toBeNull();
  });
});

import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { createApp } from "../../src/server/app.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AlpinaAvailabilitySidecar } from "../../src/server/sidecars/alpina/adapter.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");

function testApp(rateLimits: { perIp?: number; global?: number }) {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return createApp({ orchestrator, rateLimits: { windowMs: 60_000, ...rateLimits } });
}

function audit(app: ReturnType<typeof testApp>) {
  return request(app).post("/api/reports").send({ requestId: randomUUID(), url: "alpina.travel" });
}

describe("audit rate limits", () => {
  it("limits repeated audits from one caller", async () => {
    const app = testApp({ perIp: 2 });

    await audit(app).expect(200);
    await audit(app).expect(200);
    const blocked = await audit(app).expect(429);

    expect(blocked.body.error).toBe("rate_limited");
    expect(blocked.body.message).toMatch(/Too many audits/);
  });

  it("protects downstream providers with a service-wide ceiling", async () => {
    const app = testApp({ perIp: 100, global: 1 });

    await audit(app).expect(200);
    const blocked = await audit(app).expect(429);

    expect(blocked.body.message).toMatch(/at capacity/);
  });

  it("never rate-limits reading a shared report", async () => {
    const app = testApp({ perIp: 1 });
    const report = await audit(app).expect(200);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).get(`/api/reports/${report.body.id}`).expect(200);
    }
    await request(app).get("/api/health").expect(200);
  });

  it("gives the sidecar its own pool so an agent conversation does not spend the audit budget", async () => {
    const store = new MemoryReportStore(900_000, () => fixedNow);
    const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
      publicAppUrl: "https://audit.example/",
      ttlDays: 30,
      now: () => fixedNow,
    });
    const app = createApp({
      orchestrator,
      rateLimits: { windowMs: 60_000, perIp: 1 },
      alpinaSidecar: new AlpinaAvailabilitySidecar({
        fetchImpl: (async () =>
          new Response(JSON.stringify({ status: "available", available: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as unknown as typeof fetch,
        now: () => fixedNow,
      }),
    });

    await request(app).post("/api/reports").send({ requestId: randomUUID(), url: "alpina.travel" }).expect(200);
    // The audit pool is spent; the sidecar still answers.
    await request(app).post("/api/reports").send({ requestId: randomUUID(), url: "alpina.travel" }).expect(429);
    await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 })
      .expect(200);
  });
});

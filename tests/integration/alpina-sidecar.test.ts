import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { createApp } from "../../src/server/app.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AlpinaAvailabilitySidecar } from "../../src/server/sidecars/alpina/adapter.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const upstream = JSON.parse(
  readFileSync(path.join(process.cwd(), "fixtures/travel-hospitality/alpina-live-response.json"), "utf8"),
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function testApp(fetchImpl: typeof fetch) {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  const app = createApp({
    orchestrator,
    rateLimits: { enabled: false },
    alpinaSidecar: new AlpinaAvailabilitySidecar({ fetchImpl, now: () => fixedNow }),
  });
  return { app, orchestrator };
}

async function alpinaReport(app: ReturnType<typeof testApp>["app"]) {
  const response = await request(app)
    .post("/api/reports")
    .send({ requestId: randomUUID(), url: "alpina.travel", fixtureId: "travel-hospitality" })
    .expect(200);
  return response.body;
}

describe("Alpina availability sidecar", () => {
  it("returns normalized read-only availability and forwards no extra upstream fields", async () => {
    const { app } = testApp(vi.fn(async () => jsonResponse(upstream)) as unknown as typeof fetch);

    const response = await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 })
      .expect(200);

    expect(response.body).toMatchObject({
      source: "https://alpina.travel/api/booking/availability",
      available: true,
      status: "available",
      nights: 3,
      totalGuests: 2,
      readOnly: true,
      requiresRevalidation: true,
      quote: { total: 644.8, currency: "EUR", instantConfirmation: true },
    });
    expect(response.body.notice).toMatch(/created no booking/);
    // Provider internals stay upstream.
    expect(response.body.providerPropertyId).toBeUndefined();
    expect(response.body.provider).toBeUndefined();
  });

  it("turns the human-only capability into a sidecar-enabled child report", async () => {
    const { app } = testApp(vi.fn(async () => jsonResponse(upstream)) as unknown as typeof fetch);
    const parent = await alpinaReport(app);

    // Alpina already declares an availability API, so the honest before-state is `unverified`:
    // a person can check dates and an interface is announced, but no agent call has succeeded.
    const before = parent.capabilities.find((item: { actionId: string }) => item.actionId === "availability.check");
    expect(before.state).toBe("unverified");
    expect(before.humanSupport).toBe(true);
    expect(before.agentSupport).toBe(false);

    const response = await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ reportId: parent.id, checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 })
      .expect(200);

    expect(response.body.updatedReportUrl).toMatch(/^\/reports\//);

    const child = await request(app).get(`/api/reports/${response.body.updatedReportId}`).expect(200);
    const after = child.body.capabilities.find((item: { actionId: string }) => item.actionId === "availability.check");

    expect(child.body.parentReportId).toBe(parent.id);
    expect(after.state).toBe("sidecar-enabled");
    expect(after.agentSupport).toBe(true);
    expect(after.evidence.some((item: { verification: string }) => item.verification === "invoked")).toBe(true);
    expect(child.body.score.value).toBeGreaterThan(parent.score.value);

    // The shared parent report is unchanged.
    const unchanged = await request(app).get(`/api/reports/${parent.id}`).expect(200);
    expect(
      unchanged.body.capabilities.find((item: { actionId: string }) => item.actionId === "availability.check").state,
    ).toBe("unverified");
  });

  it("reports an upstream failure as a failure, never as no availability", async () => {
    const { app } = testApp(vi.fn(async () => jsonResponse({ error: "upstream down" }, 503)) as unknown as typeof fetch);

    const response = await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 })
      .expect(502);

    expect(response.body.error).toBe("upstream_unavailable");
    expect(response.body.available).toBeUndefined();
    expect(response.body.status).toBeUndefined();
  });

  it("rejects invalid dates before calling the provider", async () => {
    const fetchImpl = vi.fn();
    const { app } = testApp(fetchImpl as unknown as typeof fetch);

    const response = await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ checkIn: "2026-09-15", checkOut: "2026-09-12", adults: 2 })
      .expect(400);

    expect(response.body.error).toBe("invalid_input");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("still returns availability when the report cannot be updated", async () => {
    const { app } = testApp(vi.fn(async () => jsonResponse(upstream)) as unknown as typeof fetch);

    const response = await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ reportId: randomUUID(), checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 })
      .expect(200);

    expect(response.body.available).toBe(true);
    expect(response.body.reportUpdateError).toMatch(/not found|expired/i);
    expect(response.body.updatedReportUrl).toBeUndefined();
  });

  it("does not create a booking session, hold, or payment", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(upstream));
    const { app } = testApp(fetchImpl as unknown as typeof fetch);

    await request(app)
      .post("/api/sidecars/alpina/availability")
      .send({ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 })
      .expect(200);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
  });
});

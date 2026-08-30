import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");

function testApp() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return { app: createApp({ orchestrator }), store };
}

describe("fixture report API", () => {
  it.each([
    ["commerce-retail", "https://shop.example/"],
    ["publisher-content", "https://publisher.example/"],
    ["travel-hospitality", "https://alpina.travel/"],
    ["finance-insurance", "https://insurance.example/"],
    ["saas", "https://saas.example/"],
    ["other", "https://organization.example/"],
  ])("returns a completed deterministic %s report", async (fixtureId, url) => {
    const { app } = testApp();
    const response = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url, fixtureId })
      .expect(200);
    expect(response.body.status).toBe("completed");
    expect(response.body.classification.primaryArchetype).toBe(fixtureId);
    expect(response.body.capabilities.length).toBeGreaterThan(0);
    expect(response.body.score.value).toBeGreaterThanOrEqual(0);
    expect(response.body.priorities.length).toBeLessThanOrEqual(3);
  });

  it("uses the request UUID idempotently", async () => {
    const { app } = testApp();
    const payload = { requestId: randomUUID(), url: "alpina.travel", fixtureId: "travel-hospitality" };
    const first = await request(app).post("/api/reports").send(payload).expect(200);
    const second = await request(app).post("/api/reports").send(payload).expect(200);
    expect(second.body).toEqual(first.body);
  });

  it("serves one stable Alpina reference report without making it the generic audit path", async () => {
    const { app } = testApp();
    const first = await request(app).get("/api/demo/alpina").expect(200);
    const second = await request(app).get("/api/demo/alpina").expect(200);

    expect(second.body.id).toBe(first.body.id);
    expect(first.body.mode).toBe("demo");
    expect(first.body.contextGraph.pages).toHaveLength(4);
    expect(first.body.contextGraph.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Alpina.travel" }),
        expect.objectContaining({ name: "AlpiNest Feriendorf Lungau" }),
      ]),
    );
    expect(new Date(first.body.expiresAt).getUTCFullYear()).toBe(2099);
  });

  it("preserves truthful partial and failed fixtures", async () => {
    const { app } = testApp();
    const partial = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "partial.example", fixtureId: "partial" })
      .expect(200);
    expect(partial.body.status).toBe("partial");
    expect(partial.body.errors[0].code).toBe("collector_timeout");
    expect(partial.body.capabilities.length).toBeGreaterThan(0);

    const failed = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "failed.example", fixtureId: "failed" })
      .expect(200);
    expect(failed.body.status).toBe("failed");
    expect(failed.body.capabilities).toBeUndefined();
    expect(failed.body.errors[0].code).toBe("site_unreachable");
  });

  it("creates immutable child reports for override and reverify", async () => {
    const { app } = testApp();
    const parent = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "alpina.travel", fixtureId: "travel-hospitality" })
      .expect(200);
    const child = await request(app)
      .post(`/api/reports/${parent.body.id}/recompile`)
      .send({ archetype: "publisher-content" })
      .expect(200);
    expect(child.body.parentReportId).toBe(parent.body.id);
    expect(child.body.classification.primaryArchetype).toBe("publisher-content");
    expect(child.body.capabilities.flatMap((item: { evidence: unknown[] }) => item.evidence).length).toBeGreaterThan(0);
    const unchanged = await request(app).get(`/api/reports/${parent.body.id}`).expect(200);
    expect(unchanged.body.classification.primaryArchetype).toBe("travel-hospitality");

    const reverification = await request(app).post(`/api/reports/${parent.body.id}/reverify`).send({}).expect(200);
    expect(reverification.body.parentReportId).toBe(parent.body.id);
    expect(reverification.body.classification.primaryArchetype).toBe("travel-hospitality");
  });

  it("downloads a valid contract as JSON-LD", async () => {
    const { app } = testApp();
    const report = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "alpina.travel", fixtureId: "travel-hospitality" })
      .expect(200);
    const action = report.body.capabilities.find((item: { contract?: unknown }) => item.contract);
    const contract = await request(app)
      .get(`/api/reports/${report.body.id}/contracts/${action.actionId}`)
      .expect("Content-Type", /application\/ld\+json/)
      .expect(200);
    expect(contract.body["@type"]).toContain("wlcap:CapabilityContract");
  });
});

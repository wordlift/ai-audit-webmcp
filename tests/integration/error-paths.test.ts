import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { createApp } from "../../src/server/app.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");

function testApp() {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return createApp({ orchestrator, rateLimits: { enabled: false } });
}

describe("error and recovery paths", () => {
  it.each([
    ["http://169.254.169.254/latest/meta-data/", 403, "private_network"],
    ["http://127.0.0.1:3000", 403, "private_network"],
    ["http://[fd00::1]/", 403, "private_network"],
    ["file:///etc/passwd", 400, "unsupported_scheme"],
    ["https://admin:secret@example.com", 400, "credentials_not_allowed"],
    ["https://example.com:22", 403, "unsupported_port"],
  ])("refuses %s before any provider runs", async (url, status, code) => {
    const response = await request(testApp())
      .post("/api/reports")
      .send({ requestId: randomUUID(), url })
      .expect(status);

    expect(response.body.error).toBe(code);
    expect(response.body.message).not.toMatch(/secret/);
  });

  it("explains which demo hosts exist instead of failing opaquely", async () => {
    const response = await request(testApp())
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "https://not-a-demo-site.example" })
      .expect(400);

    expect(response.body.error).toBe("fixture_not_registered");
    expect(response.body.message).toMatch(/alpina.travel/);
  });

  it("rejects an invalid request body without touching the store", async () => {
    const response = await request(testApp()).post("/api/reports").send({ url: "alpina.travel" }).expect(400);
    expect(response.body.error).toBe("invalid_request");
  });

  it("returns 404 for unknown reports, contracts, and API endpoints", async () => {
    const app = testApp();
    await request(app).get(`/api/reports/${randomUUID()}`).expect(404);
    await request(app).post(`/api/reports/${randomUUID()}/reverify`).send({}).expect(404);
    await request(app).get("/api/unknown").expect(404);

    const report = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "alpina.travel" })
      .expect(200);
    const missing = await request(app)
      .get(`/api/reports/${report.body.id}/contracts/does.not.exist`)
      .expect(404);
    expect(missing.body.error).toBe("contract_not_found");
  });

  it("lets a disconnected client recover the stored report with the same request UUID", async () => {
    const app = testApp();
    const requestId = randomUUID();
    const payload = { requestId, url: "alpina.travel" };

    const first = await request(app).post("/api/reports").send(payload).expect(200);
    const retry = await request(app).post("/api/reports").send(payload).expect(200);
    const polled = await request(app).get(`/api/reports/${first.body.id}`).expect(200);

    expect(retry.body.id).toBe(first.body.id);
    expect(polled.body).toEqual(first.body);
  });

  it("keeps a failed report honest and refuses to recompile it", async () => {
    const app = testApp();
    const failed = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: "failed.example", fixtureId: "failed" })
      .expect(200);

    expect(failed.body.status).toBe("failed");
    const response = await request(app)
      .post(`/api/reports/${failed.body.id}/recompile`)
      .send({ archetype: "saas" })
      .expect(409);
    expect(response.body.error).toBe("report_request_invalid");
  });

  it("stores a terminal failed report when the audit result cannot be persisted", async () => {
    // A ceiling far below any real report makes finalize throw after the audit itself ran.
    const store = new MemoryReportStore(3_000, () => fixedNow);
    const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
      publicAppUrl: "https://audit.example/",
      ttlDays: 30,
      now: () => fixedNow,
    });
    const app = createApp({ orchestrator, rateLimits: { enabled: false } });
    const requestId = randomUUID();

    await request(app).post("/api/reports").send({ requestId, url: "alpina.travel" }).expect(500);

    // The record is not left `running`, so a retry reads a terminal failure instead of polling forever.
    const stored = await request(app).get(`/api/reports/${requestId}`).expect(200);
    expect(stored.body.status).toBe("failed");
    expect(stored.body.errors[0]).toMatchObject({ code: "report_failed", retryable: true });
  });

  it("sets the WebMCP permissions policy and frames only for agent surfaces", async () => {
    const response = await request(testApp()).get("/api/health").expect(200);
    expect(response.headers["permissions-policy"]).toMatch(/tools=\(self\)/);
    // ChatGPT opens the app embedded; those origins may frame it, nobody else can.
    expect(response.headers["content-security-policy"]).toMatch(
      /frame-ancestors 'self' https:\/\/chatgpt\.com https:\/\/chat\.openai\.com https:\/\/\*\.oaiusercontent\.com/,
    );
    // X-Frame-Options cannot express an allowlist, so it is deliberately absent.
    expect(response.headers["x-frame-options"]).toBeUndefined();
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

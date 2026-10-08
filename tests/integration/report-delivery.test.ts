import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { MemoryLeadStore } from "../../src/server/adapters/leads/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AuditToolService } from "../../src/server/services/AuditToolService.js";
import { DeliveryRequests } from "../../src/server/services/DeliveryRequests.js";
import type { AuditToolResult } from "../../src/shared/format/agentSummary.js";
import { SCAN_PAGES } from "../../src/shared/format/deepScan.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";
const ADDRESS = "reviewer@example.com";

function harness(options: { leads?: MemoryLeadStore | null } = {}) {
  const leads = options.leads === null ? null : (options.leads ?? new MemoryLeadStore(() => fixedNow));
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  const deliveries = new DeliveryRequests(leads, 30, () => fixedNow);
  const service = new AuditToolService(orchestrator, { graceMs: 5_000, source: "mcp" }, deliveries);
  return {
    leads,
    orchestrator,
    service,
    app: createApp({ orchestrator, leads: leads ?? undefined, rateLimits: { enabled: false } }),
  };
}

describe("the one thing the audit asks for", () => {
  it("audits without asking for anything at all", async () => {
    const { service, leads } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL });

    expect(answer.structured.reportId).toBeTruthy();
    expect(await leads?.pending()).toEqual([]);
    expect(answer.text).not.toContain("email");
  });

  it("reads the same pages whether or not a depth is named: there is one scan", async () => {
    const { service, orchestrator } = harness();
    const plain = await service.auditWebsite({ url: TRAVEL });
    const named = await service.auditWebsite({ url: TRAVEL, depth: "deep", fresh: true });

    for (const answer of [plain, named]) {
      const report = await orchestrator.get(answer.structured.reportId);
      expect(report?.scanDepth).toBeUndefined();
      expect(report?.contextGraph?.pages.length).toBeLessThanOrEqual(SCAN_PAGES);
    }
    expect(named.text).not.toContain("email");
  });

  it("files the address beside the report, never inside it", async () => {
    const { service, leads, orchestrator } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL, email: ADDRESS });
    const reportId = answer.structured.reportId;

    const [lead] = (await leads?.pending()) ?? [];
    expect(lead).toMatchObject({ reportId, email: ADDRESS, source: "mcp" });
    expect(lead.deliveredAt).toBeUndefined();

    const report = await orchestrator.get(reportId);
    expect(JSON.stringify(report)).not.toContain(ADDRESS);
    expect(JSON.stringify(report)).not.toContain("example.com");
  });

  it("shows the person the address they gave without spelling it out", async () => {
    const { service } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL, email: ADDRESS });

    expect(answer.text).toContain("re******@example.com");
    expect(answer.text).not.toContain(ADDRESS);
    expect((answer.structured as AuditToolResult).notes.join(" ")).toContain("stays public and free");
  });

  it("refuses an address that is not one, and says the audit runs without", async () => {
    const { service, leads } = harness();

    await expect(service.auditWebsite({ url: TRAVEL, email: "not an address" })).rejects.toMatchObject({
      code: "invalid_email",
    });
    expect(await leads?.pending()).toEqual([]);
  });

  it("says so rather than silently dropping the address when delivery is unavailable", async () => {
    const { service } = harness({ leads: null });

    await expect(service.auditWebsite({ url: TRAVEL, email: ADDRESS })).rejects.toMatchObject({
      code: "delivery_unavailable",
    });
  });

  it("ends every audit with the one door: a conversation, not a dashboard", async () => {
    const { service } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL });

    expect(answer.text).toContain("https://wordlift.io/book-a-demo/");
    expect(answer.text).not.toContain("my.wordlift.io");
  });

  it("takes the address with the web form, or later, while the audit runs or after it landed", async () => {
    const { app, leads } = harness();

    const withForm = randomUUID();
    const accepted = await request(app).post("/api/reports").send({ requestId: withForm, url: TRAVEL, email: ADDRESS }).expect(200);
    expect(accepted.body.scanDepth).toBeUndefined();
    expect(JSON.stringify(accepted.body)).not.toContain(ADDRESS);
    expect((await leads?.get(withForm))).toMatchObject({ source: "web" });

    const later = randomUUID();
    await request(app).post("/api/reports").send({ requestId: later, url: TRAVEL, fresh: true }).expect(200);
    expect(await leads?.get(later)).toBeNull();
    const delivery = await request(app).post(`/api/reports/${later}/deliver`).send({ email: ADDRESS }).expect(202);
    expect(delivery.body).toMatchObject({ reportId: later, maskedEmail: "re******@example.com", status: "completed" });
    expect(await leads?.get(later)).toMatchObject({ reportId: later, email: ADDRESS, source: "web" });

    await request(app).post(`/api/reports/${randomUUID()}/deliver`).send({ email: ADDRESS }).expect(404);
    await request(app).post(`/api/reports/${later}/deliver`).send({ email: "nope" }).expect(400);
  });

  it("keeps the page's own form and an agent driving that page apart", async () => {
    const { app, leads } = harness();

    const form = randomUUID();
    await request(app).post("/api/reports").send({ requestId: form, url: TRAVEL, email: ADDRESS }).expect(200);

    const agent = randomUUID();
    await request(app)
      .post("/api/reports")
      .send({ requestId: agent, url: TRAVEL, email: "agent@example.com", surface: "webmcp" })
      .expect(200);

    // Both arrive over the same API; only the caller can say which surface it is.
    expect((await leads?.get(form))?.source).toBe("web");
    expect((await leads?.get(agent))?.source).toBe("webmcp");
  });

  it("keeps what is still owed, and forgets it once it has been sent", async () => {
    const leads = new MemoryLeadStore(() => fixedNow);
    const { service } = harness({ leads });
    const answer = await service.auditWebsite({ url: TRAVEL, email: ADDRESS });
    const reportId = answer.structured.reportId;

    expect(await leads.pending()).toHaveLength(1);
    await leads.markConfirmed(reportId, fixedNow.toISOString());
    await leads.markDelivered(reportId, fixedNow.toISOString());

    expect(await leads.pending()).toEqual([]);
    expect(await leads.get(reportId)).toMatchObject({ email: ADDRESS, deliveredAt: fixedNow.toISOString() });
  });
});

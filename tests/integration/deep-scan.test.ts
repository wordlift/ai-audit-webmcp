import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { MemoryLeadStore } from "../../src/server/adapters/leads/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AuditToolService } from "../../src/server/services/AuditToolService.js";
import { DeepScanGate } from "../../src/server/services/DeepScanGate.js";
import type { AuditToolResult } from "../../src/shared/format/agentSummary.js";

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
  const gate = new DeepScanGate(leads, 30, () => fixedNow);
  const service = new AuditToolService(orchestrator, { graceMs: 5_000, source: "mcp" }, gate);
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

  it("asks for an address before reading further, and says why", async () => {
    const { service, leads } = harness();

    await expect(service.auditWebsite({ url: TRAVEL, depth: "deep" })).rejects.toMatchObject({
      code: "email_required",
    });
    expect(await leads?.pending()).toEqual([]);
  });

  it("files the address beside the report, never inside it", async () => {
    const { service, leads, orchestrator } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });
    const reportId = answer.structured.reportId;

    const [lead] = (await leads?.pending()) ?? [];
    expect(lead).toMatchObject({ reportId, email: ADDRESS, source: "mcp" });
    expect(lead.deliveredAt).toBeUndefined();

    const report = await orchestrator.get(reportId);
    expect(report?.scanDepth).toBe("deep");
    expect(JSON.stringify(report)).not.toContain(ADDRESS);
    expect(JSON.stringify(report)).not.toContain("example.com");
  });

  it("shows the person the address they gave without spelling it out", async () => {
    const { service } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });

    expect(answer.text).toContain("re******@example.com");
    expect(answer.text).not.toContain(ADDRESS);
    expect((answer.structured as AuditToolResult).notes.join(" ")).toContain("stays public and free");
  });

  it("refuses to take an address it has no use for", async () => {
    const { service } = harness();

    await expect(service.auditWebsite({ url: TRAVEL, email: ADDRESS })).rejects.toMatchObject({
      code: "email_not_needed",
    });
  });

  it("says so rather than silently running a basic scan when deep scans are unavailable", async () => {
    const { service } = harness({ leads: null });

    await expect(service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS })).rejects.toMatchObject({
      code: "deep_scan_unavailable",
    });
  });

  it("holds the web form to the same exchange", async () => {
    const { app, leads } = harness();
    const requestId = randomUUID();

    const refused = await request(app)
      .post("/api/reports")
      .send({ requestId, url: TRAVEL, depth: "deep" })
      .expect(400);
    expect(refused.body.error).toBe("email_required");

    const accepted = await request(app)
      .post("/api/reports")
      .send({ requestId, url: TRAVEL, depth: "deep", email: ADDRESS })
      .expect(200);
    expect(accepted.body.scanDepth).toBe("deep");
    expect(JSON.stringify(accepted.body)).not.toContain(ADDRESS);
    expect((await leads?.pending())?.[0]).toMatchObject({ reportId: requestId, source: "web" });
  });

  it("keeps the page's own form and an agent driving that page apart", async () => {
    const { app, leads } = harness();

    const form = randomUUID();
    await request(app)
      .post("/api/reports")
      .send({ requestId: form, url: TRAVEL, depth: "deep", email: ADDRESS })
      .expect(200);

    const agent = randomUUID();
    await request(app)
      .post("/api/reports")
      .send({ requestId: agent, url: TRAVEL, depth: "deep", email: "agent@example.com", surface: "webmcp" })
      .expect(200);

    // Both arrive over the same API; only the caller can say which surface it is.
    expect((await leads?.get(form))?.source).toBe("web");
    expect((await leads?.get(agent))?.source).toBe("webmcp");
  });

  it("keeps what is still owed, and forgets it once it has been sent", async () => {
    const leads = new MemoryLeadStore(() => fixedNow);
    const { service } = harness({ leads });
    const answer = await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });
    const reportId = answer.structured.reportId;

    expect(await leads.pending()).toHaveLength(1);
    await leads.markConfirmed(reportId, fixedNow.toISOString());
    await leads.markDelivered(reportId, fixedNow.toISOString());

    expect(await leads.pending()).toEqual([]);
    expect(await leads.get(reportId)).toMatchObject({ email: ADDRESS, deliveredAt: fixedNow.toISOString() });
  });
});

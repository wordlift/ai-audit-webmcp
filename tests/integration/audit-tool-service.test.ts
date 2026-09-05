import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AuditToolService } from "../../src/server/services/AuditToolService.js";
import { ToolCallError } from "../../src/server/services/toolErrors.js";
import type { AuditToolResult } from "../../src/shared/format/agentSummary.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";

function harness(options: { graceMs?: number } = {}) {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  const service = new AuditToolService(orchestrator, {
    graceMs: options.graceMs ?? 5_000,
    wait: async (ms) => {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 5)));
    },
  });
  return { app: createApp({ orchestrator }), orchestrator, service };
}

describe("audit tool service", () => {
  it("answers audit-website with the finished report", async () => {
    const { service } = harness();
    const answer = await service.auditWebsite({ url: TRAVEL });
    const result = answer.structured as AuditToolResult;

    expect(result.archetype).toBe("travel-hospitality");
    expect(result.partial).toBe(false);
    expect(result.reportUrl).toBe(`https://audit.example/reports/${result.reportId}`);
    expect(answer.text).toContain("travel");
  });

  it("describes the same site the same way through REST and through the service", async () => {
    const { app, service } = harness();
    const rest = await request(app)
      .post("/api/reports")
      .send({ requestId: randomUUID(), url: TRAVEL })
      .expect(200);
    const tool = (await service.auditWebsite({ url: TRAVEL })).structured as AuditToolResult;

    expect(tool.archetype).toBe(rest.body.classification.primaryArchetype);
    expect(tool.agentReadinessScore).toBe(rest.body.score.value);
    expect(tool.foundationAuditScore).toBe(rest.body.foundationAudit?.score ?? null);
    expect(tool.priorityGaps.map((gap) => gap.actionId)).toEqual(
      rest.body.priorities.map((priority: { actionId: string }) => priority.actionId),
    );
    expect(tool.pagesAnalyzed).toBe(rest.body.contextGraph.pages.length);
    expect(Object.values(tool.stages).reduce((total, stage) => total + stage.expected, 0)).toBe(
      rest.body.capabilities.filter((capability: { expected: boolean }) => capability.expected).length,
    );
  });

  it("hands back a pollable report id when the audit outlives the grace window", async () => {
    const { service, orchestrator } = harness({ graceMs: 0 });
    vi.spyOn(orchestrator, "create").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(orchestrator, "get").mockResolvedValue(null);

    const answer = await service.auditWebsite({ url: TRAVEL });

    expect(answer.structured).toMatchObject({ status: "running" });
    expect(answer.text).toContain("still running");
    expect(answer.structured.reportId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("completes a started audit through get-audit-report", async () => {
    const { service } = harness();
    const started = await service.auditWebsite({ url: TRAVEL });
    const again = await service.getAuditReport({ reportId: started.structured.reportId });

    expect(again.structured).toMatchObject({ reportId: started.structured.reportId, archetype: "travel-hospitality" });
    expect("status" in again.structured).toBe(false);
  });

  it("returns the Terms of Action a reviewer is about to be interviewed on", async () => {
    const { service } = harness();
    const { structured } = await service.auditWebsite({ url: TRAVEL });
    const inspected = await service.inspectTermsOfAction({ reportId: structured.reportId });

    expect(inspected.structured.actions.length).toBeGreaterThan(0);
    expect(inspected.structured.entities.length).toBeGreaterThan(0);
    expect(inspected.text).toContain("Terms of Action");
  });

  it("turns a reviewer's decision into an immutable child report", async () => {
    const { service } = harness();
    const { structured } = await service.auditWebsite({ url: TRAVEL });
    const inspected = await service.inspectTermsOfAction({ reportId: structured.reportId });
    const target = inspected.structured.actions[0];

    const refined = await service.refineTermsOfAction({
      reportId: structured.reportId,
      businessRole: "destination-organization",
      actionDecisions: [{ actionId: target.actionId, decision: "confirm", boundary: "owned" }],
    });

    expect(refined.structured.parentReportId).toBe(structured.reportId);
    expect(refined.structured.reportId).not.toBe(structured.reportId);
    expect(refined.structured.decisionsApplied).toBeGreaterThan(0);
    expect(refined.structured.agentReadinessScore).toBe((structured as AuditToolResult).agentReadinessScore);

    const parent = await service.getAuditReport({ reportId: structured.reportId });
    expect(parent.structured).toMatchObject({ reportId: structured.reportId });
  });

  it("explains one capability and says which actions exist when asked for one that does not", async () => {
    const { service } = harness();
    const { structured } = await service.auditWebsite({ url: TRAVEL });
    const inspected = await service.inspectTermsOfAction({ reportId: structured.reportId });
    const actionId = inspected.structured.actions[0].actionId;

    const explained = await service.explainCapability({ reportId: structured.reportId, actionId });
    expect(explained.structured.actionId).toBe(actionId);

    // Every action the map recommends closing carries a contract, and its URL is absolute so a
    // remote caller can fetch it without knowing where the service lives.
    const withContract = await Promise.all(
      inspected.structured.actions.map((action) =>
        service.explainCapability({ reportId: structured.reportId, actionId: action.actionId }),
      ),
    );
    const contractUrls = withContract.map((answer) => answer.structured.contractUrl).filter(Boolean);
    expect(contractUrls.length).toBeGreaterThan(0);
    expect(contractUrls[0]).toContain(`https://audit.example/api/reports/${structured.reportId}/contracts/`);

    await expect(
      service.explainCapability({ reportId: structured.reportId, actionId: "not.an.action" }),
    ).rejects.toMatchObject({ code: "action_not_found" });
  });

  it("returns the foundation audit findings", async () => {
    const { service } = harness();
    const { structured } = await service.auditWebsite({ url: TRAVEL });
    const foundation = await service.explainFoundationAudit({ reportId: structured.reportId });

    expect(foundation.structured.score).toBeGreaterThan(0);
    expect(foundation.text).toContain("foundation score");
  });

  it("fails typed when a report is unknown or an input is malformed", async () => {
    const { service } = harness();

    await expect(service.getAuditReport({ reportId: randomUUID() })).rejects.toMatchObject({
      code: "report_not_found",
    });
    await expect(service.getAuditReport({ reportId: "not-a-report" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(service.auditWebsite({})).rejects.toBeInstanceOf(ToolCallError);
  });
});

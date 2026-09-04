import { randomUUID } from "node:crypto";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { MemoryClaimStore } from "../../src/server/adapters/claims/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AuditToolService } from "../../src/server/services/AuditToolService.js";
import type { AuditToolResult } from "../../src/shared/format/agentSummary.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";

function harness(options: { claims?: MemoryClaimStore | null } = {}) {
  const claims = options.claims === null ? undefined : (options.claims ?? new MemoryClaimStore(() => fixedNow));
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  return {
    claims,
    orchestrator,
    service: new AuditToolService(orchestrator, { graceMs: 5_000, source: "mcp", claims }),
  };
}

async function auditedReport(service: AuditToolService) {
  const answer = await service.auditWebsite({ url: TRAVEL });
  return answer.structured as AuditToolResult;
}

const decision = (actionId: string) => ({
  businessRole: "destination-organization",
  actionDecisions: [{ actionId, decision: "confirm" as const, boundary: "owned" as const }],
});

describe("who may publish a refinement", () => {
  it("hands the caller that ran the audit a claim, and only the hash is kept", async () => {
    const { service, claims } = harness();
    const report = await auditedReport(service);

    expect(report.claimToken).toMatch(/^[\w-]{20,}$/);
    const stored = await claims?.get(report.reportId);
    expect(stored?.tokenHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(report.claimToken as string);
  });

  it("refines the report for the caller holding the claim", async () => {
    const { service } = harness();
    const report = await auditedReport(service);
    const inspected = await service.inspectTermsOfAction({ reportId: report.reportId });

    const refined = await service.refineTermsOfAction({
      reportId: report.reportId,
      claimToken: report.claimToken,
      ...decision(inspected.structured.actions[0].actionId),
    });

    expect(refined.structured.parentReportId).toBe(report.reportId);
  });

  it("refuses a visitor who has the link but not the claim", async () => {
    const { service } = harness();
    const report = await auditedReport(service);
    const inspected = await service.inspectTermsOfAction({ reportId: report.reportId });
    const assertions = decision(inspected.structured.actions[0].actionId);

    // Reading is free to everyone; publishing a judgment about the business is not.
    await expect(service.inspectTermsOfAction({ reportId: report.reportId })).resolves.toBeTruthy();
    await expect(
      service.refineTermsOfAction({ reportId: report.reportId, ...assertions }),
    ).rejects.toMatchObject({ code: "report_not_yours" });
    await expect(
      service.refineTermsOfAction({ reportId: report.reportId, claimToken: "not-the-token", ...assertions }),
    ).rejects.toMatchObject({ code: "report_not_yours" });
  });

  it("does not let one caller's claim open another caller's report", async () => {
    const { service } = harness();
    const mine = await auditedReport(service);
    const theirs = await auditedReport(service);
    const inspected = await service.inspectTermsOfAction({ reportId: theirs.reportId });

    await expect(
      service.refineTermsOfAction({
        reportId: theirs.reportId,
        claimToken: mine.claimToken,
        ...decision(inspected.structured.actions[0].actionId),
      }),
    ).rejects.toMatchObject({ code: "report_not_yours" });
  });

  it("leaves the in-page surface as open as it has always been", async () => {
    const { service } = harness({ claims: null });
    const report = await auditedReport(service);
    const inspected = await service.inspectTermsOfAction({ reportId: report.reportId });

    expect(report.claimToken).toBeUndefined();
    await expect(
      service.refineTermsOfAction({ reportId: report.reportId, ...decision(inspected.structured.actions[0].actionId) }),
    ).resolves.toBeTruthy();
  });

  it("hands over the claim even when the audit outlives the answer", async () => {
    const { service, orchestrator, claims } = harness();
    vi.spyOn(orchestrator, "create").mockImplementation(() => new Promise(() => {}));
    vi.spyOn(orchestrator, "get").mockResolvedValue(null);
    const slow = new AuditToolService(orchestrator, {
      graceMs: 0,
      source: "mcp",
      claims,
      wait: async () => {},
    });

    const answer = await slow.auditWebsite({ url: TRAVEL });
    const running = answer.structured as { status: string; reportId: string; claimToken?: string };

    // Waiting for a slow site must not cost the caller the right to refine what it is waiting for.
    expect(running.status).toBe("running");
    expect(running.claimToken).toMatch(/^[\w-]{20,}$/);
    expect(await claims?.get(running.reportId)).not.toBeNull();
  });

  it("says the report is unknown before it says the claim is wrong", async () => {
    const { service } = harness();

    await expect(
      service.refineTermsOfAction({ reportId: randomUUID(), claimToken: "anything", ...decision("availability.check") }),
    ).rejects.toMatchObject({ code: "report_not_found" });
  });
});

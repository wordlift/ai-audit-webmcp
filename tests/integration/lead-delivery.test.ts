import { randomUUID } from "node:crypto";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { HubSpotLeadDelivery, MemoryLeadStore, type LeadDelivery } from "../../src/server/adapters/leads/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { AuditToolService } from "../../src/server/services/AuditToolService.js";
import { DeepScanDelivery } from "../../src/server/services/DeepScanDelivery.js";
import { DeepScanGate } from "../../src/server/services/DeepScanGate.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";
const ADDRESS = "reviewer@example.com";

function harness(delivery?: LeadDelivery) {
  const leads = new MemoryLeadStore(() => fixedNow);
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
  });
  const deepScan = new DeepScanDelivery({
    leads,
    delivery,
    publicReportUrl: (id) => orchestrator.reportUrl(id),
    loadReport: (id) => orchestrator.get(id),
    now: () => fixedNow,
  });
  const service = new AuditToolService(
    orchestrator,
    { graceMs: 5_000, source: "mcp" },
    new DeepScanGate(leads, 30, () => fixedNow),
    deepScan,
  );
  return { leads, orchestrator, service, deepScan };
}

function recordingDelivery(): LeadDelivery & { sent: Array<Record<string, unknown>> } {
  const sent: Array<Record<string, unknown>> = [];
  return {
    name: "recording",
    sent,
    async deliver(lead, report) {
      sent.push({ email: lead.email, ...report });
    },
  };
}

/** Settling happens after the answer, so a test waits for the queue to drain rather than the call. */
const settled = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

describe("sending a deep scan's report", () => {
  it("sends the report to the address that bought it, once", async () => {
    const delivery = recordingDelivery();
    const { service, leads } = harness(delivery);

    const answer = await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });
    await settled();

    expect(delivery.sent).toHaveLength(1);
    expect(delivery.sent[0]).toMatchObject({
      email: ADDRESS,
      canonicalUrl: expect.stringContaining("alpina.travel"),
      reportUrl: `https://audit.example/reports/${answer.structured.reportId}`,
    });
    expect(await leads.pending()).toEqual([]);
  });

  it("sends nothing for a basic scan", async () => {
    const delivery = recordingDelivery();
    const { service } = harness(delivery);

    await service.auditWebsite({ url: TRAVEL });
    await settled();

    expect(delivery.sent).toEqual([]);
  });

  it("keeps the debt while the delivery system is down, and pays it once it is back", async () => {
    let healthy = false;
    const sent: string[] = [];
    const flaky: LeadDelivery = {
      name: "flaky",
      async deliver(lead) {
        if (!healthy) throw new Error("HubSpot could not be reached");
        sent.push(lead.email);
      },
    };
    const { service, leads } = harness(flaky);

    const first = await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });
    await settled();
    expect(sent).toEqual([]);
    expect((await leads.pending()).map((lead) => lead.reportId)).toEqual([first.structured.reportId]);

    // The next completed deep scan settles its own report and retries what was still owed.
    healthy = true;
    await service.auditWebsite({ url: "https://shop.example/", depth: "deep", email: "second@example.com" });
    await settled();

    expect(sent).toContain(ADDRESS);
    expect(sent).toContain("second@example.com");
    expect(await leads.pending()).toEqual([]);
  });

  it("retries once immediately when a single submission fails", async () => {
    let attempts = 0;
    const sent: string[] = [];
    const flaky: LeadDelivery = {
      name: "one-bad-attempt",
      async deliver(lead) {
        attempts += 1;
        if (attempts === 1) throw new Error("HubSpot could not be reached");
        sent.push(lead.email);
      },
    };
    const { service, leads } = harness(flaky);

    await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });
    await settled();

    expect(sent).toEqual([ADDRESS]);
    expect(await leads.pending()).toEqual([]);
  });

  it("never lets a delivery failure reach the caller", async () => {
    const exploding: LeadDelivery = {
      name: "exploding",
      async deliver() {
        throw new Error("boom");
      },
    };
    const { service } = harness(exploding);

    await expect(service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS })).resolves.toBeTruthy();
    await settled();
  });

  it("records what is owed when no delivery system is configured", async () => {
    const { service, leads } = harness(undefined);

    const answer = await service.auditWebsite({ url: TRAVEL, depth: "deep", email: ADDRESS });
    await settled();

    expect((await leads.pending())[0]).toMatchObject({ reportId: answer.structured.reportId, email: ADDRESS });
  });
});

describe("the HubSpot form", () => {
  const lead = {
    reportId: randomUUID(),
    email: ADDRESS,
    reportUrl: "https://audit.example/reports/abc",
    source: "mcp" as const,
    requestedAt: fixedNow.toISOString(),
    expiresAt: "2026-09-26T05:00:00.000Z",
  };
  const report = {
    canonicalUrl: "https://alpina.travel/",
    reportUrl: "https://audit.example/reports/abc",
    agentReadinessScore: 22,
    summary: "**Verified** agent readiness: 22/100.",
  };

  it("submits the fields the existing audit's form already knows", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await new HubSpotLeadDelivery({
      portalId: "145813311",
      formGuid: "f4501d72-e16e-4570-8205-0d904487c39f",
      fetchImpl,
    }).deliver(lead, report);

    expect(captured!.url).toBe(
      "https://api.hsforms.com/submissions/v3/integration/submit/145813311/f4501d72-e16e-4570-8205-0d904487c39f",
    );
    const fields = captured!.body.fields as Array<{ name: string; value: string }>;
    expect(fields.map((field) => field.name)).toEqual(["email", "audited_url", "audit_score", "audit_summary"]);
    expect(fields.find((field) => field.name === "email")?.value).toBe(ADDRESS);
    expect(fields.find((field) => field.name === "audit_score")?.value).toBe("22");
    // The form is plain text, and the person needs the link before the prose.
    expect(fields.find((field) => field.name === "audit_summary")?.value).toBe(
      "https://audit.example/reports/abc\n\nVerified agent readiness: 22/100.",
    );
  });

  it("sends the address and nothing it would have to invent", async () => {
    let body = "";
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = String(init?.body);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    await new HubSpotLeadDelivery({ portalId: "p", formGuid: "f", fetchImpl }).deliver(lead, report);

    for (const invented of ["firstname", "lastname", "company", "jobtitle", "phone", "country"]) {
      expect(body).not.toContain(invented);
    }
  });

  it("reports a refusal by its type, never by quoting the submission back", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ errors: [{ errorType: "INVALID_EMAIL", message: `${ADDRESS} is invalid` }] }), {
        status: 400,
      })) as unknown as typeof fetch;

    await expect(
      new HubSpotLeadDelivery({ portalId: "p", formGuid: "f", fetchImpl }).deliver(lead, report),
    ).rejects.toMatchObject({ status: 400, message: expect.not.stringContaining(ADDRESS) });
  });

  it("gives up rather than holding an audit open when HubSpot does not answer", async () => {
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as unknown as typeof fetch;

    await expect(
      new HubSpotLeadDelivery({ portalId: "p", formGuid: "f", timeoutMs: 20, fetchImpl }).deliver(lead, report),
    ).rejects.toThrow(/did not answer in time/);
  });
});

import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { createApp } from "../../src/server/app.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryLeadStore, type DeepScanLead, type LeadDelivery } from "../../src/server/adapters/leads/index.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { MemoryVisitStore } from "../../src/server/adapters/visits/MemoryVisitStore.js";
import { PlatformEgress } from "../../src/server/security/platformEgress.js";
import { VisitorClassifier } from "../../src/server/security/visitorClass.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { movementBetween, Observer, unsubscribeKey } from "../../src/server/services/Observer.js";
import { VisitLedger } from "../../src/server/services/VisitLedger.js";
import type { CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

const START = new Date("2026-09-07T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1_000;
const ALPINA = "https://alpina.travel/";

function recordingDelivery() {
  const sent: Array<{ email: string; subject?: string; summary: string; reportUrl: string; agentReadinessScore: number }> = [];
  const delivery: LeadDelivery & { sent: typeof sent } = {
    name: "recording",
    sent,
    async deliver(lead, report) {
      sent.push({ email: lead.email, summary: report.summary, reportUrl: report.reportUrl, agentReadinessScore: report.agentReadinessScore, ...(report.subject ? { subject: report.subject } : {}) });
    },
  };
  return delivery;
}

function harness(options: { perTick?: number; intervalDays?: number } = {}) {
  let clock = START;
  const now = () => clock;
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  const leads = new MemoryLeadStore(now);
  const store = new MemoryReportStore(900_000, now);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), { publicAppUrl: "https://audit.example/", ttlDays: 30, now });
  const visits = new VisitLedger({
    store: new MemoryVisitStore(now),
    classifier: new VisitorClassifier({ platforms: new PlatformEgress([]), crawlers: new PlatformEgress([]) }),
    ttlDays: 30,
    flushMs: 5,
    now,
  });
  const delivery = recordingDelivery();
  const observer = new Observer({
    orchestrator,
    leads,
    delivery,
    visits,
    now,
    intervalDays: options.intervalDays ?? 7,
    perTick: options.perTick ?? 5,
    log: () => undefined,
  });
  return { leads, orchestrator, visits, delivery, observer, advance, now };
}

/** A deep scan someone asked for by email, delivered: the address Observe may act for. */
async function deliveredLead(h: ReturnType<typeof harness>, url = ALPINA, email = "owner@example.com"): Promise<DeepScanLead> {
  const report = await h.orchestrator.create({ requestId: randomUUID(), url, depth: "deep" });
  const at = h.now().toISOString();
  const expires = new Date(h.now().getTime() + 30 * DAY).toISOString();
  await h.leads.record({ reportId: report.id, email, reportUrl: `https://audit.example/reports/${report.id}`, source: "web", requestedAt: at, expiresAt: expires });
  return (await h.leads.markDelivered(report.id, at))!;
}

describe("what moves, and what does not", () => {
  const capability = (actionId: string, label: string, state: CapabilityResult["state"], extra: Partial<CapabilityResult> = {}): CapabilityResult => ({
    actionId,
    label,
    description: `${label}.`,
    stage: "act",
    intent: "informational",
    importance: 3,
    expected: true,
    expectationSource: ["archetype"],
    state,
    humanSupport: true,
    agentSupport: state === "agent-ready",
    appliesTo: [],
    evidence: [],
    ...extra,
  });
  const reading = (score: number, capabilities: CapabilityResult[]): ReportRecord => ({
    id: randomUUID(),
    status: "completed",
    phase: "complete",
    mode: "demo",
    requestedUrl: ALPINA,
    createdAt: START.toISOString(),
    expiresAt: new Date(START.getTime() + 30 * DAY).toISOString(),
    actionModelVersion: "0.1.0",
    errors: [],
    evidenceTruncated: false,
    score: { value: score, verifiedWeight: 0, expectedWeight: 9, counts: { expected: 3, ready: 0, unverified: 0, humanOnly: 0, missing: 0 } },
    capabilities,
  });
  const lead: DeepScanLead = { reportId: randomUUID(), email: "owner@example.com", reportUrl: "https://audit.example/reports/x", source: "web", requestedAt: START.toISOString(), expiresAt: new Date(START.getTime() + 30 * DAY).toISOString() };

  it("is silent when nothing changed", () => {
    const same = reading(62, [capability("availability.check", "Check availability", "agent-ready")]);
    expect(movementBetween(same, { ...same, id: randomUUID() }, { days: [], activations: [] }, lead)).toBeNull();
  });

  it("names the score, the capability that stopped answering with the audit's reason, and the one that started", () => {
    const before = reading(62, [capability("availability.check", "Check availability", "agent-ready"), capability("site.search", "Search the site", "unverified")]);
    const after = reading(48, [
      capability("availability.check", "Check availability", "unverified", {
        evidence: [
          {
            id: "entry-point-availability.check-CheckAction",
            actionId: "availability.check",
            audience: "agent",
            kind: "api-result",
            sourceUrl: "https://alpina.travel/api/availability?q=lungau",
            claim: "The site's declared CheckAction entry point did not answer when an agent executed it: it answered HTTP 500",
            confidence: 0.9,
            verification: "failed",
            collectedAt: START.toISOString(),
          },
        ],
      }),
      capability("site.search", "Search the site", "agent-ready"),
    ]);
    const movement = movementBetween(before, after, null, lead);
    expect(movement?.lines).toEqual([
      "Readiness moved from 62 to 48 of 100.",
      "Check availability stopped answering: the site's declared CheckAction entry point did not answer when an agent executed it: it answered HTTP 500.",
      "Search the site started answering.",
    ]);
  });

  it("tells the first crawler and Google's first read once, and every failed activation since the last read", () => {
    const same = reading(62, []);
    const ledger = {
      days: [{ reportId: lead.reportId, day: "2026-09-06", counts: { "crawler:googlebot": 2, "crawler:claimed-googlebot": 5, human: 3 }, expiresAt: lead.expiresAt }],
      activations: [
        { day: "2026-09-06", tool: "check-availability", surface: "webmcp", outcome: "ok", count: 4 },
        { day: "2026-09-07", tool: "check-availability", surface: "web", outcome: "failed:upstream_timeout", count: 2 },
        { day: "2026-08-30", tool: "check-availability", surface: "web", outcome: "failed:invalid_input", count: 1 },
      ],
    };
    const movement = movementBetween(same, same, ledger, { ...lead, watchedAt: "2026-09-05T00:00:00.000Z" });
    expect(movement).toEqual({
      seenCrawler: true,
      seenGoogle: true,
      lines: [
        "The first crawler read the report: googlebot, 2 times.",
        "Google read the report for the first time, verified against its own address ranges.",
        "2 agents tried check-availability and it failed: upstream timeout.",
      ],
    });
    // Told once: with both firsts recorded and no failure since, the same ledger is silence.
    expect(movementBetween(same, same, { ...ledger, activations: [] }, { ...lead, seenCrawlerAt: START.toISOString(), seenGoogleAt: START.toISOString() })).toBeNull();
  });
});

describe("the cadence", () => {
  it("re-reads a delivered address once per interval, at most so many per tick, and sends nothing when nothing moved", async () => {
    const h = harness({ perTick: 2, intervalDays: 7 });
    const leads = [await deliveredLead(h, ALPINA, "one@example.com"), await deliveredLead(h, "https://shop.example/", "two@example.com"), await deliveredLead(h, "https://saas.example/", "three@example.com")];
    // An address whose report was never delivered is not acted for; neither is one that opted out.
    const pending = await h.orchestrator.create({ requestId: randomUUID(), url: "https://publisher.example/", depth: "deep" });
    await h.leads.record({ reportId: pending.id, email: "four@example.com", reportUrl: "https://audit.example/reports/x", source: "mcp", requestedAt: h.now().toISOString(), expiresAt: leads[0]!.expiresAt });
    const out = await deliveredLead(h, "https://insurance.example/", "five@example.com");
    await h.leads.markUnsubscribed(out.reportId, h.now().toISOString());

    expect(await h.observer.tick()).toEqual(["unchanged", "unchanged"]);
    expect(await h.observer.tick()).toEqual(["unchanged"]);
    expect(await h.observer.tick()).toEqual([]);
    expect(h.delivery.sent).toEqual([]);
    for (const lead of leads) expect((await h.leads.get(lead.reportId))?.watchedAt).toBe(START.toISOString());
    expect((await h.leads.get(pending.id))?.watchedAt).toBeUndefined();
    expect((await h.leads.get(out.reportId))?.watchedAt).toBeUndefined();

    // Six days on, nothing is due; on the seventh, everything is again.
    h.advance(6 * DAY);
    expect(await h.observer.tick()).toEqual([]);
    h.advance(DAY);
    expect(await h.observer.tick()).toHaveLength(2);
    expect(h.observer.summary()).toMatchObject({ enabled: true, intervalDays: 7, watched: 5, sent: 0 });
  });

  it("writes when something moved, once, with the report and the one link that stops it", async () => {
    const h = harness();
    const lead = await deliveredLead(h);
    h.visits.record(lead.reportId, "crawler:googlebot");
    h.visits.record(lead.reportId, "crawler:gptbot");
    h.visits.recordActivation("alpina.travel", "check-availability", "webmcp", "failed", "upstream_timeout");
    await h.visits.flush();

    expect(await h.observer.tick()).toEqual(["sent"]);
    expect(h.delivery.sent).toHaveLength(1);
    const note = h.delivery.sent[0]!;
    expect(note).toMatchObject({ email: "owner@example.com", subject: "movement" });
    expect(note.summary).toContain("What moved on alpina.travel");
    expect(note.summary).toContain("The first crawler read the report: googlebot, 1 time.");
    expect(note.summary).toContain("Google read the report for the first time");
    expect(note.summary).toContain("1 agent tried check-availability and it failed: upstream timeout.");
    expect(note.summary).toContain(`Stop these notes: https://audit.example/api/observe/unsubscribe/${lead.reportId}/${unsubscribeKey(lead)}`);
    expect(note.reportUrl).toMatch(/^https:\/\/audit\.example\/reports\/[0-9a-f-]{36}$/);
    expect(note.reportUrl).not.toContain(lead.reportId);
    const after = await h.leads.get(lead.reportId);
    expect(after).toMatchObject({ seenCrawlerAt: START.toISOString(), seenGoogleAt: START.toISOString(), movedAt: START.toISOString() });

    // A week later, with nothing new, nothing is written: the firsts were told, the failure is old.
    h.advance(7 * DAY);
    expect(await h.observer.tick()).toEqual(["unchanged"]);
    expect(h.delivery.sent).toHaveLength(1);
  });

  it("does nothing at all when the interval is zero", async () => {
    const h = harness({ intervalDays: 0 });
    await deliveredLead(h);
    expect(h.observer.enabled).toBe(false);
    expect(await h.observer.tick()).toEqual([]);
    expect(h.delivery.sent).toEqual([]);
  });
});

describe("the one link that stops it", () => {
  it("accepts only the key bound to the address, then stops the re-reads", async () => {
    const h = harness();
    const lead = await deliveredLead(h);
    const app = createApp({ orchestrator: h.orchestrator, leads: h.leads, leadDelivery: h.delivery, rateLimits: { enabled: false } });

    await request(app).get(`/api/observe/unsubscribe/${lead.reportId}/not-the-key`).expect(404);
    await request(app).get(`/api/observe/unsubscribe/${randomUUID()}/${unsubscribeKey(lead)}`).expect(404);
    expect((await h.leads.get(lead.reportId))?.unsubscribedAt).toBeUndefined();

    const done = await request(app).get(`/api/observe/unsubscribe/${lead.reportId}/${unsubscribeKey(lead)}`).expect(200);
    expect(done.text).toContain("The report stays at its link.");
    expect((await h.leads.get(lead.reportId))?.unsubscribedAt).toBeDefined();
    expect(await h.leads.watchable()).toEqual([]);
    expect(await h.observer.tick()).toEqual([]);
    // The report itself is untouched.
    expect((await h.orchestrator.get(lead.reportId))?.status).toBe("completed");
  });

  it("runs a tick for the scheduler that holds the token, and for nobody else", async () => {
    const h = harness();
    const lead = await deliveredLead(h);
    const app = createApp({
      orchestrator: h.orchestrator,
      leads: h.leads,
      leadDelivery: h.delivery,
      rateLimits: { enabled: false },
      observe: { intervalDays: 7, tickMinutes: 0, perTick: 5, tickToken: "scheduler-token-0123456789" },
    });

    await request(app).post("/api/observe/tick").expect(401);
    await request(app).post("/api/observe/tick").set("x-observe-token", "not-the-token-0123456789").expect(401);
    expect((await h.leads.get(lead.reportId))?.watchedAt).toBeUndefined();

    const ran = await request(app).post("/api/observe/tick").set("x-observe-token", "scheduler-token-0123456789").expect(200);
    expect(ran.body).toMatchObject({ ran: 1, outcomes: ["unchanged"], scheduled: true, tickMinutes: 0, watched: 1 });
    expect((await h.leads.get(lead.reportId))?.watchedAt).toBeDefined();

    // Without Observe there is nothing to tick; without a token nobody may.
    await request(createApp({ orchestrator: h.orchestrator, leads: h.leads, rateLimits: { enabled: false } })).post("/api/observe/tick").expect(404);
    const untokened = createApp({ orchestrator: h.orchestrator, leads: h.leads, leadDelivery: h.delivery, rateLimits: { enabled: false }, observe: { intervalDays: 7, perTick: 5 } });
    await request(untokened).post("/api/observe/tick").set("x-observe-token", "anything-at-all-0123456789").expect(401);
  });

  it("is reported on health, and absent when Observe is not configured", async () => {
    const h = harness();
    const quiet = await request(createApp({ orchestrator: h.orchestrator, leads: h.leads, leadDelivery: h.delivery, rateLimits: { enabled: false } })).get("/api/health").expect(200);
    expect(quiet.body.observe).toBeNull();
    const app = createApp({ orchestrator: h.orchestrator, leads: h.leads, leadDelivery: h.delivery, rateLimits: { enabled: false }, observe: { intervalDays: 7, tickMinutes: 60, perTick: 5 } });
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.observe).toMatchObject({ enabled: true, intervalDays: 7, watched: 0, sent: 0 });
  });
});

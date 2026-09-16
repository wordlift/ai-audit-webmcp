import { randomUUID } from "node:crypto";
import request from "supertest";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { assertionsFor, carriesCode, decisionsFrom, entityKey, mergeDecisions, verificationCode } from "../../src/domain/engine/contextEngine.js";
import { createApp } from "../../src/server/app.js";
import { MemoryContextEngineStore } from "../../src/server/adapters/engines/index.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator } from "../../src/server/services/AuditOrchestrator.js";
import { ContextEngines } from "../../src/server/services/ContextEngines.js";
import { leadSignals } from "../../src/domain/engine/signals.js";
import type { ReportRecord } from "../../src/shared/types/index.js";

const fixedNow = new Date("2026-09-16T05:00:00.000Z");
const TRAVEL = "https://alpina.travel/";
const KEY = "x-context-engine-key";

function harness(site: { body?: string; wellKnown?: string } = {}) {
  let now = fixedNow;
  const clock = () => now;
  const store = new MemoryReportStore(900_000, clock);
  const engines = new ContextEngines({
    store: new MemoryContextEngineStore(),
    now: clock,
    fetch: async (url) =>
      url.endsWith("/.well-known/wordlift-verification.txt")
        ? site.wellKnown === undefined ? { status: 404, body: "" } : { status: 200, body: site.wellKnown }
        : { status: 200, body: site.body ?? "<html><head></head></html>" },
  });
  // No reuse window: every audit here is a new read of the site, the case decisions must survive.
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: clock,
    engines,
    reuseWindowMs: 0,
  });
  const app = createApp({ orchestrator, rateLimits: { enabled: false } });
  return { app, orchestrator, engines, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

async function audit(app: ReturnType<typeof createApp>): Promise<ReportRecord> {
  const response = await request(app).post("/api/reports").send({ requestId: randomUUID(), url: TRAVEL });
  expect(response.status).toBe(200);
  return response.body as ReportRecord;
}

function pick(report: ReportRecord) {
  const entities = report.contextGraph!.entities;
  return { first: entities[0]!, second: entities[1]!, action: report.capabilities!.find((capability) => capability.expected)!.actionId };
}

describe("the Context Engine above the reports", () => {
  it("records every finished read of a site on one engine, readable by anyone without a secret", async () => {
    const { app } = harness();
    const report = await audit(app);
    const engine = await request(app).get(`/api/engines/for-report/${report.id}`);
    expect(engine.status).toBe(200);
    expect(engine.body).toMatchObject({ host: "alpina.travel", status: "draft", claimed: false, owner: { state: "unverified" }, latestReportId: report.id, standing: "none" });
    expect(engine.body.snapshots[0].entities.length).toBeGreaterThan(0);
    expect(JSON.stringify(engine.body)).not.toMatch(/hash/);
  });

  it("keeps a review filed with the holder's key, and carries it onto the next read of the site", async () => {
    const { app, advance } = harness();
    const report = await audit(app);
    const claim = await request(app).post(`/api/engines/for-report/${report.id}/claim`);
    expect(claim.body).toMatchObject({ standing: "holder", engine: { status: "claimed", claimed: true } });
    const key = claim.body.key as string;

    const { first, second, action } = pick(report);
    const refined = await request(app)
      .post(`/api/reports/${report.id}/refine`)
      .set(KEY, key)
      .send({ primaryEntityIds: [first.id], demotedEntityIds: [second.id], actionDecisions: [{ actionId: action, decision: "confirm", boundary: "owned" }] });
    expect(refined.status).toBe(200);
    expect(refined.headers["x-context-engine"]).toBe("filed");
    expect(refined.body.refinement).toMatchObject({ filedBy: "reviewer" });

    const afterReview = await request(app).get(`/api/engines/for-report/${report.id}`).set(KEY, key);
    expect(afterReview.body).toMatchObject({ latestReviewedReportId: refined.body.id, standing: "reviewer", decisions: { total: 3, entities: 2, actions: 1, byOwner: 0 } });

    advance(60_000);
    const next = await audit(app);
    const carried = await request(app).get(`/api/engines/for-report/${next.id}`);
    const reviewedId = carried.body.latestReviewedReportId as string;
    expect(reviewedId).not.toBe(refined.body.id);
    const reviewed = (await request(app).get(`/api/reports/${reviewedId}`)).body as ReportRecord;
    expect(reviewed.parentReportId).toBe(next.id);
    expect(reviewed.refinement).toMatchObject({ carried: true, filedBy: "reviewer" });
    const entities = reviewed.contextGraph!.entities;
    expect(entities.find((entity) => entity.name === first.name)?.humanPriority).toBe("primary");
    expect(entities.find((entity) => entity.name === second.name)?.humanPriority).toBe("demoted");
    // Readiness is the evidence's alone: the carried review moves no action to agent-ready.
    expect(reviewed.score?.value).toBe(next.score?.value);
  });

  it("files nothing on the engine for a review without the key, or with a pending claim's", async () => {
    const { app } = harness();
    const report = await audit(app);
    await request(app).post(`/api/engines/for-report/${report.id}/claim`);
    const second = await request(app).post(`/api/engines/for-report/${report.id}/claim`);
    expect(second.body.standing).toBe("pending");

    const { first } = pick(report);
    const anonymous = await request(app).post(`/api/reports/${report.id}/refine`).send({ primaryEntityIds: [first.id] });
    expect(anonymous.status).toBe(200);
    expect(anonymous.headers["x-context-engine"]).toBeUndefined();
    const pending = await request(app).post(`/api/reports/${report.id}/refine`).set(KEY, second.body.key).send({ primaryEntityIds: [first.id] });
    expect(pending.headers["x-context-engine"]).toBe("not-filed");
    expect(pending.body.refinement.filedBy).toBeUndefined();

    const engine = await request(app).get(`/api/engines/for-report/${report.id}`);
    expect(engine.body.decisions.total).toBe(0);
    expect(engine.body.latestReviewedReportId).toBeUndefined();
    // A pending claim cannot hand out a review either.
    expect((await request(app).post("/api/engines/alpina.travel/review-token").set(KEY, second.body.key)).status).toBe(403);
  });

  it("makes the claimant the verified owner once the site carries the code, and a pending claim takes over", async () => {
    const site: { body?: string; wellKnown?: string } = {};
    const { app } = harness(site);
    const report = await audit(app);
    const holder = (await request(app).post(`/api/engines/for-report/${report.id}/claim`)).body.key as string;
    const owner = (await request(app).post(`/api/engines/for-report/${report.id}/claim`)).body.key as string;

    const verification = await request(app).get("/api/engines/alpina.travel/verification").set(KEY, owner);
    expect(verification.body.metaTag).toBe(`<meta name="wordlift-site-verification" content="${verification.body.code}">`);
    const notYet = await request(app).post("/api/engines/alpina.travel/verify").set(KEY, owner);
    expect(notYet.status).toBe(409);

    site.body = `<html><head><meta name="wordlift-site-verification" content="${verification.body.code}"></head></html>`;
    const verified = await request(app).post("/api/engines/alpina.travel/verify").set(KEY, owner);
    expect(verified.status).toBe(200);
    expect(verified.body.owner).toMatchObject({ state: "verified", method: "meta-tag" });

    // The earlier holder's key stops working; the owner's reviews are the owner's.
    const { first } = pick(report);
    const stale = await request(app).post(`/api/reports/${report.id}/refine`).set(KEY, holder).send({ primaryEntityIds: [first.id] });
    expect(stale.headers["x-context-engine"]).toBe("not-filed");
    const byOwner = await request(app).post(`/api/reports/${report.id}/refine`).set(KEY, owner).send({ primaryEntityIds: [first.id] });
    expect(byOwner.body.refinement.filedBy).toBe("owner");
    const engine = await request(app).get(`/api/engines/for-report/${report.id}`).set(KEY, owner);
    expect(engine.body).toMatchObject({ standing: "owner", decisions: { byOwner: 1 } });
  });

  it("hands a day-long review token to the holder, which files like the key and then expires", async () => {
    const { app, advance } = harness();
    const report = await audit(app);
    const key = (await request(app).post(`/api/engines/for-report/${report.id}/claim`)).body.key as string;
    const token = await request(app).post("/api/engines/alpina.travel/review-token").set(KEY, key);
    expect(token.status).toBe(200);

    const { first } = pick(report);
    const filed = await request(app).post(`/api/reports/${report.id}/refine`).set(KEY, token.body.token).send({ primaryEntityIds: [first.id] });
    expect(filed.headers["x-context-engine"]).toBe("filed");

    advance(25 * 60 * 60 * 1_000);
    const expired = await request(app).post(`/api/reports/${report.id}/refine`).set(KEY, token.body.token).send({ primaryEntityIds: [first.id] });
    expect(expired.headers["x-context-engine"]).toBe("not-filed");
  });
});

describe("relations a review settles", () => {
  it("confirms a relation read from the text, rejects a wrong one, and carries both onto the next read", async () => {
    const { app, orchestrator, advance } = harness();
    const base = await audit(app);
    // A read whose text said two things plainly: one right, one wrong.
    const entities = base.contextGraph!.entities;
    const [a, b, c] = [entities[0]!, entities[1]!, entities[2]!];
    const inferred = [
      { from: a.id, to: b.id, kind: "offers" as const, provenance: "inferred" as const, sourceUrl: TRAVEL, evidence: `${a.name} offers ${b.name}.` },
      { from: a.id, to: c.id, kind: "offers" as const, provenance: "inferred" as const, sourceUrl: TRAVEL, evidence: `${a.name} offers ${c.name}.` },
    ];
    const store = (orchestrator as unknown as { store: { put(report: ReportRecord): Promise<ReportRecord> } }).store;
    const read = await store.put({ ...base, id: randomUUID(), contextGraph: { ...base.contextGraph!, relations: [...(base.contextGraph!.relations ?? []), ...inferred] } });
    const key = (await request(app).post(`/api/engines/for-report/${read.id}/claim`)).body.key as string;

    const refined = await request(app)
      .post(`/api/reports/${read.id}/refine`)
      .set(KEY, key)
      .send({ relationDecisions: [{ from: a.id, kind: "offers", to: b.id, decision: "confirm" }, { from: a.id, kind: "offers", to: c.id, decision: "reject" }, { from: b.id, kind: "brand", to: a.id, decision: "confirm" }] });
    expect(refined.status).toBe(200);
    const relations = (refined.body as ReportRecord).contextGraph!.relations!;
    expect(relations.find((relation) => relation.to === b.id && relation.kind === "offers")?.provenance).toBe("confirmed");
    expect(relations.some((relation) => relation.to === c.id && relation.kind === "offers")).toBe(false);
    expect((refined.body as ReportRecord).refinement!.conflicts).toEqual([`No relation brand from ${b.id} to ${a.id} in this report`]);

    // The next read of the site reads the same sentences again; the engine settles them the same way.
    advance(60_000);
    const next = await audit(app);
    const reread = await store.put({ ...next, id: randomUUID(), contextGraph: { ...next.contextGraph!, relations: [...(next.contextGraph!.relations ?? []), ...inferred] } });
    const assertions = await orchestrator.engines!.carry(reread);
    expect(assertions?.assertions.relationDecisions).toEqual([
      { from: a.id, kind: "offers", to: b.id, decision: "confirm" },
      { from: a.id, kind: "offers", to: c.id, decision: "reject" },
    ]);
  });
});

describe("the funnel and the signals", () => {
  it("counts a step the page reports, keeps a door on the engine as the reason, and ignores names it does not know", async () => {
    const { app, engines } = harness();
    const report = await audit(app);
    expect((await request(app).post(`/api/reports/${report.id}/events`).send({ name: "door_monitor" })).status).toBe(204);
    expect((await request(app).post(`/api/reports/${report.id}/events`).send({ name: "anything_else" })).status).toBe(204);
    expect((await request(app).post(`/api/reports/${randomUUID()}/events`).send({ name: "door_monitor" })).status).toBe(204);
    const engine = await engines.forReport(report);
    expect(engine?.intents?.map((entry) => entry.intent)).toEqual(["monitor"]);
    expect(engine?.activeAt).toBeDefined();
  });

  it("qualifies a lead by counts and states, never by the business's content", async () => {
    const { app, engines } = harness();
    const report = await audit(app);
    await request(app).post(`/api/engines/for-report/${report.id}/claim`);
    await request(app).post(`/api/reports/${report.id}/events`).send({ name: "door_build-context" });
    const signals = leadSignals(report, await engines.forReport(report));
    expect(signals).toMatchObject({ archetype: "travel-hospitality", engine_status: "claimed", claimed: "yes", owner_verified: "no", reviewed: "no", intents: "build-context" });
    expect(Number(signals.entities)).toBe(Number(signals.declared) + Number(signals.inferred) + Number(signals.confirmed));
    const names = report.contextGraph!.entities.map((entity) => entity.name);
    expect(Object.values(signals).some((value) => names.some((name) => value.includes(name)))).toBe(false);
  });
});

describe("decisions that survive a new read", () => {
  const entity = (id: string, name: string, type: string) => ({ id, name, types: [type], alternateNames: [], sourceUrls: [], sameAs: [], offers: [], confidence: 0.8 });
  const report = (ids: string[]) =>
    ({
      id: randomUUID(),
      contextGraph: { entities: [entity(ids[0]!, "Samspitze 4", "Apartment"), entity(ids[1]!, "Mariapfarr", "Place"), entity(ids[2]!, "Somebody Else GmbH", "Organization")], relations: [] },
      capabilities: [{ actionId: "availability.check" }],
    }) as unknown as ReportRecord;

  it("finds an entity again by name and role, whatever id the new read minted", () => {
    const before = report(["a", "b", "c"]);
    const after = report(["x", "y", "z"]);
    const decisions = decisionsFrom({ primaryEntityIds: ["a"], demotedEntityIds: ["c"], actionDecisions: [{ actionId: "availability.check", decision: "confirm", boundary: "partner-handoff" }, { actionId: "gone.action", decision: "reject" }] }, before, "reviewer", fixedNow.toISOString());
    expect(entityKey({ name: "Samspitze  4!", types: ["Apartment"] })).toBe(entityKey({ name: "samspitze 4", types: ["Apartment"] }));
    expect(assertionsFor(after, decisions)).toEqual({
      primaryEntityIds: ["x"],
      demotedEntityIds: ["z"],
      actionDecisions: [{ actionId: "availability.check", decision: "confirm", boundary: "partner-handoff" }],
    });
  });

  it("lets a later decision replace an earlier one, except a reviewer's over the owner's", () => {
    const at = fixedNow.toISOString();
    const owner = { entities: [{ key: "k|offering", name: "K", decision: "primary" as const, by: "owner" as const, at }], actions: [], terminology: [] };
    const reviewer = { entities: [{ key: "k|offering", name: "K", decision: "demoted" as const, by: "reviewer" as const, at }], actions: [], terminology: [] };
    expect(mergeDecisions(owner, reviewer).entities[0]!.decision).toBe("primary");
    expect(mergeDecisions(reviewer, { ...owner }).entities[0]!.by).toBe("owner");
  });

  it("reads the verification code only where it is meant to be", () => {
    const code = verificationCode(randomUUID(), "a".repeat(64));
    expect(carriesCode(`<meta content="${code}" name="wordlift-site-verification">`, code, "meta-tag")).toBe(true);
    expect(carriesCode(`<meta name="description" content="${code}">`, code, "meta-tag")).toBe(false);
    expect(carriesCode(`<p>${code}</p>`, code, "meta-tag")).toBe(false);
    expect(carriesCode(`${code}\n`, code, "well-known")).toBe(true);
    expect(carriesCode(`not-${code}`, code, "well-known")).toBe(false);
  });
});

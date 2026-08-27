import { randomUUID } from "node:crypto";
import { compileActionGraph } from "../../domain/action-model/compileGraph.js";
import { compileActionContract } from "../../domain/action-model/compileContract.js";
import { deriveCapability } from "../../domain/action-model/deriveState.js";
import type { ActionModel } from "../../domain/action-model/loadModel.js";
import { recommendationFor, rankPriorities } from "../../domain/action-model/rankPriorities.js";
import { scoreReadiness } from "../../domain/action-model/scoreReadiness.js";
import { inferArchetype } from "../../domain/classification/inferArchetype.js";
import { createReportRequestSchema, recompileReportRequestSchema } from "../../shared/schemas/report.js";
import type { Archetype, CapabilityEvidence, ReportRecord } from "../../shared/types/index.js";
import { FixtureProvider, type FixtureAudit } from "../adapters/fixtures/FixtureProvider.js";
import type { ReportStore } from "../adapters/store/ReportStore.js";
import { ReportRequestError } from "../errors.js";
import { sanitizeEvidence } from "../security/sanitizeEvidence.js";
import { normalizeTargetUrl } from "../security/urlPolicy.js";

export class AuditOrchestrator {
  constructor(
    private readonly store: ReportStore,
    private readonly model: ActionModel,
    private readonly fixtures: FixtureProvider,
    private readonly options: { publicAppUrl: string; ttlDays: number; now?: () => Date },
  ) {}

  async create(input: unknown): Promise<ReportRecord> {
    const request = createReportRequestSchema.parse(input);
    const existing = await this.store.get(request.requestId);
    if (existing) return existing;
    const now = this.now();
    const requestedUrl = normalizeTargetUrl(request.url).toString();
    const fixture = this.fixtures.resolve(request.fixtureId, requestedUrl);
    const running = this.baseRecord(request.requestId, requestedUrl, now);
    await this.store.put(running);
    const finalReport = this.compileFixture(running, fixture, request.archetypeOverride ?? undefined);
    return this.store.finalize(finalReport);
  }

  async get(id: string): Promise<ReportRecord | null> {
    return this.store.get(id);
  }

  async recompile(parentId: string, input: unknown): Promise<ReportRecord> {
    const { archetype } = recompileReportRequestSchema.parse(input);
    const parent = await this.required(parentId);
    if (!parent.capabilities || !parent.classification) {
      throw new ReportRequestError("That report has no observed evidence, so it cannot be recompiled.", 409);
    }
    const evidence = parent.capabilities.flatMap((capability) => capability.evidence);
    const childBase = this.baseRecord(randomUUID(), parent.requestedUrl, this.now(), parent.id);
    const graph = compileActionGraph(this.model, archetype, [`override:${archetype}`]);
    const capabilities = this.capabilities(graph.actions, evidence, parent.canonicalUrl ?? parent.requestedUrl);
    const child: ReportRecord = {
      ...childBase,
      status: parent.status === "partial" ? "partial" : "completed",
      phase: "complete",
      canonicalUrl: parent.canonicalUrl,
      completedAt: this.now().toISOString(),
      classification: { ...parent.classification, primaryArchetype: archetype, override: archetype, provisional: false, provisionalReason: undefined },
      foundationAudit: parent.foundationAudit,
      capabilities,
      score: scoreReadiness(capabilities),
      priorities: rankPriorities(capabilities),
      errors: parent.errors,
    };
    return this.store.createRevision(parent.id, child);
  }

  async reverify(parentId: string): Promise<ReportRecord> {
    const parent = await this.required(parentId);
    const fixture = this.fixtures.resolve(null, parent.requestedUrl);
    const childBase = this.baseRecord(randomUUID(), parent.requestedUrl, this.now(), parent.id);
    const child = this.compileFixture(childBase, fixture, parent.classification?.override);
    return this.store.createRevision(parent.id, child);
  }

  async contract(reportId: string, actionId: string) {
    const report = await this.required(reportId);
    return report.capabilities?.find((capability) => capability.actionId === actionId)?.contract ?? null;
  }

  reportUrl(id: string): string {
    return new URL(`/reports/${id}`, this.options.publicAppUrl).toString();
  }

  private compileFixture(base: ReportRecord, fixture: FixtureAudit, override?: Archetype): ReportRecord {
    if (fixture.status === "failed") {
      return { ...base, status: "failed", phase: "complete", canonicalUrl: fixture.url, completedAt: this.now().toISOString(), errors: fixture.errors };
    }
    const inference = inferArchetype(this.model, fixture.categories, fixture.signals, override);
    const categoryProvenance = fixture.categories.map((category) => `category:${category.name}`);
    const graph = compileActionGraph(this.model, inference.primaryArchetype, categoryProvenance);
    const sanitized = sanitizeEvidence(fixture.evidence);
    const capabilities = this.capabilities(graph.actions, sanitized.evidence, fixture.url);
    const topScore = inference.rankedArchetypes[0]?.score ?? 0;
    return {
      ...base,
      evidenceTruncated: sanitized.truncated,
      status: fixture.status,
      phase: "complete",
      canonicalUrl: fixture.url,
      completedAt: this.now().toISOString(),
      classification: {
        primaryArchetype: inference.primaryArchetype,
        categories: fixture.categories,
        rankedArchetypes: inference.rankedArchetypes,
        confidence: inference.provisional ? "low" : topScore >= 4 ? "high" : "medium",
        margin: inference.margin,
        provisional: inference.provisional,
        provisionalReason: inference.provisionalReason,
        override: inference.override,
        model: "google-v2-fixture",
        collectedAt: this.now().toISOString(),
      },
      foundationAudit: fixture.foundation,
      capabilities,
      score: scoreReadiness(capabilities),
      priorities: rankPriorities(capabilities),
      errors: fixture.errors,
    };
  }

  private capabilities(actions: ReturnType<typeof compileActionGraph>["actions"], evidence: CapabilityEvidence[], siteUrl: string) {
    return actions.map((action) => {
      const capability = deriveCapability(action, evidence.filter((item) => item.actionId === action.id));
      if (["missing", "human-only", "unverified"].includes(capability.state)) {
        capability.recommendation = recommendationFor(capability);
        capability.contract = compileActionContract(action, siteUrl, capability.evidence);
      }
      return capability;
    });
  }

  private baseRecord(id: string, requestedUrl: string, now: Date, parentReportId?: string): ReportRecord {
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.options.ttlDays);
    return {
      id,
      parentReportId,
      status: "running",
      phase: "understanding",
      mode: "demo",
      requestedUrl,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      actionModelVersion: this.model.manifest.version,
      errors: [],
      evidenceTruncated: false,
    };
  }

  private async required(id: string): Promise<ReportRecord> {
    const report = await this.store.get(id);
    if (!report) throw new ReportRequestError(`Report ${id} was not found or has expired.`, 404, "report_not_found");
    return report;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

import { randomUUID } from "node:crypto";
import { compileActionGraph } from "../../domain/action-model/compileGraph.js";
import { compileActionContract } from "../../domain/action-model/compileContract.js";
import { deriveCapability } from "../../domain/action-model/deriveState.js";
import type { ActionModel } from "../../domain/action-model/loadModel.js";
import { recommendationFor, rankPriorities } from "../../domain/action-model/rankPriorities.js";
import { scoreReadiness } from "../../domain/action-model/scoreReadiness.js";
import { detectSiteEvidence } from "../../domain/evidence/detectSiteEvidence.js";
import { inferArchetype } from "../../domain/classification/inferArchetype.js";
import { createReportRequestSchema, recompileReportRequestSchema } from "../../shared/schemas/report.js";
import type {
  Archetype,
  CapabilityEvidence,
  ContentCategory,
  ReportError,
  ReportRecord,
  SiteEntity,
} from "../../shared/types/index.js";
import type { AuditEvidenceBundle, AuditProvider } from "../adapters/audit/AuditProvider.js";
import { auditErrorToReportError } from "../adapters/audit/WordLiftAudit.js";
import type { ClassifierProvider } from "../adapters/classify/ClassifierProvider.js";
import { FixtureProvider, type FixtureAudit } from "../adapters/fixtures/FixtureProvider.js";
import type { ScrapeProvider, SiteSnapshot } from "../adapters/scrape/ScrapeProvider.js";
import type { ReportStore } from "../adapters/store/ReportStore.js";
import { ReportRequestError } from "../errors.js";
import { sanitizeEvidence } from "../security/sanitizeEvidence.js";
import { normalizeTargetUrl, UrlPolicyError } from "../security/urlPolicy.js";

export interface OrchestratorOptions {
  publicAppUrl: string;
  ttlDays: number;
  now?: () => Date;
  mode?: "demo" | "live";
  providers?: {
    audit?: AuditProvider;
    scrape?: ScrapeProvider;
    classify?: ClassifierProvider;
  };
}

interface CompiledInputs {
  canonicalUrl: string;
  categories: ContentCategory[];
  signals: string[];
  entities: SiteEntity[];
  evidence: CapabilityEvidence[];
  foundation?: ReportRecord["foundationAudit"];
  classifierModel: string;
  errors: ReportError[];
  evidenceTruncated: boolean;
}

export class AuditOrchestrator {
  constructor(
    private readonly store: ReportStore,
    private readonly model: ActionModel,
    private readonly fixtures: FixtureProvider,
    private readonly options: OrchestratorOptions,
  ) {}

  get mode(): "demo" | "live" {
    return this.options.mode ?? "demo";
  }

  async create(input: unknown): Promise<ReportRecord> {
    const request = createReportRequestSchema.parse(input);
    const existing = await this.store.get(request.requestId);
    if (existing) return existing;

    const target = normalizeTargetUrl(request.url);
    if (request.fixtureId && this.mode === "live") {
      throw new ReportRequestError("Fixture selection is only available in demo mode.", 400);
    }

    const running = this.baseRecord(request.requestId, target.toString(), this.now());
    await this.store.put(running);
    try {
      const finalReport = await this.run(running, target, request.fixtureId ?? null, request.archetypeOverride ?? undefined);
      return await this.store.finalize(finalReport);
    } catch (error) {
      // A record left `running` traps every retry of this requestId in polling until it expires,
      // so the failure itself becomes the terminal state before the error reaches the caller.
      await this.finalizeFailed(running, error).catch(() => undefined);
      throw error;
    }
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
      classification: {
        ...parent.classification,
        primaryArchetype: archetype,
        override: archetype,
        provisional: false,
        provisionalReason: undefined,
      },
      foundationAudit: parent.foundationAudit,
      capabilities,
      entities: parent.entities,
      score: scoreReadiness(capabilities),
      priorities: rankPriorities(capabilities),
      errors: parent.errors,
      evidenceTruncated: parent.evidenceTruncated,
    };
    return this.store.createRevision(parent.id, child);
  }

  async reverify(parentId: string): Promise<ReportRecord> {
    const parent = await this.required(parentId);
    const childBase = this.baseRecord(randomUUID(), parent.requestedUrl, this.now(), parent.id);
    const child = await this.run(
      childBase,
      normalizeTargetUrl(parent.requestedUrl),
      null,
      parent.classification?.override,
    );
    return this.store.createRevision(parent.id, child);
  }

  async contract(reportId: string, actionId: string) {
    const report = await this.required(reportId);
    return report.capabilities?.find((capability) => capability.actionId === actionId)?.contract ?? null;
  }

  reportUrl(id: string): string {
    return new URL(`/reports/${id}`, this.options.publicAppUrl).toString();
  }

  /** Adds evidence from a verified sidecar invocation as an immutable child revision. */
  async attachInvocationEvidence(parentId: string, evidence: CapabilityEvidence[]): Promise<ReportRecord> {
    const parent = await this.required(parentId);
    if (!parent.capabilities || !parent.classification) {
      throw new ReportRequestError("That report has no capability map to update.", 409);
    }
    const merged = sanitizeEvidence([
      ...parent.capabilities.flatMap((capability) => capability.evidence),
      ...evidence,
    ]);
    const archetype = parent.classification.primaryArchetype;
    const graph = compileActionGraph(this.model, archetype, [`archetype:${archetype}`]);
    const capabilities = this.capabilities(
      graph.actions,
      merged.evidence,
      parent.canonicalUrl ?? parent.requestedUrl,
    );
    const child: ReportRecord = {
      ...this.baseRecord(randomUUID(), parent.requestedUrl, this.now(), parent.id),
      status: parent.status === "partial" ? "partial" : "completed",
      phase: "complete",
      canonicalUrl: parent.canonicalUrl,
      completedAt: this.now().toISOString(),
      classification: parent.classification,
      foundationAudit: parent.foundationAudit,
      capabilities,
      entities: parent.entities,
      score: scoreReadiness(capabilities),
      priorities: rankPriorities(capabilities),
      errors: parent.errors,
      evidenceTruncated: parent.evidenceTruncated || merged.truncated,
    };
    return this.store.createRevision(parent.id, child);
  }

  /** Stores a terminal failed revision of a running report, with a caller-safe message. */
  private async finalizeFailed(base: ReportRecord, cause: unknown): Promise<void> {
    const message = cause instanceof ReportRequestError || cause instanceof UrlPolicyError
      ? cause.message
      : "The audit could not be completed.";
    await this.store.finalize({
      ...base,
      status: "failed",
      phase: "complete",
      completedAt: this.now().toISOString(),
      errors: [failure("report_failed", "understanding", message)],
    });
  }

  private async run(
    base: ReportRecord,
    target: URL,
    fixtureId: string | null,
    override?: Archetype,
  ): Promise<ReportRecord> {
    if (this.mode === "demo") {
      return this.compileFixture(base, this.fixtures.resolve(fixtureId, target.toString()), override);
    }
    return this.compileLive(base, target, override);
  }

  /** Three phases: understand the site, map its expected actions, check what an agent can do. */
  private async compileLive(base: ReportRecord, target: URL, override?: Archetype): Promise<ReportRecord> {
    const inputs = await this.collectLiveInputs(target);

    if (inputs.evidence.length === 0 && !inputs.foundation) {
      return {
        ...base,
        status: "failed",
        phase: "complete",
        canonicalUrl: inputs.canonicalUrl,
        completedAt: this.now().toISOString(),
        errors: inputs.errors.length > 0 ? inputs.errors : [failure("no_evidence", "understanding", "No usable evidence could be collected from this site.")],
      };
    }

    return this.compile(base, inputs, override);
  }

  private async collectLiveInputs(target: URL): Promise<CompiledInputs> {
    const providers = this.options.providers ?? {};
    const collectedAt = this.now().toISOString();
    const errors: ReportError[] = [];

    const [snapshotResult, auditResult] = await Promise.allSettled([
      providers.scrape ? providers.scrape.collect(target) : Promise.resolve(null),
      providers.audit ? providers.audit.audit(target) : Promise.resolve(null),
    ]);

    let snapshot: SiteSnapshot | null = null;
    if (snapshotResult.status === "fulfilled") {
      snapshot = snapshotResult.value;
    } else {
      const reason = snapshotResult.reason;
      errors.push(
        reason instanceof UrlPolicyError
          ? failure(reason.code, "understanding", reason.message)
          : failure("collector_failed", "understanding", "The page could not be collected."),
      );
    }

    let audit: AuditEvidenceBundle | null = null;
    if (auditResult.status === "fulfilled") {
      audit = auditResult.value;
    } else {
      errors.push(auditErrorToReportError(auditResult.reason));
    }

    const detection = snapshot ? detectSiteEvidence(snapshot, collectedAt) : { evidence: [], signals: [] };
    const classification = snapshot && providers.classify
      ? await providers.classify.classify({ text: snapshot.text, url: snapshot.canonicalUrl })
      : { categories: [], model: "behavior-only", failureReason: snapshot ? undefined : "No page text was collected." };

    if (classification.failureReason) {
      errors.push(failure("classifier_unavailable", "understanding", classification.failureReason, false));
    }

    // What the collector actually read outranks what the foundation audit reported as present.
    const disproved = disprovedDiscovery(snapshot);
    const auditEvidence = (audit?.evidence ?? []).filter((item) => !disproved.evidenceIds.has(item.id));
    const auditSignals = (audit?.signals ?? []).filter((signal) => !disproved.signals.has(signal));
    const sanitized = sanitizeEvidence([...detection.evidence, ...auditEvidence]);

    return {
      canonicalUrl: snapshot?.canonicalUrl ?? audit?.url ?? target.toString(),
      categories: classification.categories,
      signals: [...new Set([...detection.signals, ...auditSignals])].sort(),
      entities: (snapshot?.entities ?? []).map((entity) => ({ ...entity, collectedAt })),
      evidence: sanitized.evidence,
      foundation: audit?.foundation,
      classifierModel: classification.model,
      errors,
      evidenceTruncated: sanitized.truncated || Boolean(snapshot?.truncated),
    };
  }

  private compileFixture(base: ReportRecord, fixture: FixtureAudit, override?: Archetype): ReportRecord {
    if (fixture.status === "failed") {
      return {
        ...base,
        status: "failed",
        phase: "complete",
        canonicalUrl: fixture.url,
        completedAt: this.now().toISOString(),
        errors: fixture.errors,
      };
    }

    const sanitized = sanitizeEvidence(fixture.evidence);
    const report = this.compile(
      base,
      {
        canonicalUrl: fixture.url,
        categories: fixture.categories,
        signals: fixture.signals,
        entities: fixture.entities ?? [],
        evidence: sanitized.evidence,
        foundation: fixture.foundation,
        classifierModel: "google-v2-fixture",
        errors: fixture.errors,
        evidenceTruncated: sanitized.truncated,
      },
      override,
    );
    return { ...report, status: fixture.status };
  }

  private compile(base: ReportRecord, inputs: CompiledInputs, override?: Archetype): ReportRecord {
    const inference = inferArchetype(this.model, inputs.categories, inputs.signals, override);
    const provenance = inputs.categories.map((category) => `category:${category.name}`);
    const graph = compileActionGraph(this.model, inference.primaryArchetype, provenance);
    const capabilities = this.capabilities(graph.actions, inputs.evidence, inputs.canonicalUrl);
    const topScore = inference.rankedArchetypes[0]?.score ?? 0;
    const retryable = inputs.errors.some((error) => error.retryable);

    return {
      ...base,
      status: inputs.errors.length > 0 && retryable ? "partial" : "completed",
      phase: "complete",
      canonicalUrl: inputs.canonicalUrl,
      completedAt: this.now().toISOString(),
      classification: {
        primaryArchetype: inference.primaryArchetype,
        categories: inputs.categories,
        rankedArchetypes: inference.rankedArchetypes,
        confidence: inference.provisional ? "low" : topScore >= 4 ? "high" : "medium",
        margin: inference.margin,
        provisional: inference.provisional,
        provisionalReason: inference.provisionalReason,
        override: inference.override,
        // Stored so "why is this action expected here?" stays answerable from the report alone.
        signals: inputs.signals.slice(0, 60).map((signal) => signal.slice(0, 80)),
        model: inputs.classifierModel,
        collectedAt: this.now().toISOString(),
      },
      foundationAudit: inputs.foundation,
      capabilities,
      ...(inputs.entities.length > 0 ? { entities: inputs.entities } : {}),
      score: scoreReadiness(capabilities),
      priorities: rankPriorities(capabilities),
      errors: inputs.errors,
      evidenceTruncated: inputs.evidenceTruncated,
    };
  }

  private capabilities(
    actions: ReturnType<typeof compileActionGraph>["actions"],
    evidence: CapabilityEvidence[],
    siteUrl: string,
  ) {
    return actions.map((action) => {
      const actionEvidence = evidence.filter((item) => item.actionId === action.id);
      // Only an approved sidecar's own verified invocation may claim `sidecar-enabled`.
      const approvedSidecar = actionEvidence.some(
        (item) => item.verification === "invoked" && item.kind === "tool-result" && item.id.startsWith("sidecar:"),
      );
      const capability = deriveCapability(action, actionEvidence, { approvedSidecar });
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
      mode: this.mode,
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

function failure(code: string, phase: ReportError["phase"], message: string, retryable = true): ReportError {
  return { code, phase, message, retryable };
}

const DISPROVABLE_DISCOVERY: Record<string, { evidenceId: string; signals: string[] }> = {
  llms: { evidenceId: "discovery-llms-txt", signals: ["agent:llms-txt"] },
  skill: { evidenceId: "discovery-skill-md", signals: ["agent:skill-md"] },
  mcp: { evidenceId: "discovery-mcp", signals: ["agent:mcp-json", "agent:mcp-server-card"] },
  ucp: { evidenceId: "discovery-ucp", signals: ["agent:ucp"] },
};

/** Claims the collector proved false by reading the document itself. */
function disprovedDiscovery(snapshot: SiteSnapshot | null): { evidenceIds: Set<string>; signals: Set<string> } {
  const evidenceIds = new Set<string>();
  const signals = new Set<string>();

  for (const document of snapshot?.discovery ?? []) {
    if (document.status === "valid") continue;
    const entry = DISPROVABLE_DISCOVERY[document.kind];
    if (!entry) continue;
    evidenceIds.add(entry.evidenceId);
    for (const signal of entry.signals) signals.add(signal);
  }

  return { evidenceIds, signals };
}

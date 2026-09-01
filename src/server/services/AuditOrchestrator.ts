import { randomUUID } from "node:crypto";
import {
  compileActionGraph,
  specializeActionLabels,
  withObservedActions,
} from "../../domain/action-model/compileGraph.js";
import { compileActionContract } from "../../domain/action-model/compileContract.js";
import { deriveCapability } from "../../domain/action-model/deriveState.js";
import type { ActionModel } from "../../domain/action-model/loadModel.js";
import { recommendationFor, rankPriorities } from "../../domain/action-model/rankPriorities.js";
import { scoreReadiness } from "../../domain/action-model/scoreReadiness.js";
import { appliesToForAction, compileContextGraph, refreshContextGraph } from "../../domain/context/compileContextGraph.js";
import { detectSiteEvidence } from "../../domain/evidence/detectSiteEvidence.js";
import { detectWordLift, type WordLiftMarker } from "../../domain/evidence/detectWordLift.js";
import { inferArchetype } from "../../domain/classification/inferArchetype.js";
import { createReportRequestSchema, recompileReportRequestSchema } from "../../shared/schemas/report.js";
import type {
  Archetype,
  CapabilityEvidence,
  ContentCategory,
  ReportError,
  ReportRecord,
} from "../../shared/types/index.js";
import type { AuditEvidenceBundle, AuditProvider } from "../adapters/audit/AuditProvider.js";
import { auditErrorToReportError } from "../adapters/audit/WordLiftAudit.js";
import type { ClassifierProvider } from "../adapters/classify/ClassifierProvider.js";
import { FixtureProvider, type FixtureAudit } from "../adapters/fixtures/FixtureProvider.js";
import type { ScrapeProvider, SitePageSnapshot, SiteSnapshot } from "../adapters/scrape/ScrapeProvider.js";
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

export const PINNED_ALPINA_REPORT_ID = "11111111-1111-4111-8111-111111111111";

/** Receives partial records while an audit runs; each patch replaces the stored running record. */
type ProgressListener = (patch: Partial<ReportRecord>) => Promise<void>;

interface CompiledInputs {
  canonicalUrl: string;
  categories: ContentCategory[];
  signals: string[];
  evidence: CapabilityEvidence[];
  foundation?: ReportRecord["foundationAudit"];
  classifierModel: string;
  errors: ReportError[];
  evidenceTruncated: boolean;
  pages: SitePageSnapshot[];
  wordlift?: WordLiftMarker;
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

    // Progress is visible before the audit finishes: each patch replaces the running record, so
    // a reader polling the report watches it fill in. A failed update never fails the audit.
    let latest = running;
    const onProgress = async (patch: Partial<ReportRecord>) => {
      latest = { ...latest, ...patch };
      await this.store.update(latest).catch(() => undefined);
    };

    try {
      const finalReport = await this.run(
        running,
        target,
        request.fixtureId ?? null,
        request.archetypeOverride ?? undefined,
        onProgress,
      );
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

  /** Stable, dated fixture for judges; live audits remain available from the same URL-first flow. */
  async pinnedAlpina(): Promise<ReportRecord> {
    const existing = await this.store.get(PINNED_ALPINA_REPORT_ID);
    if (existing?.contextGraph && existing.contextGraph.pages.length >= 4) return existing;
    const base = this.baseRecord(PINNED_ALPINA_REPORT_ID, "https://alpina.travel/", this.now());
    const report = this.compileFixture(base, this.fixtures.get("travel-hospitality"));
    const pinned: ReportRecord = {
      ...report,
      mode: "demo",
      expiresAt: "2099-12-31T23:59:59.000Z",
    };
    await this.store.put(pinned);
    return pinned;
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
    const categoryNames = parent.classification.categories.map((category) => category.name);
    const initialCapabilities = this.capabilities(
      graph.actions,
      evidence,
      parent.canonicalUrl ?? parent.requestedUrl,
      parent.contextGraph,
      categoryNames,
    );
    const contextGraph = parent.contextGraph ? refreshContextGraph(parent.contextGraph, initialCapabilities) : undefined;
    const capabilities = this.capabilities(
      graph.actions,
      evidence,
      parent.canonicalUrl ?? parent.requestedUrl,
      contextGraph,
      categoryNames,
    );
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
      publishedWith: parent.publishedWith,
      contextGraph,
      capabilities,
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
    const categoryNames = parent.classification.categories.map((category) => category.name);
    const initialCapabilities = this.capabilities(
      graph.actions,
      merged.evidence,
      parent.canonicalUrl ?? parent.requestedUrl,
      parent.contextGraph,
      categoryNames,
    );
    const contextGraph = parent.contextGraph ? refreshContextGraph(parent.contextGraph, initialCapabilities) : undefined;
    const capabilities = this.capabilities(
      graph.actions,
      merged.evidence,
      parent.canonicalUrl ?? parent.requestedUrl,
      contextGraph,
      categoryNames,
    );
    const child: ReportRecord = {
      ...this.baseRecord(randomUUID(), parent.requestedUrl, this.now(), parent.id),
      status: parent.status === "partial" ? "partial" : "completed",
      phase: "complete",
      canonicalUrl: parent.canonicalUrl,
      completedAt: this.now().toISOString(),
      classification: parent.classification,
      foundationAudit: parent.foundationAudit,
      publishedWith: parent.publishedWith,
      contextGraph,
      capabilities,
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
    onProgress?: ProgressListener,
  ): Promise<ReportRecord> {
    if (this.mode === "demo") {
      return this.compileFixture(base, this.fixtures.resolve(fixtureId, target.toString()), override);
    }
    return this.compileLive(base, target, override, onProgress);
  }

  /** Three phases: understand the site, map its expected actions, check what an agent can do. */
  private async compileLive(
    base: ReportRecord,
    target: URL,
    override?: Archetype,
    onProgress?: ProgressListener,
  ): Promise<ReportRecord> {
    const inputs = await this.collectLiveInputs(target, onProgress);

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

  private async collectLiveInputs(target: URL, onProgress?: ProgressListener): Promise<CompiledInputs> {
    const providers = this.options.providers ?? {};
    const collectedAt = this.now().toISOString();
    const errors: ReportError[] = [];

    const scrapePromise = providers.scrape ? providers.scrape.collect(target) : Promise.resolve(null);
    const auditPromise = providers.audit ? providers.audit.audit(target) : Promise.resolve(null);

    // Each provider's arrival is published as soon as it lands — the page shows the entities
    // while the foundation audit is still thinking, and vice versa. The progress jobs sit inside
    // the same allSettled, so every partial is persisted before the final report overwrites it.
    const progressJobs: Array<Promise<unknown>> = [];
    if (onProgress) {
      progressJobs.push(
        scrapePromise
          .then((snapshot) =>
            snapshot
              ? onProgress({
                  phase: "mapping",
                  canonicalUrl: snapshot.canonicalUrl,
                  contextGraph: compileContextGraph(snapshot.pages, [], [], snapshot.canonicalUrl),
                })
              : undefined,
          )
          .catch(() => undefined),
        auditPromise
          .then((audit) => (audit?.foundation ? onProgress({ foundationAudit: audit.foundation }) : undefined))
          .catch(() => undefined),
      );
    }

    const [snapshotResult, auditResult] = await Promise.allSettled([scrapePromise, auditPromise, ...progressJobs]);

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

    // A map built from one or two pages is a sketch, not a survey: the report says so and stays
    // retryable instead of presenting a thin sample as the completed picture.
    if (snapshot && snapshot.pages.length < 3) {
      errors.push(
        failure(
          "thin_sample",
          "understanding",
          snapshot.pages.length === 1
            ? "Only the entry page could be read, so the map is built from a single page."
            : "Only 2 representative pages could be read, so the map may be incomplete.",
        ),
      );
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
      evidence: sanitized.evidence,
      foundation: audit?.foundation,
      classifierModel: classification.model,
      errors,
      evidenceTruncated: sanitized.truncated || Boolean(snapshot?.truncated),
      pages: snapshot?.pages ?? [],
      wordlift: snapshot?.wordlift,
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
        evidence: sanitized.evidence,
        foundation: fixture.foundation,
        classifierModel: "google-v2-fixture",
        errors: fixture.errors,
        evidenceTruncated: sanitized.truncated,
        pages: fixture.pages ?? [],
      },
      override,
    );
    return { ...report, status: fixture.status };
  }

  private compile(base: ReportRecord, inputs: CompiledInputs, override?: Archetype): ReportRecord {
    const inference = inferArchetype(this.model, inputs.categories, inputs.signals, override);
    // Capped so expectationSource stays inside the report schema's 20-entry bound.
    const provenance = inputs.categories.slice(0, 8).map((category) => `category:${category.name}`);
    const graph = compileActionGraph(this.model, inference.primaryArchetype, provenance);
    const categoryNames = inputs.categories.map((category) => category.name);
    const rawCapabilities = this.capabilities(graph.actions, inputs.evidence, inputs.canonicalUrl, undefined, categoryNames);
    const contextGraph = compileContextGraph(
      inputs.pages,
      inputs.categories,
      rawCapabilities,
      inputs.canonicalUrl,
      inference.primaryArchetype,
    );
    const capabilities = this.capabilities(graph.actions, inputs.evidence, inputs.canonicalUrl, contextGraph, categoryNames);
    const publishedWith = detectWordLift(contextGraph.entities, inputs.wordlift, inputs.canonicalUrl);
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
        model: inputs.classifierModel,
        collectedAt: this.now().toISOString(),
      },
      foundationAudit: inputs.foundation,
      publishedWith,
      contextGraph,
      capabilities,
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
    contextGraph?: ReportRecord["contextGraph"],
    categoryNames: string[] = [],
  ) {
    // Observed evidence survives any archetype: actions the template does not expect, but the
    // audit saw on the site, stay in the map as unexpected instead of silently disappearing.
    // Labels specialize from what the audit read on the site itself: its categories and the
    // names of its entities — a "WordPress hosting" product makes availability mean domains.
    const contextTerms = [...categoryNames, ...(contextGraph?.entities.map((entity) => entity.name) ?? [])];
    const graphActions = specializeActionLabels(
      withObservedActions(this.model, actions, evidence.map((item) => item.actionId)),
      contextTerms,
      this.model.labelOverrides,
    );
    return graphActions.map((action) => {
      const actionEvidence = evidence.filter((item) => item.actionId === action.id);
      // Only an approved sidecar's own verified invocation may claim `sidecar-enabled`.
      const approvedSidecar = actionEvidence.some(
        (item) => item.verification === "invoked" && item.kind === "tool-result" && item.id.startsWith("sidecar:"),
      );
      const capability = deriveCapability(action, actionEvidence, { approvedSidecar, expected: action.expected });
      capability.appliesTo = contextGraph ? appliesToForAction(contextGraph, action.id) : [];
      if (["missing", "human-only", "unverified"].includes(capability.state)) {
        capability.recommendation = recommendationFor(capability);
        const subject = capability.appliesTo[0];
        const offers = subject
          ? contextGraph?.entities.find((entity) => entity.id === subject.id)?.offers
          : undefined;
        capability.contract = compileActionContract(action, siteUrl, capability.evidence, subject, offers);
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

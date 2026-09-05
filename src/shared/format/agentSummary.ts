import type { CapabilityResult, ReportRecord } from "../types/index.js";
import { explainReportError } from "./explainError.js";

export interface StageCount {
  ready: number;
  expected: number;
}

export interface AuditToolResult {
  reportId: string;
  canonicalUrl: string;
  archetype: string;
  classificationConfidence: string;
  agentReadinessScore: number;
  foundationAuditScore: number | null;
  foundationSummary: string | null;
  foundationFindings: string[];
  foundationQuickWins: Array<{ title: string; impact?: string }>;
  foundationDimensions: Array<{ id: string; label: string; score?: number; status?: string }>;
  pagesAnalyzed: number;
  entities: Array<{ id: string; name: string; types: string[] }>;
  /** The publishing platform the site's own structured data names, or null. */
  publishedWith: string | null;
  /** Which AI crawlers the robots policy admits — the front door of agent access. */
  botAccess: Array<{ name: string; status: string }>;
  priorityGaps: Array<{ actionId: string; label: string; state: string; reason: string }>;
  stages: {
    discover: StageCount;
    understandDecide: StageCount;
    act: StageCount;
    manage: StageCount;
  };
  reportUrl: string;
  partial: boolean;
  notes: string[];
  /**
   * Present only on a remote audit: the secret that lets this caller refine this report later.
   * It is never stored in the report, never logged, and never returned by a read.
   */
  claimToken?: string;
}

export interface CapabilityToolResult {
  reportId: string;
  actionId: string;
  label: string;
  description: string;
  stage: string;
  intent: string;
  expected: boolean;
  expectationSource: string[];
  state: string;
  humanSupport: boolean;
  agentSupport: boolean;
  appliesTo: Array<{ id: string; name: string; types: string[] }>;
  interfaces: Array<{ name: string; protocol: string; status: string; sourceUrl: string }>;
  evidence: Array<{ audience: string; kind: string; verification: string; claim: string; sourceUrl: string; confidence: number }>;
  recommendation: string | null;
  governance: {
    requiresAuthentication: boolean;
    requiresAuthorization: boolean;
    requiresConfirmation: boolean;
    sideEffects: string;
  } | null;
  recommendedDelivery: string | null;
  contractUrl: string | null;
  /** Responsibility a human reviewer assigned; null on the machine draft. */
  boundary: string | null;
  boundaryRationale: string | null;
}

/** What an agent gets back while an audit is still running: an address, not an answer. */
export interface AuditRunningResult {
  reportId: string;
  status: "running";
  phase: string;
  reportUrl: string;
  /** The tool that turns this reportId into progress or the finished result. */
  statusTool: "get-audit-report";
  pagesAnalyzed?: number;
  foundationAuditReady?: boolean;
  note: string;
  /** Present only on a remote audit: see AuditToolResult.claimToken. */
  claimToken?: string;
}

export function summarizeRunningReport(
  report: Pick<ReportRecord, "id" | "phase"> & Partial<Pick<ReportRecord, "contextGraph" | "foundationAudit">>,
  reportUrl: string,
): AuditRunningResult {
  return {
    reportId: report.id,
    status: "running",
    phase: report.phase,
    reportUrl,
    statusTool: "get-audit-report",
    ...(report.contextGraph ? { pagesAnalyzed: report.contextGraph.pages.length } : {}),
    ...(report.foundationAudit ? { foundationAuditReady: true } : {}),
    note: "The audit is still running. Call get-audit-report with this reportId to check progress and fetch the finished result.",
  };
}

export function auditRunningText(result: AuditRunningResult): string {
  const progress = [
    result.pagesAnalyzed ? `${result.pagesAnalyzed} representative page${result.pagesAnalyzed === 1 ? "" : "s"} mapped` : null,
    result.foundationAuditReady ? "the foundation audit has landed" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return [
    `The audit is still running (phase: ${result.phase}). Report id: ${result.reportId}.`,
    progress ? `Progress so far: ${progress}.` : null,
    `Call get-audit-report with {"reportId": "${result.reportId}"} to check progress and fetch the finished result.`,
    `Watch it fill in live: ${result.reportUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Everything ChatGPT needs to interview the business owner about one machine-generated map. */
export interface InspectServiceMapResult {
  reportId: string;
  reportUrl: string;
  refined: boolean;
  operatingRole: {
    inferred: string;
    confidence: number;
    source: "human-provided" | "machine-inferred";
  };
  entities: Array<{
    id: string;
    name: string;
    type: string;
    machinePriority: "primary" | "secondary" | "context";
  }>;
  terminology: Array<{ term: string; inferredMeaning: string; confidence: number; source: string }>;
  actions: Array<{
    actionId: string;
    label: string;
    stage: string;
    expected: boolean;
    state: string;
    agentReady: boolean;
    boundary: string | null;
    boundarySource: string | null;
    evidence: string[];
  }>;
  nextStep: string;
}

const CONFIDENCE_VALUE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };
const PRIMARY_HINT_TYPES = new Set([
  "Product", "ProductGroup", "Offer", "AggregateOffer", "Service", "SoftwareApplication", "WebApplication",
  "FinancialService", "InsuranceAgency", "LodgingBusiness", "Hotel", "Resort", "Apartment", "Accommodation",
  "TouristAttraction", "Event", "Vehicle", "Article", "NewsArticle",
]);

export function inspectServiceMap(report: ReportRecord, reportUrl: string): InspectServiceMapResult {
  const classification = report.classification;
  const humanRole = classification?.businessRole;
  return {
    reportId: report.id,
    reportUrl,
    refined: Boolean(report.refinement),
    operatingRole: {
      inferred: humanRole ?? classification?.primaryArchetype ?? "other",
      confidence: humanRole ? 1 : (CONFIDENCE_VALUE[classification?.confidence ?? "low"] ?? 0.3),
      source: humanRole ? "human-provided" : "machine-inferred",
    },
    entities: (report.contextGraph?.entities ?? []).slice(0, 20).map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.types[0] ?? "Thing",
      machinePriority: entity.types.includes("WebSite") || entity.types.includes("Person")
        ? "context"
        : entity.offers.length > 0 || entity.types.some((type) => PRIMARY_HINT_TYPES.has(type))
          ? "primary"
          : "secondary",
    })),
    // Human vocabulary lives in the lexical graph itself (with meaning and provenance); the
    // machine's own terms follow it, so a reviewer sees exactly what stands and what they said.
    terminology: (report.contextGraph?.lexicalEntries ?? [])
      .filter((entry) => entry.kind !== "entity-name")
      .slice(0, 20)
      .map((entry) => ({
        term: entry.label,
        inferredMeaning:
          entry.meaning ??
          (entry.kind === "category" ? "a content category the classifier read" : "a topic the site's own headings use"),
        confidence: entry.confidence,
        source: entry.provenance ?? "machine-inferred",
      })),
    actions: (report.capabilities ?? []).map((capability) => ({
      actionId: capability.actionId,
      label: capability.label,
      stage: capability.stage,
      expected: capability.expected,
      state: capability.state,
      agentReady: READY_STATES.has(capability.state),
      boundary: capability.boundary ?? null,
      boundarySource: capability.boundarySource ?? null,
      evidence: capability.evidence.slice(0, 3).map((item) => item.claim),
    })),
    nextStep:
      "Interview the human about the operating role, the primary entities, the terminology, and the boundary of every expected action (owned, partner-handoff, informational-only, not-applicable); use explain-capability where evidence is unclear, then call refine-terms-of-action with the decisions — including terminologyDecisions to confirm, replace, or reject the machine's own vocabulary. Human decisions never change agent readiness.",
  };
}

export function inspectSummaryText(result: InspectServiceMapResult): string {
  const lines = [
    `${result.refined ? "Human-refined" : "Machine-generated"} Terms of Action for report ${result.reportId}.`,
    `Operating role: ${result.operatingRole.inferred} (${result.operatingRole.source}, confidence ${result.operatingRole.confidence}).`,
    "Entities:",
    ...result.entities.map((entity) => `- [${entity.machinePriority}] ${entity.name} (${entity.type}) id=${entity.id}`),
  ];
  if (result.terminology.length > 0) {
    lines.push("Terminology:");
    for (const entry of result.terminology.slice(0, 10)) {
      lines.push(`- "${entry.term}": ${entry.inferredMeaning} (${entry.source})`);
    }
  }
  lines.push("Actions:");
  for (const action of result.actions) {
    lines.push(
      `- ${action.actionId} "${action.label}" [${action.stage}] expected=${action.expected} state=${action.state}` +
        `${action.agentReady ? " agent-ready" : ""}${action.boundary ? ` boundary=${action.boundary} (${action.boundarySource})` : " boundary=undecided"}`,
    );
  }
  lines.push(`Next: ${result.nextStep}`);
  lines.push(`Report: ${result.reportUrl}`);
  return lines.join("\n");
}

const READY_STATES = new Set(["agent-ready", "sidecar-enabled"]);
const MAX_AGENT_EVIDENCE = 6;

function countStage(capabilities: CapabilityResult[], stage: CapabilityResult["stage"]): StageCount {
  const expected = capabilities.filter((capability) => capability.stage === stage && capability.expected);
  return {
    ready: expected.filter((capability) => READY_STATES.has(capability.state)).length,
    expected: expected.length,
  };
}

/**
 * Compacts a stored report into the payload an agent receives. Evidence is bounded and
 * site-authored text never reaches tool names, descriptions, or schemas.
 */
export function summarizeReportForAgent(report: ReportRecord, reportUrl: string): AuditToolResult {
  const capabilities = report.capabilities ?? [];
  const notes = report.errors.map(explainReportError);
  if (report.classification?.provisional) {
    notes.push(
      report.classification.provisionalReason ??
        "Classification is provisional; ask the user to confirm the archetype before acting on the gaps.",
    );
  }

  return {
    reportId: report.id,
    canonicalUrl: report.canonicalUrl ?? report.requestedUrl,
    archetype: report.classification?.primaryArchetype ?? "other",
    classificationConfidence: report.classification?.confidence ?? "low",
    agentReadinessScore: report.score?.value ?? 0,
    foundationAuditScore: report.foundationAudit?.score ?? null,
    foundationSummary: report.foundationAudit?.summary ?? null,
    foundationFindings: (report.foundationAudit?.findings ?? []).slice(0, 5),
    foundationQuickWins: (report.foundationAudit?.quickWins ?? []).slice(0, 5),
    foundationDimensions: (report.foundationAudit?.sections ?? []).slice(0, 24).map((section) => ({
      id: section.id,
      label: section.label,
      score: section.score,
      status: section.status,
    })),
    pagesAnalyzed: report.contextGraph?.pages.length ?? 1,
    entities: (report.contextGraph?.entities ?? []).slice(0, 8).map((entity) => ({
      id: entity.id,
      name: entity.name,
      types: entity.types,
    })),
    publishedWith: report.publishedWith?.name ?? null,
    botAccess: (report.foundationAudit?.botAccess ?? []).slice(0, 8).map((bot) => ({ name: bot.name, status: bot.status })),
    priorityGaps: (report.priorities ?? []).map((gap) => ({
      actionId: gap.actionId,
      label: gap.label,
      state: gap.state,
      reason: gap.reason,
    })),
    stages: {
      discover: countStage(capabilities, "discover"),
      understandDecide: countStage(capabilities, "understand-decide"),
      act: countStage(capabilities, "act"),
      manage: countStage(capabilities, "manage"),
    },
    reportUrl,
    partial: report.status === "partial",
    notes,
  };
}

export function auditSummaryText(result: AuditToolResult): string {
  const lines = [
    `${result.canonicalUrl} looks like a ${result.archetype.replace("-", "/")} site (${result.classificationConfidence} confidence).`,
    `Verified agent readiness: ${result.agentReadinessScore}/100${
      result.foundationAuditScore === null ? "" : ` · AI Audit foundation score: ${result.foundationAuditScore}/100`
    }.`,
    `Context map: ${result.pagesAnalyzed} representative page${result.pagesAnalyzed === 1 ? "" : "s"} analyzed, ${result.entities.length} named domain entit${result.entities.length === 1 ? "y" : "ies"} extracted.${
      result.publishedWith ? ` Structured data is published with ${result.publishedWith}.` : ""
    }`,
    `Stages ready/expected — discover ${stage(result.stages.discover)}, understand & decide ${stage(
      result.stages.understandDecide,
    )}, act ${stage(result.stages.act)}, manage ${stage(result.stages.manage)}.`,
  ];

  if (result.priorityGaps.length > 0) {
    lines.push("Top capability gaps:");
    for (const gap of result.priorityGaps) {
      lines.push(`- ${gap.label} (${gap.state}): ${gap.reason}`);
    }
  } else {
    lines.push("No expected action is currently missing agent support.");
  }

  if (result.foundationSummary) lines.push(`Foundation audit: ${result.foundationSummary}`);
  if (result.botAccess.length > 0) {
    lines.push(
      `AI crawler access: ${result.botAccess.slice(0, 4).map((bot) => `${bot.name} ${bot.status.toLowerCase()}`).join(" · ")}.`,
    );
  }
  if (result.foundationFindings.length > 0) {
    lines.push("Top foundation findings:");
    for (const finding of result.foundationFindings.slice(0, 3)) lines.push(`- ${finding}`);
  }

  if (result.partial) {
    lines.push("This is a partial report: some evidence could not be collected.");
  }
  for (const note of result.notes) {
    lines.push(`Note — ${note}`);
  }
  lines.push(`Full evidence and contracts: ${result.reportUrl}`);
  return lines.join("\n");
}

function stage(count: StageCount): string {
  return `${count.ready}/${count.expected}`;
}

export function describeCapabilityForAgent(
  report: ReportRecord,
  capability: CapabilityResult,
  contractUrl: string | null,
): CapabilityToolResult {
  return {
    reportId: report.id,
    actionId: capability.actionId,
    label: capability.label,
    description: capability.description,
    stage: capability.stage,
    intent: capability.intent,
    expected: capability.expected,
    expectationSource: capability.expectationSource,
    state: capability.state,
    humanSupport: capability.humanSupport,
    agentSupport: capability.agentSupport,
    appliesTo: capability.appliesTo,
    interfaces: (report.contextGraph?.interfaces ?? [])
      .filter((item) => item.actionId === capability.actionId)
      .slice(0, 10)
      .map((item) => ({ name: item.name, protocol: item.protocol, status: item.status, sourceUrl: item.sourceUrl })),
    evidence: capability.evidence.slice(0, MAX_AGENT_EVIDENCE).map((item) => ({
      audience: item.audience,
      kind: item.kind,
      verification: item.verification,
      claim: item.claim,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence,
    })),
    recommendation: capability.recommendation ?? null,
    governance: capability.contract?.governance ?? null,
    recommendedDelivery: capability.contract?.recommendedDelivery ?? null,
    contractUrl: capability.contract ? contractUrl : null,
    boundary: capability.boundary ?? null,
    boundaryRationale: capability.boundaryRationale ?? null,
  };
}

export function capabilitySummaryText(result: CapabilityToolResult): string {
  const lines = [
    `${result.label} — ${result.state.replace("-", " ")} (${result.intent}, ${result.stage} stage).`,
    `Human support: ${result.humanSupport ? "yes" : "no"}. Agent support: ${result.agentSupport ? "yes" : "no"}.`,
  ];
  if (!result.expected) {
    lines.push(
      "Observed on the site although the current site type does not expect this action; it stays outside the readiness score.",
    );
  }
  if (result.appliesTo.length > 0) {
    lines.push(`Applies to: ${result.appliesTo.map((entity) => `${entity.name} (${entity.types.join(", ")})`).join("; ")}.`);
  }
  if (result.interfaces.length > 0) {
    lines.push(`Interfaces: ${result.interfaces.map((item) => `${item.name} [${item.protocol}/${item.status}]`).join("; ")}.`);
  }
  if (result.evidence.length > 0) {
    lines.push("Evidence:");
    for (const item of result.evidence) {
      lines.push(`- [${item.audience}/${item.verification}] ${item.claim} (${item.sourceUrl})`);
    }
  } else {
    lines.push("No supporting evidence was collected for this action.");
  }
  if (result.boundary) {
    lines.push(
      `Responsibility (human-provided): ${result.boundary.replace("-", " ")}${result.boundaryRationale ? ` — ${result.boundaryRationale}` : ""}.`,
    );
  }
  if (result.recommendation) {
    lines.push(`Recommendation: ${result.recommendation}`);
  }
  if (result.governance) {
    lines.push(
      `Governance: authentication ${yesNo(result.governance.requiresAuthentication)}, authorization ${yesNo(
        result.governance.requiresAuthorization,
      )}, explicit confirmation ${yesNo(result.governance.requiresConfirmation)}, side effects ${result.governance.sideEffects}.`,
    );
  }
  if (result.contractUrl) {
    lines.push(`Machine-readable contract: ${result.contractUrl}`);
  }
  return lines.join("\n");
}

function yesNo(value: boolean): string {
  return value ? "required" : "not required";
}

import { explainClassification, explainExpectation } from "./explainExpectation.js";
import type { CapabilityResult, ReportRecord } from "../types/index.js";

export interface StageCount {
  ready: number;
  expected: number;
}

export interface AuditToolResult {
  reportId: string;
  canonicalUrl: string;
  archetype: string;
  classificationConfidence: string;
  /** How the site was read: the content and behavior that grounded the archetype. */
  classificationGrounding: string | null;
  agentReadinessScore: number;
  foundationAuditScore: number | null;
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
  /** Plain-language reasoning: why this action belongs on this site's map. */
  whyExpected: string;
  state: string;
  humanSupport: boolean;
  agentSupport: boolean;
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
  const notes = report.errors.map((error) => `${error.phase}: ${error.message}`);
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
    classificationGrounding: explainClassification(report.classification),
    agentReadinessScore: report.score?.value ?? 0,
    foundationAuditScore: report.foundationAudit?.score ?? null,
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
    ...(result.classificationGrounding ? [result.classificationGrounding] : []),
    `Verified agent readiness: ${result.agentReadinessScore}/100${
      result.foundationAuditScore === null ? "" : ` · AI Audit foundation score: ${result.foundationAuditScore}/100`
    }.`,
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
    whyExpected: whyExpectedText(report, capability),
    state: capability.state,
    humanSupport: capability.humanSupport,
    agentSupport: capability.agentSupport,
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
  };
}

export function capabilitySummaryText(result: CapabilityToolResult): string {
  const lines = [
    `${result.label} — ${result.state.replace("-", " ")} (${result.intent}, ${result.stage} stage).`,
    `Why expected: ${result.whyExpected}`,
    `Human support: ${result.humanSupport ? "yes" : "no"}. Agent support: ${result.agentSupport ? "yes" : "no"}.`,
  ];
  if (result.evidence.length > 0) {
    lines.push("Evidence:");
    for (const item of result.evidence) {
      lines.push(`- [${item.audience}/${item.verification}] ${item.claim} (${item.sourceUrl})`);
    }
  } else {
    lines.push("No supporting evidence was collected for this action.");
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

function whyExpectedText(report: ReportRecord, capability: CapabilityResult): string {
  const why = explainExpectation(report.classification, capability);
  return [why.headline, why.grounding, why.caveat].filter(Boolean).join(" ");
}

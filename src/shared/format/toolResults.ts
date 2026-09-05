import type { FoundationAuditSummary, HumanAssertion, ReportRecord } from "../types/index.js";

/**
 * Tool results that are neither a report summary nor a capability explanation: the foundation
 * audit read, and the answer a refinement gives back. They live here rather than in a browser
 * component because the same shapes have to come back over every transport — a remote caller and
 * an in-page agent must receive the same answer to the same question.
 */

export interface FoundationAuditToolResult {
  reportId: string;
  canonicalUrl: string;
  score: number;
  summary: string;
  findings: string[];
  quickWins: FoundationAuditSummary["quickWins"];
  dimensions: FoundationAuditSummary["sections"];
  provider: string;
  collectedAt: string | null;
  sourceUrl: string | null;
  mainAuditUrl: string;
}

const MAIN_AI_AUDIT_URL = "https://audit.wordlift.io";

export function foundationAuditForAgent(report: ReportRecord): FoundationAuditToolResult {
  const audit = report.foundationAudit;
  if (!audit) throw new Error("This report has no WordLift foundation audit.");
  return {
    reportId: report.id,
    canonicalUrl: report.canonicalUrl ?? report.requestedUrl,
    score: audit.score,
    summary: audit.summary,
    findings: audit.findings,
    quickWins: audit.quickWins,
    dimensions: audit.sections,
    provider: audit.provider,
    collectedAt: audit.collectedAt ?? null,
    sourceUrl: audit.sourceUrl ?? null,
    mainAuditUrl: MAIN_AI_AUDIT_URL,
  };
}

export function foundationAuditText(result: FoundationAuditToolResult): string {
  const lines = [
    `${result.canonicalUrl} has a WordLift foundation score of ${result.score}/100.`,
    result.summary,
    `${result.dimensions.length} audited dimensions · ${result.findings.length} findings · ${result.quickWins.length} quick wins.`,
  ];
  if (result.findings.length > 0) {
    lines.push("Findings:");
    for (const finding of result.findings) lines.push(`- ${finding}`);
  }
  lines.push(`Main WordLift AI Audit: ${result.mainAuditUrl}`);
  return lines.join("\n");
}

export interface RefineToolResult {
  parentReportId: string;
  reportId: string;
  reportUrl: string;
  decisionsApplied: number;
  conflicts: string[];
  businessRole: string | null;
  boundaries: Array<{ actionId: string; label: string; boundary: string }>;
  rejected: string[];
  confirmed: string[];
  agentReadinessScore: number;
  note: string;
}

const REFINEMENT_NOTE =
  "The refined Terms of Action are a new immutable report; the machine draft is unchanged at its own URL. Readiness scores still count only invocation-verified interfaces.";

/** What a reviewer's decisions did to the draft, read back off the child report they produced. */
export function refineToolResult(
  parent: ReportRecord,
  child: ReportRecord,
  assertions: HumanAssertion,
  childUrl: string,
): RefineToolResult {
  const boundaries = (child.capabilities ?? [])
    .filter((capability) => capability.boundarySource === "human-provided" && capability.boundary)
    .map((capability) => ({
      actionId: capability.actionId,
      label: capability.label,
      boundary: capability.boundary as string,
    }));
  const decided = new Map((assertions.actionDecisions ?? []).map((decision) => [decision.actionId, decision.decision]));
  return {
    parentReportId: parent.id,
    reportId: child.id,
    reportUrl: childUrl,
    decisionsApplied: child.refinement?.decisions ?? 0,
    conflicts: child.refinement?.conflicts ?? [],
    businessRole: child.classification?.businessRole ?? null,
    boundaries,
    rejected: [...decided].filter(([, decision]) => decision === "reject").map(([actionId]) => actionId),
    confirmed: [...decided].filter(([, decision]) => decision === "confirm").map(([actionId]) => actionId),
    agentReadinessScore: child.score?.value ?? 0,
    note: REFINEMENT_NOTE,
  };
}

export function refineSummaryText(result: RefineToolResult): string {
  const lines = [
    `Human-refined Terms of Action created: ${result.reportUrl}`,
    `${result.decisionsApplied} decision${result.decisionsApplied === 1 ? "" : "s"} applied to the machine draft (report ${result.parentReportId}).`,
  ];
  if (result.businessRole) lines.push(`Business role: ${result.businessRole}.`);
  for (const boundary of result.boundaries) {
    lines.push(`- ${boundary.label} (${boundary.actionId}) → ${boundary.boundary.replace("-", " ")}`);
  }
  if (result.rejected.length > 0) lines.push(`Rejected as not this business's actions: ${result.rejected.join(", ")}.`);
  if (result.confirmed.length > 0) lines.push(`Confirmed as expected: ${result.confirmed.join(", ")}.`);
  lines.push(`Verified agent readiness remains ${result.agentReadinessScore}/100 — human decisions never mark an action agent-ready.`);
  if (result.conflicts.length > 0) {
    lines.push("Not applied:");
    for (const conflict of result.conflicts) lines.push(`- ${conflict}`);
  }
  return lines.join("\n");
}

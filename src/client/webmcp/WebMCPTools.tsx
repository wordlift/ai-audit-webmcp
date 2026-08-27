import { useWebMCP, type WebMCPToolResponse } from "use-webmcp-tool";
import { z } from "zod";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { createReport } from "../api/client";

const auditWebsiteArguments = z.object({
  url: z.string().min(1).max(2_048),
}).strict();

const explainCapabilityArguments = z.object({
  actionId: z.string().min(1).max(160),
}).strict();

export const auditWebsiteInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    url: {
      type: "string",
      format: "uri",
      description: "Public HTTP or HTTPS website URL to audit for agent capabilities.",
    },
  },
  required: ["url"],
} as const;

export const explainCapabilityInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    actionId: {
      type: "string",
      description: "Stable action identifier from the currently visible capability report.",
    },
  },
  required: ["actionId"],
} as const;

type StructuredToolResponse<T extends Record<string, unknown>> = WebMCPToolResponse & {
  structuredContent: T;
};

function absoluteReportUrl(reportId: string): string {
  return new URL(`/reports/${reportId}`, window.location.origin).toString();
}

function stageCounts(capabilities: CapabilityResult[]) {
  return capabilities.reduce((counts, capability) => {
    counts[capability.stage] += 1;
    return counts;
  }, {
    discover: 0,
    "understand-decide": 0,
    act: 0,
    manage: 0,
  });
}

function stateCounts(capabilities: CapabilityResult[]) {
  return capabilities.reduce((counts, capability) => {
    counts[capability.state] += 1;
    return counts;
  }, {
    "not-expected": 0,
    "sidecar-enabled": 0,
    "agent-ready": 0,
    unverified: 0,
    "human-only": 0,
    missing: 0,
  });
}

export function summarizeAuditForAgent(report: ReportRecord) {
  if (report.status === "running") {
    throw new Error("The audit did not reach a terminal result. Retry the audit instead of treating it as complete.");
  }
  if (report.status === "failed") {
    throw new Error(report.errors[0]?.message ?? "The website audit failed without usable evidence.");
  }
  const capabilities = report.capabilities ?? [];
  const reportUrl = absoluteReportUrl(report.id);
  return {
    reportId: report.id,
    reportUrl,
    status: report.status,
    requestedUrl: report.requestedUrl,
    canonicalUrl: report.canonicalUrl ?? report.requestedUrl,
    archetype: report.classification?.primaryArchetype ?? "other",
    classificationProvisional: report.classification?.provisional ?? true,
    scores: {
      agentReadiness: report.score?.value ?? 0,
      auditFoundation: report.foundationAudit?.score ?? null,
    },
    stageCounts: stageCounts(capabilities),
    stateCounts: stateCounts(capabilities),
    topGaps: (report.priorities ?? []).map(({ actionId, label, state, reason }) => ({ actionId, label, state, reason })),
    errors: report.errors.map(({ code, phase, message, retryable }) => ({ code, phase, message, retryable })),
  };
}

function auditToolResponse(report: ReportRecord): StructuredToolResponse<ReturnType<typeof summarizeAuditForAgent>> {
  const result = summarizeAuditForAgent(report);
  const stageTotal = Object.values(result.stageCounts).reduce((sum, count) => sum + count, 0);
  const text = [
    `${result.status === "partial" ? "Partial audit" : "Audit complete"} for ${result.canonicalUrl}.`,
    `The site is classified as ${result.archetype}; agent readiness is ${result.scores.agentReadiness}/100 across ${stageTotal} expected actions.`,
    result.topGaps.length > 0 ? `Highest-impact gaps: ${result.topGaps.map((gap) => gap.label).join(", ")}.` : "No priority gaps were identified.",
    `Full evidence and contracts: ${result.reportUrl}`,
  ].join(" ");
  return { content: [{ type: "text", text }], structuredContent: result };
}

export function AuditWebsiteTool() {
  useWebMCP<z.infer<typeof auditWebsiteArguments>, StructuredToolResponse<ReturnType<typeof summarizeAuditForAgent>>>({
    name: "audit-website",
    description: "Audit a public website, infer the actions agents should support, and return completed evidence-backed readiness findings with a full report URL.",
    inputSchema: auditWebsiteInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    async execute(input) {
      const { url } = auditWebsiteArguments.parse(input);
      return auditToolResponse(await createReport(url));
    },
  });
  return null;
}

function capabilityToolResponse(report: ReportRecord, capability: CapabilityResult) {
  const result = {
    reportId: report.id,
    reportUrl: absoluteReportUrl(report.id),
    actionId: capability.actionId,
    label: capability.label,
    description: capability.description,
    stage: capability.stage,
    intent: capability.intent,
    state: capability.state,
    humanSupport: capability.humanSupport,
    agentSupport: capability.agentSupport,
    recommendation: capability.recommendation ?? null,
    evidence: capability.evidence,
    contract: capability.contract ?? null,
  };
  const text = [
    `${capability.label} is ${capability.state}.`,
    `Human support: ${capability.humanSupport ? "yes" : "no"}; agent support: ${capability.agentSupport ? "yes" : "no"}.`,
    capability.recommendation ?? "No implementation recommendation is required.",
    `Full report: ${result.reportUrl}`,
  ].join(" ");
  return { content: [{ type: "text", text }], structuredContent: result };
}

export function ExplainCapabilityTool({ report }: { report: ReportRecord }) {
  useWebMCP<z.infer<typeof explainCapabilityArguments>, ReturnType<typeof capabilityToolResponse>>({
    name: "explain-capability",
    description: "Explain one action from the currently visible audit report, including human and agent evidence, its implementation recommendation, and machine-readable contract.",
    inputSchema: explainCapabilityInputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    enabled: report.status === "completed" || report.status === "partial",
    execute(input) {
      const { actionId } = explainCapabilityArguments.parse(input);
      const capability = report.capabilities?.find((candidate) => candidate.actionId === actionId);
      if (!capability) throw new Error(`Capability ${actionId} is not part of the visible report.`);
      return capabilityToolResponse(report, capability);
    },
  });
  return null;
}

import { useWebMCP } from "use-webmcp-tool";
import type { FoundationAuditSummary, ReportRecord } from "../../shared/types/index.js";
import { EXPLAIN_FOUNDATION_AUDIT_TOOL } from "./toolSchemas";

interface ExplainFoundationAuditArgs {
  reportId?: unknown;
}

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

export function ExplainFoundationAuditTool({ report }: { report: ReportRecord }) {
  useWebMCP<ExplainFoundationAuditArgs, FoundationAuditToolResult>({
    name: EXPLAIN_FOUNDATION_AUDIT_TOOL.name,
    description: EXPLAIN_FOUNDATION_AUDIT_TOOL.description,
    inputSchema: EXPLAIN_FOUNDATION_AUDIT_TOOL.inputSchema,
    annotations: EXPLAIN_FOUNDATION_AUDIT_TOOL.annotations,
    execute: async (args) => {
      if (typeof args?.reportId === "string" && args.reportId !== report.id) {
        throw new Error(`Report ${args.reportId} is not open in this page.`);
      }
      if (!report.foundationAudit) throw new Error("This report has no WordLift foundation audit.");
      return foundationAuditForAgent(report);
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: foundationAuditText(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

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

import { useWebMCP } from "use-webmcp-tool";
import {
  auditRunningText,
  auditSummaryText,
  summarizeReportForAgent,
  summarizeRunningReport,
  type AuditRunningResult,
  type AuditToolResult,
} from "../../shared/format/agentSummary.js";
import { explainReportError, visibleErrors } from "../../shared/format/explainError.js";
import { getReport, reportPageUrl } from "../api/client";
import { GET_AUDIT_REPORT_TOOL } from "./toolSchemas";

interface GetAuditReportArgs {
  reportId?: unknown;
}

/**
 * The status-and-result half of the asynchronous audit flow: `audit-website` hands out a
 * reportId, and this tool turns it into progress while the audit runs and into the finished
 * summary once a terminal report exists.
 */
export function GetAuditReportTool() {
  useWebMCP<GetAuditReportArgs, AuditToolResult | AuditRunningResult>({
    name: GET_AUDIT_REPORT_TOOL.name,
    description: GET_AUDIT_REPORT_TOOL.description,
    inputSchema: GET_AUDIT_REPORT_TOOL.inputSchema,
    annotations: GET_AUDIT_REPORT_TOOL.annotations,
    execute: async (args) => {
      const reportId = typeof args?.reportId === "string" ? args.reportId.trim() : "";
      if (!reportId) throw new Error("Provide the reportId returned by audit-website.");

      const report = await getReport(reportId);
      if (report.status === "running") return summarizeRunningReport(report, reportPageUrl(report.id));
      if (report.status === "failed") {
        const reason = visibleErrors(report.errors).map(explainReportError).join(" ") || "No usable evidence could be collected from this site.";
        throw new Error(`The audit could not be completed: ${reason}`);
      }
      return summarizeReportForAgent(report, reportPageUrl(report.id));
    },
    formatOutput: (result) => ({
      content: [
        {
          type: "text",
          text: "status" in result && result.status === "running"
            ? auditRunningText(result)
            : auditSummaryText(result as AuditToolResult),
        },
      ],
      structuredContent: result,
    }),
  });

  return null;
}

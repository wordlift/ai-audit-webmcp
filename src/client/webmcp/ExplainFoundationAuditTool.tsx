import { useWebMCP } from "use-webmcp-tool";
import {
  foundationAuditForAgent,
  foundationAuditText,
  type FoundationAuditToolResult,
} from "../../shared/format/toolResults.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { resolveOpenReport } from "./reportToolScope";
import { EXPLAIN_FOUNDATION_AUDIT_TOOL } from "./toolSchemas";

interface ExplainFoundationAuditArgs {
  reportId?: unknown;
}

export function ExplainFoundationAuditTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  useWebMCP<ExplainFoundationAuditArgs, FoundationAuditToolResult>({
    name: EXPLAIN_FOUNDATION_AUDIT_TOOL.name,
    description: EXPLAIN_FOUNDATION_AUDIT_TOOL.description,
    inputSchema: EXPLAIN_FOUNDATION_AUDIT_TOOL.inputSchema,
    annotations: EXPLAIN_FOUNDATION_AUDIT_TOOL.annotations,
    enabled: Boolean(reportId),
    execute: async (args) => {
      const current = await resolveOpenReport(reportId, report, args?.reportId);
      if (!current.foundationAudit) throw new Error("This report has no WordLift foundation audit.");
      return foundationAuditForAgent(current);
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: foundationAuditText(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

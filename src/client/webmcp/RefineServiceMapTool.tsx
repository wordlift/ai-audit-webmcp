import { useWebMCP } from "use-webmcp-tool";
import { refineSummaryText, refineToolResult, type RefineToolResult } from "../../shared/format/toolResults.js";
import { humanAssertionSchema } from "../../shared/schemas/report.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { refineReport, reportPageUrl } from "../api/client";
import { resolveOpenReport } from "./reportToolScope";
import { REFINE_SERVICE_MAP_TOOL, REFINE_SERVICE_MAP_TOOL_ALIAS } from "./toolSchemas";

interface RefineArgs {
  reportId?: unknown;
  businessRole?: unknown;
  primaryEntityIds?: unknown;
  demotedEntityIds?: unknown;
  terminology?: unknown;
  terminologyDecisions?: unknown;
  actionDecisions?: unknown;
}

export function RefineServiceMapTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  const execute = async (args: RefineArgs) => {
    const current = await resolveOpenReport(reportId, report, args?.reportId);
    if (!current.capabilities) throw new Error("This report carries no Terms of Action to refine.");
    const { reportId: _scope, ...assertionInput } = (args ?? {}) as Record<string, unknown>;
    const parsed = humanAssertionSchema.safeParse(assertionInput);
    if (!parsed.success) {
      const reasons = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      throw new Error(`The refinement was not applied — fix the input and call again. ${reasons}`);
    }
    const assertions = parsed.data;

    const child = await refineReport(current.id, assertions);
    return refineToolResult(current, child, assertions, reportPageUrl(child.id));
  };

  const formatOutput = (result: RefineToolResult) => ({
    content: [{ type: "text" as const, text: refineSummaryText(result) }],
    structuredContent: result,
  });

  useWebMCP<RefineArgs, RefineToolResult>({
    name: REFINE_SERVICE_MAP_TOOL.name,
    description: REFINE_SERVICE_MAP_TOOL.description,
    inputSchema: REFINE_SERVICE_MAP_TOOL.inputSchema,
    annotations: REFINE_SERVICE_MAP_TOOL.annotations,
    enabled: Boolean(reportId),
    execute,
    formatOutput,
  });

  // Writes are addressed by name too: a reviewer mid-interview must not lose the refine step
  // because the tool was renamed underneath them.
  useWebMCP<RefineArgs, RefineToolResult>({
    name: REFINE_SERVICE_MAP_TOOL_ALIAS.name,
    description: REFINE_SERVICE_MAP_TOOL_ALIAS.description,
    inputSchema: REFINE_SERVICE_MAP_TOOL_ALIAS.inputSchema,
    annotations: REFINE_SERVICE_MAP_TOOL_ALIAS.annotations,
    enabled: Boolean(reportId),
    execute,
    formatOutput,
  });

  return null;
}

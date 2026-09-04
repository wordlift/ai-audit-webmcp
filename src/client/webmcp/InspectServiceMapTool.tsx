import { useWebMCP } from "use-webmcp-tool";
import {
  inspectServiceMap,
  inspectSummaryText,
  type InspectServiceMapResult,
} from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { reportPageUrl } from "../api/client";
import { resolveOpenReport } from "./reportToolScope";
import { INSPECT_SERVICE_MAP_TOOL, INSPECT_SERVICE_MAP_TOOL_ALIAS } from "./toolSchemas";

interface InspectArgs {
  reportId?: unknown;
}

/**
 * The read half of the human-refinement loop: one call gives an agent everything it needs to
 * interview the business owner — role, entities with ids, terminology, and every action with
 * its readiness and boundary — so the workflow is inspect → interview → refine, never guesswork.
 */
export function InspectServiceMapTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  const execute = async (args: InspectArgs) => {
    const current = await resolveOpenReport(reportId, report, args?.reportId);
    if (!current.capabilities || !current.contextGraph) {
      throw new Error("This report carries no Terms of Action to inspect.");
    }
    return inspectServiceMap(current, reportPageUrl(current.id));
  };
  const formatOutput = (result: InspectServiceMapResult) => ({
    content: [{ type: "text" as const, text: inspectSummaryText(result) }],
    structuredContent: result,
  });

  useWebMCP<InspectArgs, InspectServiceMapResult>({
    name: INSPECT_SERVICE_MAP_TOOL.name,
    description: INSPECT_SERVICE_MAP_TOOL.description,
    inputSchema: INSPECT_SERVICE_MAP_TOOL.inputSchema,
    annotations: INSPECT_SERVICE_MAP_TOOL.annotations,
    enabled: Boolean(reportId),
    execute,
    formatOutput,
  });

  // The name this tool carried before the rename, so an agent working from a saved procedure or an
  // older session still reaches the same handler instead of failing to find any tool at all.
  useWebMCP<InspectArgs, InspectServiceMapResult>({
    name: INSPECT_SERVICE_MAP_TOOL_ALIAS.name,
    description: INSPECT_SERVICE_MAP_TOOL_ALIAS.description,
    inputSchema: INSPECT_SERVICE_MAP_TOOL_ALIAS.inputSchema,
    annotations: INSPECT_SERVICE_MAP_TOOL_ALIAS.annotations,
    enabled: Boolean(reportId),
    execute,
    formatOutput,
  });

  return null;
}

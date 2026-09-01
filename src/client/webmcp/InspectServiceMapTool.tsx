import { useWebMCP } from "use-webmcp-tool";
import {
  inspectServiceMap,
  inspectSummaryText,
  type InspectServiceMapResult,
} from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { reportPageUrl } from "../api/client";
import { resolveOpenReport } from "./reportToolScope";
import { INSPECT_SERVICE_MAP_TOOL } from "./toolSchemas";

interface InspectArgs {
  reportId?: unknown;
}

/**
 * The read half of the human-refinement loop: one call gives an agent everything it needs to
 * interview the business owner — role, entities with ids, terminology, and every action with
 * its readiness and boundary — so the workflow is inspect → interview → refine, never guesswork.
 */
export function InspectServiceMapTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  useWebMCP<InspectArgs, InspectServiceMapResult>({
    name: INSPECT_SERVICE_MAP_TOOL.name,
    description: INSPECT_SERVICE_MAP_TOOL.description,
    inputSchema: INSPECT_SERVICE_MAP_TOOL.inputSchema,
    annotations: INSPECT_SERVICE_MAP_TOOL.annotations,
    enabled: Boolean(reportId),
    execute: async (args) => {
      const current = await resolveOpenReport(reportId, report, args?.reportId);
      if (!current.capabilities || !current.contextGraph) {
        throw new Error("This report carries no service map to inspect.");
      }
      return inspectServiceMap(current, reportPageUrl(current.id));
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: inspectSummaryText(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

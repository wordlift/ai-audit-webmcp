import { useWebMCP } from "use-webmcp-tool";
import { businessModel, businessModelText, type BusinessModelResult } from "../../shared/format/businessModel.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { reportPageUrl } from "../api/client";
import { resolveOpenReport } from "./reportToolScope";
import { INSPECT_BUSINESS_MODEL_TOOL } from "./toolSchemas";

interface InspectArgs {
  reportId?: unknown;
}

/**
 * The business as the audit modelled it, for an agent on the report page: what it offers, which
 * things matter, which are only inferred, and what an agent can do here today. The report's own
 * graph answers; nothing is fetched from the site, nothing is guessed on the spot.
 */
export function InspectBusinessModelTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  useWebMCP<InspectArgs, BusinessModelResult>({
    name: INSPECT_BUSINESS_MODEL_TOOL.name,
    description: INSPECT_BUSINESS_MODEL_TOOL.description,
    inputSchema: INSPECT_BUSINESS_MODEL_TOOL.inputSchema,
    annotations: INSPECT_BUSINESS_MODEL_TOOL.annotations,
    enabled: Boolean(reportId),
    execute: async (args) => {
      const current = await resolveOpenReport(reportId, report, args?.reportId);
      if (!current.contextGraph) throw new Error("This report carries no business model yet.");
      return businessModel(current, reportPageUrl(current.id));
    },
    formatOutput: (result) => ({ content: [{ type: "text" as const, text: businessModelText(result) }], structuredContent: result }),
  });
  return null;
}

import { useWebMCP } from "use-webmcp-tool";
import {
  capabilitySummaryText,
  describeCapabilityForAgent,
  type CapabilityToolResult,
} from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { absoluteUrl, contractPath } from "../api/client";
import { EXPLAIN_CAPABILITY_TOOL } from "./toolSchemas";

interface ExplainCapabilityArgs {
  reportId?: unknown;
  actionId?: unknown;
}

/**
 * Report-scoped tool. It registers only while a completed report is on screen and unregisters
 * on unmount, so the agent's tool list follows the visible page context.
 */
export function ExplainCapabilityTool({ report }: { report: ReportRecord | null }) {
  const enabled = Boolean(report && report.capabilities && report.capabilities.length > 0);

  useWebMCP<ExplainCapabilityArgs, CapabilityToolResult>({
    name: EXPLAIN_CAPABILITY_TOOL.name,
    description: EXPLAIN_CAPABILITY_TOOL.description,
    inputSchema: EXPLAIN_CAPABILITY_TOOL.inputSchema,
    annotations: EXPLAIN_CAPABILITY_TOOL.annotations,
    enabled,
    execute: (args) => {
      if (!report || !report.capabilities) {
        throw new Error("No capability map is open in this page. Run audit-website first.");
      }
      if (typeof args?.reportId === "string" && args.reportId.length > 0 && args.reportId !== report.id) {
        throw new Error(`This page holds report ${report.id}. Open ${args.reportId} to explain its actions.`);
      }
      const actionId = typeof args?.actionId === "string" ? args.actionId.trim() : "";
      if (!actionId) throw new Error("Provide the actionId to explain.");

      const capability = report.capabilities.find((candidate) => candidate.actionId === actionId);
      if (!capability) {
        const known = report.capabilities.map((candidate) => candidate.actionId).join(", ");
        throw new Error(`Report ${report.id} has no action "${actionId}". Known actions: ${known}.`);
      }

      return describeCapabilityForAgent(
        report,
        capability,
        capability.contract ? absoluteUrl(contractPath(report.id, capability.actionId)) : null,
      );
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: capabilitySummaryText(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

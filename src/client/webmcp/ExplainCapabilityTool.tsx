import { useWebMCP } from "use-webmcp-tool";
import {
  capabilitySummaryText,
  describeCapabilityForAgent,
  type CapabilityToolResult,
} from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { absoluteUrl, contractPath } from "../api/client";
import { resolveOpenReport } from "./reportToolScope";
import { EXPLAIN_CAPABILITY_TOOL } from "./toolSchemas";

interface ExplainCapabilityArgs {
  reportId?: unknown;
  actionId?: unknown;
}

/**
 * Report-scoped tool. It registers the moment the report route mounts — the agent's tool list
 * follows the page context without waiting for the report to render — and resolves the report
 * only when invoked.
 */
export function ExplainCapabilityTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  useWebMCP<ExplainCapabilityArgs, CapabilityToolResult>({
    name: EXPLAIN_CAPABILITY_TOOL.name,
    description: EXPLAIN_CAPABILITY_TOOL.description,
    inputSchema: EXPLAIN_CAPABILITY_TOOL.inputSchema,
    annotations: EXPLAIN_CAPABILITY_TOOL.annotations,
    enabled: Boolean(reportId),
    execute: async (args) => {
      const current = await resolveOpenReport(reportId, report, args?.reportId);
      if (!current.capabilities) throw new Error("This report carries no capability map.");
      const actionId = typeof args?.actionId === "string" ? args.actionId.trim() : "";
      if (!actionId) throw new Error("Provide the actionId to explain.");

      const capability = current.capabilities.find((candidate) => candidate.actionId === actionId);
      if (!capability) {
        const known = current.capabilities.map((candidate) => candidate.actionId).join(", ");
        throw new Error(`Report ${current.id} has no action "${actionId}". Known actions: ${known}.`);
      }

      return describeCapabilityForAgent(
        current,
        capability,
        capability.contract ? absoluteUrl(contractPath(current.id, capability.actionId)) : null,
      );
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: capabilitySummaryText(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

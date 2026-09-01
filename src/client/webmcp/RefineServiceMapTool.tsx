import { useWebMCP } from "use-webmcp-tool";
import { humanAssertionSchema } from "../../shared/schemas/report.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { refineReport, reportPageUrl } from "../api/client";
import { REFINE_SERVICE_MAP_TOOL } from "./toolSchemas";

interface RefineArgs {
  reportId?: unknown;
  businessRole?: unknown;
  primaryEntityIds?: unknown;
  demotedEntityIds?: unknown;
  terminology?: unknown;
  actionDecisions?: unknown;
}

export interface RefineToolResult {
  parentReportId: string;
  reportId: string;
  reportUrl: string;
  decisionsApplied: number;
  conflicts: string[];
  businessRole: string | null;
  boundaries: Array<{ actionId: string; label: string; boundary: string }>;
  rejected: string[];
  confirmed: string[];
  agentReadinessScore: number;
  note: string;
}

/**
 * Report-scoped tool: the write half of the human-refinement loop. It turns a reviewer's
 * structured decisions into an immutable child revision and answers with the new report's URL.
 * The machine draft is never changed in place, and no decision here can mark an action
 * agent-ready — readiness still requires invocation evidence.
 */
export function RefineServiceMapTool({ report }: { report: ReportRecord | null }) {
  const enabled = Boolean(report && report.capabilities && report.capabilities.length > 0);

  useWebMCP<RefineArgs, RefineToolResult>({
    name: REFINE_SERVICE_MAP_TOOL.name,
    description: REFINE_SERVICE_MAP_TOOL.description,
    inputSchema: REFINE_SERVICE_MAP_TOOL.inputSchema,
    annotations: REFINE_SERVICE_MAP_TOOL.annotations,
    enabled,
    execute: async (args) => {
      if (!report || !report.capabilities) {
        throw new Error("No service map is open in this page. Run audit-website first.");
      }
      if (typeof args?.reportId === "string" && args.reportId.length > 0 && args.reportId !== report.id) {
        throw new Error(`This page holds report ${report.id}. Open ${args.reportId} to refine it.`);
      }
      const { reportId: _scope, ...assertionInput } = (args ?? {}) as Record<string, unknown>;
      const assertions = humanAssertionSchema.parse(assertionInput);

      const child = await refineReport(report.id, assertions);
      const refinement = child.refinement;
      const boundaries = (child.capabilities ?? [])
        .filter((capability) => capability.boundarySource === "human-provided" && capability.boundary)
        .map((capability) => ({
          actionId: capability.actionId,
          label: capability.label,
          boundary: capability.boundary as string,
        }));
      const decided = new Map((assertions.actionDecisions ?? []).map((decision) => [decision.actionId, decision.decision]));
      return {
        parentReportId: report.id,
        reportId: child.id,
        reportUrl: reportPageUrl(child.id),
        decisionsApplied: refinement?.decisions ?? 0,
        conflicts: refinement?.conflicts ?? [],
        businessRole: child.classification?.businessRole ?? null,
        boundaries,
        rejected: [...decided].filter(([, decision]) => decision === "reject").map(([actionId]) => actionId),
        confirmed: [...decided].filter(([, decision]) => decision === "confirm").map(([actionId]) => actionId),
        agentReadinessScore: child.score?.value ?? 0,
        note: "The refined map is a new immutable report; the machine draft is unchanged at its own URL. Readiness scores still count only invocation-verified interfaces.",
      };
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: refineSummaryText(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

function refineSummaryText(result: RefineToolResult): string {
  const lines = [
    `Human-refined service map created: ${result.reportUrl}`,
    `${result.decisionsApplied} decision${result.decisionsApplied === 1 ? "" : "s"} applied to the machine draft (report ${result.parentReportId}).`,
  ];
  if (result.businessRole) lines.push(`Business role: ${result.businessRole}.`);
  for (const boundary of result.boundaries) {
    lines.push(`- ${boundary.label} (${boundary.actionId}) → ${boundary.boundary.replace("-", " ")}`);
  }
  if (result.rejected.length > 0) lines.push(`Rejected as not this business's actions: ${result.rejected.join(", ")}.`);
  if (result.confirmed.length > 0) lines.push(`Confirmed as expected: ${result.confirmed.join(", ")}.`);
  lines.push(`Verified agent readiness remains ${result.agentReadinessScore}/100 — human decisions never mark an action agent-ready.`);
  if (result.conflicts.length > 0) {
    lines.push("Not applied:");
    for (const conflict of result.conflicts) lines.push(`- ${conflict}`);
  }
  return lines.join("\n");
}

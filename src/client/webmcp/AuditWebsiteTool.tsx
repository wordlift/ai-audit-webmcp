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
import type { Archetype, ReportRecord } from "../../shared/types/index.js";
import { getReport, reportPageUrl, startReport } from "../api/client";
import { ARCHETYPE_VALUES, AUDIT_WEBSITE_TOOL } from "./toolSchemas";
import { WebMcpBadge } from "./WebMcpBadge";

interface AuditWebsiteArgs {
  url?: unknown;
  archetype?: unknown;
}

function parseArchetype(value: unknown): Archetype | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const match = ARCHETYPE_VALUES.find((archetype) => archetype === value);
  if (!match) throw new Error(`Unknown archetype "${value}". Use one of: ${ARCHETYPE_VALUES.join(", ")}.`);
  return match;
}

function failedAuditError(url: string, report: ReportRecord): Error {
  const reason = visibleErrors(report.errors).map(explainReportError).join(" ") || "No usable evidence could be collected from this site.";
  return new Error(`The audit could not be completed for ${url}: ${reason}`);
}

const GRACE_MS = 8_000;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Registers `audit-website` for the whole application. A fast audit still answers in one call
 * with the finished report; one that outlives the grace window answers immediately with the
 * report id and points at `get-audit-report`, so the agent's call never times out waiting.
 * Either way the agent never receives "audit started" dressed up as a finished result.
 */
export function AuditWebsiteTool({
  graceMs = GRACE_MS,
  pollWaitMs,
}: {
  graceMs?: number;
  /** Test seam: overrides the poll pacing of the background wait for the terminal report. */
  pollWaitMs?: (ms: number) => Promise<void>;
} = {}) {
  const state = useWebMCP<AuditWebsiteArgs, AuditToolResult | AuditRunningResult>({
    name: AUDIT_WEBSITE_TOOL.name,
    description: AUDIT_WEBSITE_TOOL.description,
    inputSchema: AUDIT_WEBSITE_TOOL.inputSchema,
    annotations: AUDIT_WEBSITE_TOOL.annotations,
    execute: async (args) => {
      const url = typeof args?.url === "string" ? args.url.trim() : "";
      if (!url) throw new Error("Provide the public http(s) URL of the website to audit.");
      const archetype = parseArchetype(args?.archetype);

      const started = startReport(url, { archetype, waitMs: pollWaitMs });
      // The background wait keeps running after an early answer; its outcome must surface as a
      // value here or be swallowed there, never as an unhandled rejection.
      const settled = started.ready.then(
        (report) => ({ report }),
        (error: unknown) => ({ error }),
      );
      const outcome = await Promise.race([settled, wait(graceMs).then(() => null)]);

      if (outcome === null) {
        const current = await getReport(started.reportId).catch(() => null);
        if (current && current.status === "failed") throw failedAuditError(url, current);
        if (current && current.status !== "running") return summarizeReportForAgent(current, reportPageUrl(current.id));
        return summarizeRunningReport(
          current ?? { id: started.reportId, phase: "understanding" },
          reportPageUrl(started.reportId),
        );
      }
      if ("error" in outcome) throw outcome.error;

      const report = outcome.report;
      if (report.status === "failed") throw failedAuditError(url, report);
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

  return <WebMcpBadge state={state} label="WebMCP tools live" />;
}

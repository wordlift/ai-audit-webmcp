import { useWebMCP } from "use-webmcp-tool";
import { useNavigate } from "react-router-dom";
import { auditSummaryText, summarizeReportForAgent, type AuditToolResult } from "../../shared/format/agentSummary.js";
import type { Archetype } from "../../shared/types/index.js";
import { createReport, reportPageUrl } from "../api/client";
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

/**
 * Registers `audit-website` for the whole application. The promise resolves only once a
 * terminal report exists, so an agent never receives "audit started" as a successful result.
 */
export function AuditWebsiteTool() {
  const navigate = useNavigate();

  const state = useWebMCP<AuditWebsiteArgs, AuditToolResult>({
    name: AUDIT_WEBSITE_TOOL.name,
    description: AUDIT_WEBSITE_TOOL.description,
    inputSchema: AUDIT_WEBSITE_TOOL.inputSchema,
    annotations: AUDIT_WEBSITE_TOOL.annotations,
    execute: async (args) => {
      const url = typeof args?.url === "string" ? args.url.trim() : "";
      if (!url) throw new Error("Provide the public http(s) URL of the website to audit.");
      const archetype = parseArchetype(args?.archetype);

      const report = await createReport(url, { archetype });
      if (report.status === "failed") {
        const reason = report.errors[0]?.message ?? "No usable evidence could be collected from this site.";
        throw new Error(`The audit could not be completed for ${url}: ${reason}`);
      }

      navigate(`/reports/${report.id}`);
      return summarizeReportForAgent(report, reportPageUrl(report.id));
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: auditSummaryText(result) }],
      structuredContent: result,
    }),
  });

  return <WebMcpBadge state={state} label="WebMCP tools live" />;
}

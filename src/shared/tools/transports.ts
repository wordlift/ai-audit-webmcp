import type { ToolDefinition } from "./definitions.js";

/**
 * How a report-scoped tool reads over a transport with no open page.
 *
 * In the browser `reportId` is optional: the visible report is the one the reviewer means, and
 * asking an agent to repeat an id it can see is noise. A remote caller has no page, so the same
 * tool must be told which report it is talking about — the only difference between the two
 * surfaces, and one the shared definition keeps rather than forks.
 */
const REMOTE_REPORT_ID = {
  type: "string",
  description: "Identifier of the report to act on, as returned by audit-website.",
} as const;

export function withRequiredReportId(tool: ToolDefinition): ToolDefinition {
  const properties = tool.inputSchema.properties ?? {};
  if (!("reportId" in properties)) {
    throw new Error(`${tool.name} has no reportId to require; it is not a report-scoped tool.`);
  }
  const required = tool.inputSchema.required ?? [];
  return {
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: { ...properties, reportId: REMOTE_REPORT_ID },
      required: required.includes("reportId") ? [...required] : [...required, "reportId"],
    },
  };
}

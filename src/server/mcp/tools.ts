import {
  AUDIT_WEBSITE_TOOL,
  EXPLAIN_CAPABILITY_TOOL,
  EXPLAIN_FOUNDATION_AUDIT_TOOL,
  GET_AUDIT_REPORT_TOOL,
  INSPECT_SERVICE_MAP_TOOL,
  REFINE_SERVICE_MAP_TOOL,
  withClaimToken,
  withRequiredReportId,
  type ToolDefinition,
} from "../../shared/tools/index.js";
import type { AuditToolService, ToolAnswer } from "../services/AuditToolService.js";

/**
 * The AI Audit as a remote MCP server offers.
 *
 * Two things are deliberately absent. The Alpina availability tool is the sidecar demo, bound to
 * one allowlisted upstream, and has no meaning to a caller auditing their own site. The deprecated
 * `*-service-map` names stay registered in the browser, where callers wrote them down before the
 * rename; this surface is new and has no such history to keep working.
 */
export interface RemoteTool {
  definition: ToolDefinition;
  call(service: AuditToolService, args: unknown): Promise<ToolAnswer<unknown>>;
}

export const REMOTE_TOOLS: readonly RemoteTool[] = [
  {
    definition: AUDIT_WEBSITE_TOOL,
    call: (service, args) => service.auditWebsite(args),
  },
  {
    definition: withRequiredReportId(GET_AUDIT_REPORT_TOOL),
    call: (service, args) => service.getAuditReport(args),
  },
  {
    definition: withRequiredReportId(INSPECT_SERVICE_MAP_TOOL),
    call: (service, args) => service.inspectTermsOfAction(args),
  },
  {
    definition: withRequiredReportId(EXPLAIN_CAPABILITY_TOOL),
    call: (service, args) => service.explainCapability(args),
  },
  {
    definition: withRequiredReportId(EXPLAIN_FOUNDATION_AUDIT_TOOL),
    call: (service, args) => service.explainFoundationAudit(args),
  },
  {
    definition: withClaimToken(withRequiredReportId(REFINE_SERVICE_MAP_TOOL)),
    call: (service, args) => service.refineTermsOfAction(args),
  },
];

export function remoteTool(name: string): RemoteTool | undefined {
  return REMOTE_TOOLS.find((tool) => tool.definition.name === name);
}

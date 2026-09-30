import {
  AUDIT_WEBSITE_TOOL,
  EXPLAIN_CAPABILITY_TOOL,
  EXPLAIN_FOUNDATION_AUDIT_TOOL,
  GET_AUDIT_REPORT_TOOL,
  INSPECT_SERVICE_MAP_TOOL,
  withRequiredReportId,
  type ToolDefinition,
} from "../../shared/tools/index.js";
import type { AuditToolService, ToolAnswer } from "../services/AuditToolService.js";

/**
 * The AI Audit as a public remote MCP server offers.
 *
 * Two things are deliberately absent. The Alpina availability tool is the sidecar demo, bound to
 * one allowlisted upstream, and has no meaning to a caller auditing their own site. Publishing a
 * human refinement is also deliberately absent from this anonymous remote surface: that action
 * requires user-bound authorization and must not rely on a bearer secret carried in model-visible
 * tool results. Refinement remains available on the browser/WebMCP surface, where the reviewer is
 * acting on the open report.
 *
 * The deprecated `*-service-map` names stay registered in the browser, where callers wrote them
 * down before the rename; this surface is new and has no such history to keep working.
 */
export interface RemoteTool {
  definition: ToolDefinition;
  call(service: AuditToolService, args: unknown): Promise<ToolAnswer<unknown>>;
}

/**
 * The shared in-page definition names the browser refinement tool. The anonymous remote surface
 * intentionally does not publish that tool, so its description must not instruct a model to call
 * something that is absent from tools/list.
 */
const REMOTE_INSPECT_TERMS_TOOL: ToolDefinition = withRequiredReportId({
  ...INSPECT_SERVICE_MAP_TOOL,
  description:
    "Read the machine-generated Terms of Action for an audit report before proposing corrections. Returns the inferred operating role, every entity with its id and machine priority, the business terminology, and every action with its actionId, evidence, current readiness, and boundary. Use this first when a user wants to review or correct the machine's reading; the public remote plugin can then produce a confirmed correction plan but does not persist a human refinement.",
});

/**
 * The shared definition is also used by the in-page browser surface, where "open report" is
 * meaningful. The remote MCP always addresses reports explicitly by reportId, so keep the public
 * contract transport-accurate for directory reviewers and models.
 */
const REMOTE_FOUNDATION_AUDIT_TOOL: ToolDefinition = withRequiredReportId({
  ...EXPLAIN_FOUNDATION_AUDIT_TOOL,
  description:
    "Return the complete safe WordLift foundation audit for the report identified by reportId, including every normalized audit dimension, findings, quick wins, scores, provenance, and detailed data points.",
});

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
    definition: REMOTE_INSPECT_TERMS_TOOL,
    call: (service, args) => service.inspectTermsOfAction(args),
  },
  {
    definition: withRequiredReportId(EXPLAIN_CAPABILITY_TOOL),
    call: (service, args) => service.explainCapability(args),
  },
  {
    definition: REMOTE_FOUNDATION_AUDIT_TOOL,
    call: (service, args) => service.explainFoundationAudit(args),
  },
];

export function remoteTool(name: string): RemoteTool | undefined {
  return REMOTE_TOOLS.find((tool) => tool.definition.name === name);
}

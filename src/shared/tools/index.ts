/**
 * One import for anything that publishes or answers a tool call: the contracts themselves, the
 * transport variants, and the agent-facing result shapes. The result builders stay next to the
 * summaries they compose in `../format/agentSummary.js`; only their types are re-exported here.
 */
export * from "./definitions.js";
export * from "./transports.js";
export type {
  AuditRunningResult,
  AuditToolResult,
  CapabilityToolResult,
  InspectServiceMapResult,
  StageCount,
} from "../format/agentSummary.js";

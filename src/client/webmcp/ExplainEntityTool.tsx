import { useWebMCP } from "use-webmcp-tool";
import { entityDetail, entityDetailText, findEntity, type EntityDetailResult } from "../../shared/format/businessModel.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { reportPageUrl } from "../api/client";
import { resolveOpenReport } from "./reportToolScope";
import { EXPLAIN_ENTITY_TOOL } from "./toolSchemas";

interface ExplainEntityArgs {
  reportId?: unknown;
  entityId?: unknown;
  name?: unknown;
}

/** One entity in full, by id or by the name a person would use, with its provenance and its evidence. */
export function ExplainEntityTool({ reportId, report }: { reportId: string; report: ReportRecord | null }) {
  useWebMCP<ExplainEntityArgs, EntityDetailResult>({
    name: EXPLAIN_ENTITY_TOOL.name,
    description: EXPLAIN_ENTITY_TOOL.description,
    inputSchema: EXPLAIN_ENTITY_TOOL.inputSchema,
    annotations: EXPLAIN_ENTITY_TOOL.annotations,
    enabled: Boolean(reportId),
    execute: async (args) => {
      const current = await resolveOpenReport(reportId, report, args?.reportId);
      const lookup = { ...(typeof args?.entityId === "string" ? { entityId: args.entityId } : {}), ...(typeof args?.name === "string" ? { name: args.name } : {}) };
      if (!lookup.entityId && !lookup.name) throw new Error("Say which entity: an entityId from inspect-business-model, or a name.");
      const entity = findEntity(current, lookup);
      if (!entity) {
        const known = (current.contextGraph?.entities ?? []).slice(0, 20).map((candidate) => candidate.name).join(", ");
        throw new Error(`No entity named that in this report. Known entities: ${known}.`);
      }
      return entityDetail(entity, current, reportPageUrl(current.id));
    },
    formatOutput: (result) => ({ content: [{ type: "text" as const, text: entityDetailText(result) }], structuredContent: result }),
  });
  return null;
}

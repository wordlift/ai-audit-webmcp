import { Router, type RequestHandler } from "express";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";
import type { VisitLedger } from "../services/VisitLedger.js";
import {
  AlpinaSidecarError,
  resolveSidecarEntity,
  sidecarInvocationEvidence,
  type AlpinaAvailabilitySidecar,
} from "../sidecars/alpina/adapter.js";

/** The site this sidecar serves and the capability it activates: the ledger's keys. */
const SIDECAR_SITE = "alpina.travel";
const SIDECAR_TOOL = "check-availability";
/** Who called: a person on the page, an agent in the page, a program, the audit verifying. */
const SURFACES = new Set(["web", "webmcp", "api", "mcp", "audit"]);

export function createAlpinaRouter(
  sidecar: AlpinaAvailabilitySidecar,
  orchestrator: AuditOrchestrator,
  limiters: RequestHandler[] = [],
  visits?: VisitLedger,
): Router {
  const router = Router();

  router.post("/availability", ...limiters, async (request, response) => {
    // The surface is attribution for the ledger, never input to the sidecar.
    const { surface: claimedSurface, ...input } = (request.body ?? {}) as Record<string, unknown>;
    const surface = typeof claimedSurface === "string" && SURFACES.has(claimedSurface) ? claimedSurface : "api";
    const activated = (outcome: "ok" | "failed", reason?: string) => visits?.recordActivation(SIDECAR_SITE, SIDECAR_TOOL, surface, outcome, reason);
    try {
      const result = await sidecar.check(input);
      activated("ok");
      const reportId = typeof request.body?.reportId === "string" ? request.body.reportId : null;

      // The answer is grounded in the report's own entities: the entity the agent's intent
      // resolved to travels with the result, with its source and collection time.
      const report = reportId ? await orchestrator.get(reportId).catch(() => null) : null;
      const entity = report
        ? resolveSidecarEntity(
            report.contextGraph?.entities ?? [],
            result.propertyId,
            report.classification?.collectedAt ?? report.createdAt,
          )
        : null;
      const grounded = entity ? { ...result, entity } : result;

      if (!reportId) {
        response.json(grounded);
        return;
      }

      // A successful call is real evidence, so it becomes an immutable child revision. A report
      // that cannot be updated must not hide the availability answer the agent already has.
      try {
        const child = await orchestrator.attachInvocationEvidence(reportId, [sidecarInvocationEvidence(result)]);
        response.json({ ...grounded, updatedReportId: child.id, updatedReportUrl: `/reports/${child.id}` });
      } catch (error) {
        response.json({
          ...grounded,
          reportUpdateError: error instanceof Error ? error.message : "The report could not be updated.",
        });
      }
    } catch (error) {
      activated("failed", error instanceof AlpinaSidecarError ? error.code : "sidecar_error");
      if (error instanceof AlpinaSidecarError) {
        response.status(error.status).json({ error: error.code, message: error.message });
        return;
      }
      response.status(500).json({ error: "sidecar_error", message: "The availability lookup could not be completed." });
    }
  });

  return router;
}

import { Router, type RequestHandler } from "express";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";
import { AlpinaSidecarError, sidecarInvocationEvidence, type AlpinaAvailabilitySidecar } from "../sidecars/alpina/adapter.js";

export function createAlpinaRouter(
  sidecar: AlpinaAvailabilitySidecar,
  orchestrator: AuditOrchestrator,
  limiters: RequestHandler[] = [],
): Router {
  const router = Router();

  router.post("/availability", ...limiters, async (request, response) => {
    try {
      const result = await sidecar.check(request.body);
      const reportId = typeof request.body?.reportId === "string" ? request.body.reportId : null;

      if (!reportId) {
        response.json(result);
        return;
      }

      // A successful call is real evidence, so it becomes an immutable child revision. A report
      // that cannot be updated must not hide the availability answer the agent already has.
      try {
        const child = await orchestrator.attachInvocationEvidence(reportId, [sidecarInvocationEvidence(result)]);
        response.json({ ...result, updatedReportId: child.id, updatedReportUrl: `/reports/${child.id}` });
      } catch (error) {
        response.json({
          ...result,
          reportUpdateError: error instanceof Error ? error.message : "The report could not be updated.",
        });
      }
    } catch (error) {
      if (error instanceof AlpinaSidecarError) {
        response.status(error.status).json({ error: error.code, message: error.message });
        return;
      }
      response.status(500).json({ error: "sidecar_error", message: "The availability lookup could not be completed." });
    }
  });

  return router;
}

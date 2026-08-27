import { Router, type Response } from "express";
import { ZodError } from "zod";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";

export function createReportsRouter(orchestrator: AuditOrchestrator): Router {
  const router = Router();

  router.post("/", async (request, response) => {
    try {
      const report = await orchestrator.create(request.body);
      if (report.status === "running") {
        response.status(202).json({ reportId: report.id, phase: report.phase, retryUrl: `/api/reports/${report.id}` });
        return;
      }
      response.status(200).json(report);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/:reportId", async (request, response) => {
    const report = await orchestrator.get(request.params.reportId);
    if (!report) {
      response.status(404).json({ error: "report_not_found", message: "Report not found or expired" });
      return;
    }
    response.json(report);
  });

  router.post("/:reportId/recompile", async (request, response) => {
    try {
      response.json(await orchestrator.recompile(request.params.reportId, request.body));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/:reportId/reverify", async (request, response) => {
    try {
      response.json(await orchestrator.reverify(request.params.reportId));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/:reportId/contracts/:actionId", async (request, response) => {
    try {
      const contract = await orchestrator.contract(request.params.reportId, request.params.actionId);
      if (!contract) {
        response.status(404).json({ error: "contract_not_found", message: "No contract exists for this action" });
        return;
      }
      response.type("application/ld+json").send(JSON.stringify(contract, null, 2));
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

function sendError(response: Response, error: unknown) {
  if (error instanceof ZodError) {
    response.status(400).json({ error: "invalid_request", message: "The request is invalid", issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected report error";
  const status = /not found|expired/i.test(message) ? 404 : /fixture|URL/i.test(message) ? 400 : 500;
  response.status(status).json({ error: status === 404 ? "report_not_found" : "report_error", message });
}

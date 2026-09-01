import { Router, type RequestHandler, type Response } from "express";
import { ZodError } from "zod";
import { UnknownFixtureError } from "../adapters/fixtures/FixtureProvider.js";
import { ReportRequestError } from "../errors.js";
import { UrlPolicyError } from "../security/urlPolicy.js";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";

export function createReportsRouter(orchestrator: AuditOrchestrator, auditLimiters: RequestHandler[] = []): Router {
  const router = Router();

  router.post("/", ...auditLimiters, async (request, response) => {
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

  router.post("/:reportId/refine", async (request, response) => {
    try {
      response.json(await orchestrator.refine(request.params.reportId, request.body));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/:reportId/reverify", ...auditLimiters, async (request, response) => {
    try {
      response.json(await orchestrator.reverify(param(request.params.reportId)));
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

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Typed failures reach the caller with their own code and status; anything unexpected is reported
 * as a generic error so provider internals and target content never leak into a response.
 */
export function sendError(response: Response, error: unknown) {
  if (error instanceof ReportRequestError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof UrlPolicyError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof UnknownFixtureError) {
    response.status(400).json({ error: "fixture_not_registered", message: error.message });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({ error: "invalid_request", message: "The request is invalid", issues: error.issues });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected report error";
  if (/not found|expired/i.test(message)) {
    response.status(404).json({ error: "report_not_found", message });
    return;
  }
  console.error("report_error", error instanceof Error ? error.name : "unknown");
  response.status(500).json({ error: "report_error", message: "The audit could not be completed." });
}

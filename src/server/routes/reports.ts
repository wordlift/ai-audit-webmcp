import { Router, type RequestHandler, type Response } from "express";
import { z, ZodError } from "zod";
import { createReportRequestSchema } from "../../shared/schemas/report.js";
import { UnknownFixtureError } from "../adapters/fixtures/FixtureProvider.js";
import { ReportRequestError } from "../errors.js";
import { UrlPolicyError } from "../security/urlPolicy.js";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";
import type { DeepScanDelivery } from "../services/DeepScanDelivery.js";
import type { VisitLedger } from "../services/VisitLedger.js";
import { DeepScanGate } from "../services/DeepScanGate.js";
import { ToolCallError } from "../services/toolErrors.js";

/**
 * The address a deep scan is sent to arrives with the request and stops here: it is handed to the
 * gate, which files it beside the report, and never travels on to the orchestrator that builds the
 * public document.
 */
const createReportBodySchema = createReportRequestSchema.extend({
  email: z.string().max(254).optional(),
  /**
   * Which surface asked. The page's own form and an agent driving that page both arrive here over
   * the same API, so without this they would be one number. A browser could of course claim either;
   * this is attribution, not authorization, and "mcp" is not offered because the MCP transport
   * makes its own claim on its own endpoint.
   */
  surface: z.enum(["web", "webmcp"]).optional(),
});

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function createReportsRouter(
  orchestrator: AuditOrchestrator,
  auditLimiters: RequestHandler[] = [],
  deepScan: DeepScanGate = new DeepScanGate(null),
  writeLimiters: RequestHandler[] = [],
  delivery?: DeepScanDelivery,
  visits?: VisitLedger,
): Router {
  const router = Router();

  router.post("/", ...auditLimiters, async (request, response) => {
    try {
      const { email, surface, ...audit } = createReportBodySchema.parse(request.body);
      await deepScan.authorize({
        reportId: audit.requestId,
        reportUrl: orchestrator.reportUrl(audit.requestId),
        depth: audit.depth,
        email,
        source: surface ?? "web",
      });
      const report = await orchestrator.create(audit);
      if (audit.depth === "deep" && report.status !== "running") delivery?.settle(report.id);
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

  router.post("/:reportId/recompile", ...writeLimiters, async (request, response) => {
    try {
      response.json(await orchestrator.recompile(param(request.params.reportId), request.body));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/:reportId/refine", ...writeLimiters, async (request, response) => {
    try {
      response.json(await orchestrator.refine(param(request.params.reportId), request.body));
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

  // Who read this report, by class and by day, and which agents activated a capability on its
  // site. Counts only, and reading them is never rate limited and never counted as a visit.
  router.get("/:reportId/visits", async (request, response) => {
    const report = await orchestrator.get(request.params.reportId);
    if (!report) {
      response.status(404).json({ error: "report_not_found", message: "Report not found or expired" });
      return;
    }
    // The readiness readings travel with the ledger: one read for everything Observe shows.
    const history = await orchestrator.history(report);
    if (!visits) {
      response.json({ reportId: report.id, since: report.createdAt, days: [], activations: [], history });
      return;
    }
    const site = hostOf(report.canonicalUrl ?? report.requestedUrl);
    const [days, activations] = await Promise.all([visits.visits(report.id), visits.activations(site)]);
    response.json({
      reportId: report.id,
      since: report.createdAt,
      days: days.map((row) => ({ day: row.day, counts: row.counts })),
      activations,
      history,
    });
  });

  // Activate: what this report publishes, as one model and as the three documents a site serves.
  // The plugin reads the model; a person, a crawler, or the audit itself reads the documents.
  router.get("/:reportId/publish", async (request, response) => {
    try {
      response.json(await orchestrator.publish(param(request.params.reportId)));
    } catch (error) {
      sendError(response, error);
    }
  });
  router.get("/:reportId/publish/page.jsonld", async (request, response) => {
    try {
      const publication = await orchestrator.publish(param(request.params.reportId));
      response.type("application/ld+json").send(JSON.stringify(publication.jsonLd, null, 2));
    } catch (error) {
      sendError(response, error);
    }
  });
  router.get("/:reportId/publish/skill.md", async (request, response) => {
    try {
      const publication = await orchestrator.publish(param(request.params.reportId));
      response.type("text/markdown; charset=utf-8").send(publication.skill);
    } catch (error) {
      sendError(response, error);
    }
  });
  router.get("/:reportId/publish/ai-catalog.json", async (request, response) => {
    try {
      const publication = await orchestrator.publish(param(request.params.reportId));
      response.type("application/json").send(JSON.stringify(publication.catalog, null, 2));
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
  if (error instanceof ToolCallError) {
    response.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
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

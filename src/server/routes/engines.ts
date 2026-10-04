import { Router, type Request, type RequestHandler } from "express";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";
import type { ContextEngines } from "../services/ContextEngines.js";
import { sendError } from "./reports.js";
import { funnel } from "../services/funnel.js";

/** The header a claimant's key travels in: never a query string, which ends up in logs and referrers. */
export const ENGINE_KEY_HEADER = "x-context-engine-key";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function engineKey(request: Request): string | undefined {
  const value = request.get(ENGINE_KEY_HEADER);
  return value && value.length <= 200 ? value : undefined;
}

/**
 * The Context Engine of a report's site: read it, claim it, prove the site is yours, and hand a
 * review to another browser. Reading is public and carries no secret; everything else is a write.
 */
export function createEnginesRouter(orchestrator: AuditOrchestrator, engines: ContextEngines, writeLimiters: RequestHandler[] = []): Router {
  const router = Router();

  const reportFor = async (reportId: string) => {
    const report = await orchestrator.get(reportId);
    if (!report) throw Object.assign(new Error("Report not found or expired"), { status: 404 });
    return report;
  };

  router.get("/for-report/:reportId", async (request, response) => {
    try {
      const report = await reportFor(one(request.params.reportId));
      const view = await engines.view(report);
      if (!view) {
        response.status(404).json({ error: "engine_not_found", message: "No Context Engine exists for this site yet." });
        return;
      }
      // Whether the caller's own key holds this engine, so the page can offer what a holder may do.
      const engine = await engines.forReport(report);
      const standing = engine ? engines.standing(engine, engineKey(request)) : null;
      response.json({ ...view, standing: standing === null ? "none" : standing === "pending" ? "pending" : standing.role });
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/for-report/:reportId/claim", ...writeLimiters, async (request, response) => {
    try {
      const report = await reportFor(one(request.params.reportId));
      if (report.status !== "completed" && report.status !== "partial") {
        response.status(409).json({ error: "report_not_ready", message: "Claim the Context Engine once the audit has finished." });
        return;
      }
      const claim = await engines.claim(report);
      funnel("engine_claimed", report.id, { standing: claim.standing });
      response.json(claim);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get("/:host/verification", async (request, response) => {
    try {
      response.json(await engines.verification(one(request.params.host), engineKey(request)));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/:host/verify", ...writeLimiters, async (request, response) => {
    try {
      const verified = await engines.verify(one(request.params.host), engineKey(request));
      funnel("owner_verified", verified.latestReportId ?? "", { host: verified.host });
      response.json(verified);
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post("/:host/review-token", ...writeLimiters, async (request, response) => {
    try {
      response.json(await engines.reviewToken(one(request.params.host), engineKey(request)));
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}

import express, { type Express, type RequestHandler } from "express";
import path from "node:path";
import { createAgentSurfaceRouter } from "./routes/agentSurface.js";
import { createAlpinaRouter } from "./routes/alpina.js";
import { createMcpRouter } from "./routes/mcp.js";
import { createReportsRouter } from "./routes/reports.js";
import {
  createAuditRateLimiters,
  createMcpRateLimiters,
  onlyForExpensiveToolCalls,
  type RateLimitOptions,
} from "./security/rateLimits.js";
import type { ClaimStore } from "./adapters/claims/index.js";
import type { LeadStore } from "./adapters/leads/index.js";
import type { AuditOrchestrator } from "./services/AuditOrchestrator.js";
import { AuditToolService, type AuditToolServiceOptions } from "./services/AuditToolService.js";
import { DeepScanGate } from "./services/DeepScanGate.js";
import { AlpinaAvailabilitySidecar } from "./sidecars/alpina/adapter.js";

export interface AppOptions {
  staticDirectory?: string;
  orchestrator?: AuditOrchestrator;
  rateLimits?: RateLimitOptions;
  /** A separate, looser pool for the sidecar; inherits window and enablement from `rateLimits`. */
  sidecarRateLimits?: RateLimitOptions;
  trustProxy?: boolean;
  /** Domain-verification token the app directory looks for; absent means the path is not served. */
  appsChallenge?: string;
  alpinaSidecar?: AlpinaAvailabilitySidecar;
  /** A conversation-sized pool for /mcp; the audit budget above still guards what an audit costs. */
  mcpRateLimits?: RateLimitOptions;
  /** The pool for recompiling and refining: writes that create a child report without a crawl. */
  writeRateLimits?: RateLimitOptions;
  toolService?: AuditToolServiceOptions;
  /** Where a deep scan's email address is filed. Absent means deep scans are unavailable here. */
  leads?: LeadStore;
  /** Where remote report claims are filed. Absent means remote refinement is unclaimed. */
  claims?: ClaimStore;
  reportTtlDays?: number;
}

/**
 * The WebMCP `tools` policy-controlled feature already defaults to `'self'`; stating it keeps the
 * grant explicit without widening it to embedded third-party frames. The CSP allows only
 * same-origin code, so an audited site's content can never execute here.
 */
const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "permissions-policy": "tools=(self), camera=(), microphone=(), geolocation=(), payment=()",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.disable("x-powered-by");
  if (options.trustProxy) app.set("trust proxy", 1);

  app.use((_request, response, next) => {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(header, value);
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  // Proof to the app directory that this domain is ours to publish from. Static, public, and
  // served before anything that could mistake it for a page.
  if (options.appsChallenge) {
    app.get("/.well-known/openai-apps-challenge", (_request, response) => {
      response.type("text/plain").send(options.appsChallenge);
    });
  }

  app.get("/api/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "ai-audit-webmcp",
      revision: process.env.K_REVISION ?? "local",
      release: process.env.BUILD_SHA ?? "development",
      mode: options.orchestrator?.mode ?? "demo",
      // What a monitor needs to know is which surfaces this revision actually answers on.
      surfaces: {
        mcp: options.orchestrator ? "/mcp" : null,
        deepScans: Boolean(options.leads),
        claimedRefinement: Boolean(options.claims),
      },
    });
  });

  if (options.orchestrator) {
    const limiters: RequestHandler[] = createAuditRateLimiters(options.rateLimits);
    const deepScan = new DeepScanGate(options.leads ?? null, options.reportTtlDays);
    app.get("/api/demo/alpina", async (_request, response) => response.json(await options.orchestrator?.pinnedAlpina()));
    // Every child report is a stored document someone else can be shown, so the writes that make
    // one draw on a pool of their own rather than on nothing at all.
    const writeLimiters: RequestHandler[] = createAuditRateLimiters(
      options.writeRateLimits ?? { ...options.rateLimits, perIp: 40, global: 800 },
    );
    app.use("/api/reports", createReportsRouter(options.orchestrator, limiters, deepScan, writeLimiters));
    // The sidecar draws on its own pool: one agent conversation checks several date ranges, and
    // none of those calls should spend the audit budget.
    const sidecarLimiters: RequestHandler[] = createAuditRateLimiters(
      options.sidecarRateLimits ?? { ...options.rateLimits, perIp: 30, global: 600 },
    );
    app.use(
      "/api/sidecars/alpina",
      createAlpinaRouter(options.alpinaSidecar ?? new AlpinaAvailabilitySidecar(), options.orchestrator, sidecarLimiters),
    );

    // The remote transport answers before the static handler and the SPA fallback, which would
    // otherwise hand a JSON-RPC caller the application shell.
    app.use(
      "/mcp",
      createMcpRouter(
        new AuditToolService(
          options.orchestrator,
          { source: "mcp", claims: options.claims, claimTtlDays: options.reportTtlDays, ...options.toolService },
          deepScan,
        ),
        [
          // Only the window and the enabled flag carry over: a tight per-IP audit budget must not
          // become the budget for listing tools or reading a report.
          ...createMcpRateLimiters(
            options.mcpRateLimits ?? { windowMs: options.rateLimits?.windowMs, enabled: options.rateLimits?.enabled },
          ),
          onlyForExpensiveToolCalls(limiters),
        ],
      ),
    );
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "not_found", message: "Unknown API endpoint" });
  });

  // Discovery documents and the prerendered report shell answer before the SPA fallback, so a
  // reader that does not run scripts gets the report rather than an empty shell.
  app.use(createAgentSurfaceRouter({ orchestrator: options.orchestrator, staticDirectory: options.staticDirectory }));

  if (options.staticDirectory) {
    app.use(express.static(options.staticDirectory));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(options.staticDirectory as string, "index.html"));
    });
  }

  return app;
}

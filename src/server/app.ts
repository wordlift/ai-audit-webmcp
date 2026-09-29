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
import type { LeadDelivery, LeadStore } from "./adapters/leads/index.js";
import type { AuditOrchestrator } from "./services/AuditOrchestrator.js";
import type { PlatformEgress } from "./security/platformEgress.js";
import { AuditToolService, type AuditToolServiceOptions } from "./services/AuditToolService.js";
import { DeepScanDelivery } from "./services/DeepScanDelivery.js";
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
  /**
   * Which hosted assistant an address belongs to. Its users share a pool per platform instead of
   * one address's budget; absent, every address is limited as itself.
   */
  platformEgress?: PlatformEgress;
  toolService?: AuditToolServiceOptions;
  /** Where a deep scan's email address is filed. Absent means deep scans are unavailable here. */
  leads?: LeadStore;
  /** Legacy claim storage used by non-public service harnesses; never exposed through public MCP. */
  claims?: ClaimStore;
  /** How a deep scan's report reaches the address that bought it. Absent means it queues only. */
  leadDelivery?: LeadDelivery;
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

  app.get("/.well-known/openai-apps-challenge", (_request, response) => {
    if (!options.appsChallenge) {
      response.status(404).type("text/plain").send("No app directory verification token is configured.");
      return;
    }
    response.type("text/plain").send(options.appsChallenge);
  });

  app.get("/api/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "ai-audit-webmcp",
      revision: process.env.K_REVISION ?? "local",
      release: process.env.BUILD_SHA ?? "development",
      mode: options.orchestrator?.mode ?? "demo",
      surfaces: {
        mcp: options.orchestrator ? "/mcp" : null,
        deepScans: Boolean(options.leads),
        reportDelivery: options.leadDelivery?.name ?? null,
        claimedRefinement: Boolean(options.claims),
      },
      platformEgress: options.platformEgress?.summary() ?? null,
    });
  });

  if (options.orchestrator) {
    const limiters: RequestHandler[] = createAuditRateLimiters(options.rateLimits, options.platformEgress);
    const deepScan = new DeepScanGate(options.leads ?? null, options.reportTtlDays);
    const delivery = new DeepScanDelivery({
      leads: options.leads,
      delivery: options.leadDelivery,
      publicReportUrl: (reportId) => (options.orchestrator as AuditOrchestrator).reportUrl(reportId),
      loadReport: (reportId) => (options.orchestrator as AuditOrchestrator).get(reportId),
    });
    app.get("/api/demo/alpina", async (_request, response) => response.json(await options.orchestrator?.pinnedAlpina()));
    const writeLimiters: RequestHandler[] = createAuditRateLimiters(
      options.writeRateLimits ?? { ...options.rateLimits, perIp: 40, global: 800 },
    );
    app.use(
      "/api/reports",
      createReportsRouter(options.orchestrator, limiters, deepScan, writeLimiters, delivery),
    );
    const sidecarLimiters: RequestHandler[] = createAuditRateLimiters(
      options.sidecarRateLimits ?? { ...options.rateLimits, perIp: 30, global: 600 },
    );
    app.use(
      "/api/sidecars/alpina",
      createAlpinaRouter(options.alpinaSidecar ?? new AlpinaAvailabilitySidecar(), options.orchestrator, sidecarLimiters),
    );

    // The public remote transport is intentionally anonymous and review-only after audit. Do not
    // attach a ClaimStore here: audit-website must never emit a bearer authorization value into
    // model-visible MCP content or structuredContent.
    app.use(
      "/mcp",
      createMcpRouter(
        new AuditToolService(
          options.orchestrator,
          {
            ...options.toolService,
            source: "mcp",
            claims: undefined,
            claimTtlDays: options.reportTtlDays,
          },
          deepScan,
          delivery,
        ),
        [
          ...createMcpRateLimiters(
            options.mcpRateLimits ?? { windowMs: options.rateLimits?.windowMs, enabled: options.rateLimits?.enabled },
            options.platformEgress,
          ),
          onlyForExpensiveToolCalls(limiters),
        ],
      ),
    );
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "not_found", message: "Unknown API endpoint" });
  });

  app.use(createAgentSurfaceRouter({ orchestrator: options.orchestrator, staticDirectory: options.staticDirectory }));

  if (options.staticDirectory) {
    app.use(express.static(options.staticDirectory));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(options.staticDirectory as string, "index.html"));
    });
  }

  return app;
}

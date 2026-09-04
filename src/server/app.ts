import express, { type Express, type RequestHandler } from "express";
import path from "node:path";
import { createAgentSurfaceRouter } from "./routes/agentSurface.js";
import { createAlpinaRouter } from "./routes/alpina.js";
import { createReportsRouter } from "./routes/reports.js";
import { createAuditRateLimiters, type RateLimitOptions } from "./security/rateLimits.js";
import type { AuditOrchestrator } from "./services/AuditOrchestrator.js";
import { AlpinaAvailabilitySidecar } from "./sidecars/alpina/adapter.js";

export interface AppOptions {
  staticDirectory?: string;
  orchestrator?: AuditOrchestrator;
  rateLimits?: RateLimitOptions;
  /** A separate, looser pool for the sidecar; inherits window and enablement from `rateLimits`. */
  sidecarRateLimits?: RateLimitOptions;
  trustProxy?: boolean;
  alpinaSidecar?: AlpinaAvailabilitySidecar;
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

  app.get("/api/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      service: "ai-audit-webmcp",
      revision: process.env.K_REVISION ?? "local",
      release: process.env.BUILD_SHA ?? "development",
      mode: options.orchestrator?.mode ?? "demo",
    });
  });

  if (options.orchestrator) {
    const limiters: RequestHandler[] = createAuditRateLimiters(options.rateLimits);
    app.get("/api/demo/alpina", async (_request, response) => response.json(await options.orchestrator?.pinnedAlpina()));
    app.use("/api/reports", createReportsRouter(options.orchestrator, limiters));
    // The sidecar draws on its own pool: one agent conversation checks several date ranges, and
    // none of those calls should spend the audit budget.
    const sidecarLimiters: RequestHandler[] = createAuditRateLimiters(
      options.sidecarRateLimits ?? { ...options.rateLimits, perIp: 30, global: 600 },
    );
    app.use(
      "/api/sidecars/alpina",
      createAlpinaRouter(options.alpinaSidecar ?? new AlpinaAvailabilitySidecar(), options.orchestrator, sidecarLimiters),
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

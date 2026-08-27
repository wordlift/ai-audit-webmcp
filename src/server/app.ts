import express, { type Express, type RequestHandler } from "express";
import path from "node:path";
import { createReportsRouter } from "./routes/reports.js";
import { createAuditRateLimiters, type RateLimitOptions } from "./security/rateLimits.js";
import type { AuditOrchestrator } from "./services/AuditOrchestrator.js";

export interface AppOptions {
  staticDirectory?: string;
  orchestrator?: AuditOrchestrator;
  rateLimits?: RateLimitOptions;
  trustProxy?: boolean;
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
    response.status(200).json({ status: "ok", service: "ai-audit-webmcp" });
  });

  if (options.orchestrator) {
    const limiters: RequestHandler[] = createAuditRateLimiters(options.rateLimits);
    app.use("/api/reports", createReportsRouter(options.orchestrator, limiters));
  }

  app.use("/api", (_request, response) => {
    response.status(404).json({ error: "not_found", message: "Unknown API endpoint" });
  });

  if (options.staticDirectory) {
    app.use(express.static(options.staticDirectory));
    app.get("*", (_request, response) => {
      response.sendFile(path.join(options.staticDirectory as string, "index.html"));
    });
  }

  return app;
}

import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";

export interface RateLimitOptions {
  windowMs?: number;
  perIp?: number;
  global?: number;
  enabled?: boolean;
}

const DEFAULTS = { windowMs: 10 * 60 * 1_000, perIp: 12, global: 240 };

function limitResponse(message: string) {
  return { error: "rate_limited", message };
}

/**
 * Two limits guard the expensive audit path: one per caller, and one for the whole service so a
 * distributed burst cannot exhaust the downstream provider budget.
 */
export function createAuditRateLimiters(options: RateLimitOptions = {}): RateLimitRequestHandler[] {
  if (options.enabled === false) return [];
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;

  const perIp = rateLimit({
    windowMs,
    limit: options.perIp ?? DEFAULTS.perIp,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: limitResponse("Too many audits from this address. Try again in a few minutes."),
  });

  const global = rateLimit({
    windowMs,
    limit: options.global ?? DEFAULTS.global,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: () => "global",
    message: limitResponse("The audit service is at capacity. Try again in a few minutes."),
  });

  return [perIp, global];
}

const MCP_DEFAULTS = { perIp: 90, global: 1_800 };

/**
 * The remote transport carries discovery and reads as well as audits, and a caller that cannot
 * call `tools/list` cannot use the server at all. This pool is sized for conversation; the audit
 * budget below is what actually guards the expensive path.
 */
export function createMcpRateLimiters(options: RateLimitOptions = {}): RequestHandler[] {
  if (options.enabled === false) return [];
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;

  const perIp = rateLimit({
    windowMs,
    limit: options.perIp ?? MCP_DEFAULTS.perIp,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: limitResponse("Too many MCP calls from this address. Try again in a few minutes."),
  });

  const global = rateLimit({
    windowMs,
    limit: options.global ?? MCP_DEFAULTS.global,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: () => "global",
    message: limitResponse("The MCP endpoint is at capacity. Try again in a few minutes."),
  });

  return [perIp, global];
}

/** The MCP calls that cost a collection or create a report; everything else is a read. */
const EXPENSIVE_TOOLS = new Set(["audit-website", "refine-terms-of-action"]);

/**
 * Spends the audit budget only on the JSON-RPC calls that create something. A caller listing tools
 * or reading a stored report is not spending anyone's crawl, and must not be turned away because
 * an audit did.
 */
interface JsonRpcCall {
  method?: unknown;
  params?: { name?: unknown };
}

/** True for a single call or for a batch containing one: a batch must not be a way in. */
function callsSomethingExpensive(body: unknown): boolean {
  const calls: JsonRpcCall[] = Array.isArray(body) ? (body as JsonRpcCall[]) : [body as JsonRpcCall];
  return calls.some((call) => {
    const name = call?.params?.name;
    return call?.method === "tools/call" && typeof name === "string" && EXPENSIVE_TOOLS.has(name);
  });
}

export function onlyForExpensiveToolCalls(limiters: RequestHandler[]): RequestHandler {
  return (request: Request, response: Response, next: NextFunction) => {
    const expensive = callsSomethingExpensive(request.body);
    if (!expensive || limiters.length === 0) {
      next();
      return;
    }

    let index = 0;
    const step = (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      const handler = limiters[index];
      index += 1;
      if (!handler) {
        next();
        return;
      }
      handler(request, response, step as NextFunction);
    };
    step();
  };
}

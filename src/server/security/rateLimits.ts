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

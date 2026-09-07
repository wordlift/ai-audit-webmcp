import type { NextFunction, Request, RequestHandler, Response } from "express";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { PlatformEgress } from "./platformEgress.js";

export interface RateLimitOptions {
  windowMs?: number;
  perIp?: number;
  global?: number;
  enabled?: boolean;
  /**
   * The budget one hosted assistant's whole user base shares. Everyone using the audit through
   * claude.ai or ChatGPT arrives from that platform's egress addresses, so a per-address budget
   * would be a budget for the platform; this is the one that is (see platformEgress.ts).
   */
  platform?: number;
}

const DEFAULTS = { windowMs: 10 * 60 * 1_000, perIp: 12, global: 240, platform: 120 };

/** How a pool is named to the person who hit it. A platform without a label is named as declared. */
const PLATFORM_LABELS: Record<string, string> = { anthropic: "Claude", openai: "ChatGPT" };

function limitResponse(message: string) {
  return { error: "rate_limited", message };
}

interface TierOptions {
  windowMs: number;
  perIp: number;
  platform: number;
  what: string;
  egress?: PlatformEgress;
}

/**
 * One limiter with two tiers. A request from a hosted assistant's published egress draws on a pool
 * keyed by the platform and sized for all of its users at once; any other request draws on the
 * budget of its own address. The ranges tier the limit and never gate access: an address nobody
 * published is a direct client — Claude Desktop, Claude Code, Codex, MCP Inspector — and is
 * simply itself.
 */
function tieredLimiter(options: TierOptions): RateLimitRequestHandler {
  const platformOf = (request: Request): string | null => options.egress?.platformOf(request.ip) ?? null;
  return rateLimit({
    windowMs: options.windowMs,
    limit: (request) => (platformOf(request) ? options.platform : options.perIp),
    keyGenerator: (request) => {
      const platform = platformOf(request);
      return platform ? `platform:${platform}` : `ip:${request.ip ?? request.socket.remoteAddress ?? "unknown"}`;
    },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: (request: Request) => {
      const platform = platformOf(request);
      return platform
        ? limitResponse(
            `${PLATFORM_LABELS[platform] ?? platform} has used the ${options.what} reserved for it for now. Try again in a few minutes.`,
          )
        : limitResponse(`Too many ${options.what} from this address. Try again in a few minutes.`);
    },
  });
}

function globalLimiter(windowMs: number, limit: number, message: string): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator: () => "global",
    message: limitResponse(message),
  });
}

/**
 * Two limits guard the expensive audit path: one per caller — an address, or a hosted platform's
 * pool — and one for the whole service so a distributed burst cannot exhaust the downstream
 * provider budget.
 */
export function createAuditRateLimiters(options: RateLimitOptions = {}, egress?: PlatformEgress): RateLimitRequestHandler[] {
  if (options.enabled === false) return [];
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  return [
    tieredLimiter({
      windowMs,
      perIp: options.perIp ?? DEFAULTS.perIp,
      platform: options.platform ?? DEFAULTS.platform,
      what: "audits",
      egress,
    }),
    globalLimiter(windowMs, options.global ?? DEFAULTS.global, "The audit service is at capacity. Try again in a few minutes."),
  ];
}

const MCP_DEFAULTS = { perIp: 90, global: 1_800, platform: 900 };

/**
 * The remote transport carries discovery and reads as well as audits, and a caller that cannot
 * call `tools/list` cannot use the server at all. This pool is sized for conversation; the audit
 * budget above is what actually guards the expensive path.
 */
export function createMcpRateLimiters(options: RateLimitOptions = {}, egress?: PlatformEgress): RequestHandler[] {
  if (options.enabled === false) return [];
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  return [
    tieredLimiter({
      windowMs,
      perIp: options.perIp ?? MCP_DEFAULTS.perIp,
      platform: options.platform ?? MCP_DEFAULTS.platform,
      what: "MCP calls",
      egress,
    }),
    globalLimiter(windowMs, options.global ?? MCP_DEFAULTS.global, "The MCP endpoint is at capacity. Try again in a few minutes."),
  ];
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

import { BlockList, isIP } from "node:net";

/**
 * Which hosted assistant a request comes from, judged by the address it arrives from.
 *
 * A person using the audit through claude.ai or ChatGPT never reaches this service from their own
 * machine: the assistant's servers call on their behalf, and every one of its users arrives from
 * the same published egress ranges. A limit keyed on that address is then a limit on the whole
 * platform — twelve audits per ten minutes across all of Claude's users would refuse the very
 * listing it was meant to protect. These ranges let the limiters give each platform a pool of its
 * own, and leave the per-address budget to callers that really are one address.
 *
 * The ranges tier limits; they never gate access. An address nobody published is a direct client
 * — Claude Desktop, Claude Code, Codex, MCP Inspector — and is limited as itself.
 */
export interface PlatformRange {
  platform: string;
  cidr: string;
}

/** Anthropic's published outbound range, which "will not change without notice". */
export const ANTHROPIC_EGRESS: readonly PlatformRange[] = [
  { platform: "anthropic", cidr: "160.79.104.0/21" },
  { platform: "anthropic", cidr: "2607:6bc0::/48" },
];

interface ParsedCidr {
  network: string;
  prefix: number;
  type: "ipv4" | "ipv6";
}

export function parseCidr(cidr: string): ParsedCidr | null {
  const [network = "", prefixText] = cidr.trim().split("/");
  const version = isIP(network);
  if (version === 0) return null;
  const max = version === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? max : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null;
  return { network, prefix, type: version === 4 ? "ipv4" : "ipv6" };
}

export class PlatformEgress {
  private readonly platforms = new Map<string, { list: BlockList; cidrs: string[] }>();

  constructor(ranges: Iterable<PlatformRange> = []) {
    const grouped = new Map<string, string[]>();
    for (const { platform, cidr } of ranges) {
      const cidrs = grouped.get(platform) ?? [];
      cidrs.push(cidr);
      grouped.set(platform, cidrs);
    }
    for (const [platform, cidrs] of grouped) this.replace(platform, cidrs);
  }

  /** The platform an address belongs to, or null for an address nobody published. */
  platformOf(address: string | undefined): string | null {
    if (!address) return null;
    const version = isIP(address);
    if (version === 0) return null;
    const type = version === 4 ? "ipv4" : "ipv6";
    for (const [platform, { list }] of this.platforms) {
      if (list.check(address, type)) return platform;
    }
    return null;
  }

  /**
   * Replaces one platform's ranges wholesale. Entries that do not parse are dropped; an empty
   * result removes the platform, so its addresses fall back to being direct clients rather than
   * matching nothing at all. Returns how many ranges were kept.
   */
  replace(platform: string, cidrs: readonly string[]): number {
    const list = new BlockList();
    const kept: string[] = [];
    for (const cidr of cidrs) {
      const parsed = parseCidr(cidr);
      if (!parsed) continue;
      list.addSubnet(parsed.network, parsed.prefix, parsed.type);
      kept.push(cidr.trim());
    }
    if (kept.length === 0) this.platforms.delete(platform);
    else this.platforms.set(platform, { list, cidrs: kept });
    return kept.length;
  }

  /** How many ranges each platform holds right now: what /api/health reports. */
  summary(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [platform, { cidrs }] of this.platforms) counts[platform] = cidrs.length;
    return counts;
  }
}

/** `anthropic=160.79.104.0/21,openai=203.0.113.0/24`: the shape `PLATFORM_EGRESS_RANGES` takes. */
export function parsePlatformRanges(text: string | undefined): PlatformRange[] {
  if (!text) return [];
  const ranges: PlatformRange[] = [];
  for (const entry of text.split(",")) {
    const [platform, cidr] = entry.split("=").map((part) => part.trim());
    if (!platform || !cidr || !/^[a-z0-9-]+$/.test(platform) || !parseCidr(cidr)) continue;
    ranges.push({ platform, cidr });
  }
  return ranges;
}

/** The shape OpenAI publishes: `{ creationTime, prefixes: [{ ipv4Prefix } | { ipv6Prefix }] }`. */
export function parseEgressDocument(document: unknown): string[] {
  const prefixes = (document as { prefixes?: unknown } | null)?.prefixes;
  if (!Array.isArray(prefixes)) return [];
  const cidrs: string[] = [];
  for (const entry of prefixes as Array<{ ipv4Prefix?: unknown; ipv6Prefix?: unknown } | null>) {
    const cidr = entry?.ipv4Prefix ?? entry?.ipv6Prefix;
    if (typeof cidr === "string" && parseCidr(cidr)) cidrs.push(cidr);
  }
  return cidrs;
}

export interface RefreshOptions {
  egress: PlatformEgress;
  platform: string;
  url: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (event: string, ...details: unknown[]) => void;
}

/**
 * Re-reads a published list and swaps it in. A failure of any kind — network, status, shape, or an
 * empty list — keeps the ranges already held: a stale range tiers a little worse, an empty one
 * would tier not at all. Resolves to whether the swap happened.
 */
export async function refreshPlatformEgress(options: RefreshOptions): Promise<boolean> {
  const fetchImpl = options.fetch ?? fetch;
  const log = options.log ?? (() => undefined);
  try {
    const response = await fetchImpl(options.url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      headers: { accept: "application/json", "user-agent": "ai-audit-webmcp (platform egress refresh)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document = JSON.parse(await response.text()) as { creationTime?: unknown };
    const cidrs = parseEgressDocument(document);
    if (cidrs.length === 0) throw new Error("no usable prefixes");
    const kept = options.egress.replace(options.platform, cidrs);
    log("platform_egress_refreshed", options.platform, kept, typeof document.creationTime === "string" ? document.creationTime : "undated");
    return true;
  } catch (error) {
    log("platform_egress_refresh_failed", options.platform, error instanceof Error ? error.message : "unknown");
    return false;
  }
}

/** Refreshes now and then on an interval that never keeps the process alive. Returns a stop function. */
export function startPlatformEgressRefresh(options: RefreshOptions & { intervalMs: number }): () => void {
  void refreshPlatformEgress(options);
  const timer = setInterval(() => void refreshPlatformEgress(options), options.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

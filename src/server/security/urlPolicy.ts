import { lookup } from "node:dns/promises";

export type UrlPolicyCode =
  | "invalid_url"
  | "unsupported_scheme"
  | "credentials_not_allowed"
  | "unsupported_port"
  | "private_network"
  | "dns_failure"
  | "too_many_redirects"
  | "response_too_large"
  | "collection_timeout"
  | "site_blocked";

/** A destination the server refuses to fetch, a bounded-collection failure, or a site that refused us. */
export class UrlPolicyError extends Error {
  constructor(
    readonly code: UrlPolicyCode,
    message: string,
    readonly status: 400 | 403 | 502 | 504 = 403,
  ) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa", ".onion"];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal", "instance-data"]);

export interface UrlPolicyOptions {
  /** Injected for tests; defaults to the system resolver. */
  resolve?: (hostname: string) => Promise<string[]>;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Response headers to surface in the result — the first hop that carries one wins. */
  captureHeaders?: string[];
}

const DEFAULTS = {
  maxRedirects: 3,
  maxBytes: 2_000_000,
  timeoutMs: 12_000,
  userAgent: "WordLiftAIAudit/0.1 (+https://wordlift.io; agent-capability-audit)",
};

/**
 * Parses caller input into an absolute public http(s) URL. Anything that could aim the server at
 * an internal service — a non-web scheme, embedded credentials, an odd port, or a private host —
 * is rejected here, before any provider sees the value.
 */
export function normalizeTargetUrl(input: string): URL {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (trimmed.length === 0 || trimmed.length > 2_048) {
    throw new UrlPolicyError("invalid_url", "Provide a public website URL.", 400);
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new UrlPolicyError("invalid_url", "That value is not a valid URL.", 400);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlPolicyError("unsupported_scheme", "Only http and https websites can be audited.", 400);
  }
  if (url.username || url.password) {
    throw new UrlPolicyError("credentials_not_allowed", "Remove credentials from the URL before auditing it.", 400);
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname.length === 0) {
    throw new UrlPolicyError("invalid_url", "That URL has no hostname.", 400);
  }
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new UrlPolicyError("private_network", "That destination is not a public website.");
  }

  const literal = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (isIpLiteral(literal) && !isPublicIpAddress(literal)) {
    throw new UrlPolicyError("private_network", "That destination is not a public website.");
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UrlPolicyError("unsupported_port", `Port ${url.port} is not audited. Use the site's public web port.`);
  }

  url.hash = "";
  return url;
}

export function isIpLiteral(host: string): boolean {
  return /^[0-9.]+$/.test(host) || host.includes(":");
}

/**
 * Blocks every IPv4/IPv6 range that is not globally routable, including the cloud metadata
 * address, plus IPv4-mapped and NAT64-embedded forms of the same ranges.
 */
export function isPublicIpAddress(address: string): boolean {
  const value = address.trim().toLowerCase();
  if (value.length === 0) return false;

  if (value.includes(":")) {
    const groups = expandIpv6(value);
    if (!groups) return false;

    // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry a v4 address that must be
    // judged on its own merits, whatever textual form the URL parser normalized it into.
    const embedded = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    const isMapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b;
    if (isMapped || isNat64) return isPublicIpAddress(embedded);

    if (groups.every((group) => group === 0)) return false; // ::
    if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false; // ::1
    if ((groups[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((groups[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
    if ((groups[0] & 0xff00) === 0xff00) return false; // ff00::/8 multicast
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false; // documentation
    if (groups[0] === 0x2002) return false; // 6to4 can encapsulate a private v4 address
    return true;
  }

  const octets = value.split(".");
  if (octets.length !== 4) return false;
  const parts = octets.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (parts.some((part) => Number.isNaN(part) || part > 255)) return false;
  const [a, b] = parts as [number, number, number, number];

  if (a === 0 || a === 10 || a === 127) return false;
  if (a >= 224) return false; // multicast, reserved, broadcast
  if (a === 169 && b === 254) return false; // link local, includes 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0) return false; // 192.0.0.0/24 and 192.0.2.0/24
  if (a === 192 && b === 88) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51) return false;
  if (a === 203 && b === 0) return false;
  return true;
}

/** Expands a textual IPv6 address, including "::" compression and a trailing dotted quad. */
function expandIpv6(value: string): number[] | null {
  const [head, tail = ""] = value.split("%"); // drop any zone identifier
  void tail;
  let text = head;

  const dotted = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const octets = dotted[1].split(".").map(Number);
    if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, dotted.index)}${high}:${low}`;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part.length === 0 ? [] : part.split(":").map((group) => Number.parseInt(group, 16)));
  const left = parse(halves[0] ?? "");
  const right = halves.length === 2 ? parse(halves[1] ?? "") : [];

  const groups = halves.length === 2
    ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill(0), ...right]
    : left;

  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group) || group < 0 || group > 0xffff)) return null;
  return groups;
}

/** Resolves the host and fails closed when any resolved address is non-public. */
export async function assertPublicDestination(url: URL, options: UrlPolicyOptions = {}): Promise<string[]> {
  const host = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  if (isIpLiteral(host)) {
    if (!isPublicIpAddress(host)) throw new UrlPolicyError("private_network", "That destination is not a public website.");
    return [host];
  }

  const resolver = options.resolve ?? defaultResolve;
  let addresses: string[];
  try {
    addresses = await resolver(host);
  } catch {
    throw new UrlPolicyError("dns_failure", "That hostname could not be resolved.", 400);
  }

  if (addresses.length === 0) {
    throw new UrlPolicyError("dns_failure", "That hostname could not be resolved.", 400);
  }
  if (!addresses.every(isPublicIpAddress)) {
    throw new UrlPolicyError("private_network", "That destination is not a public website.");
  }
  return addresses;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((record) => record.address);
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
  /** The requested captureHeaders that any hop answered with. */
  headers: Record<string, string>;
}

/**
 * Fetches a public document with redirects revalidated one hop at a time and hard caps on
 * redirects, time, and bytes. Caller cookies and authorization are never forwarded.
 */
export async function safeFetch(target: string | URL, options: UrlPolicyOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
  const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;

  let current = target instanceof URL ? normalizeTargetUrl(target.toString()) : normalizeTargetUrl(target);
  const started = Date.now();
  const captured: Record<string, string> = {};

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertPublicDestination(current, options);
    const remaining = timeoutMs - (Date.now() - started);
    if (remaining <= 0) throw new UrlPolicyError("collection_timeout", "Collecting this page took too long.", 504);

    const response = await request(current, remaining, options);
    for (const name of options.captureHeaders ?? []) {
      const value = response.headers.get(name);
      if (value && !(name in captured)) captured[name] = value;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UrlPolicyError("dns_failure", "That site returned a redirect without a destination.", 502);
      }
      // Revalidate every hop: a public URL may redirect to an internal one.
      current = normalizeTargetUrl(new URL(location, current).toString());
      continue;
    }

    const { body, truncated } = await readBounded(response, maxBytes);
    return {
      finalUrl: current.toString(),
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      body,
      truncated,
      headers: captured,
    };
  }

  throw new UrlPolicyError("too_many_redirects", "That site redirected too many times.", 400);
}

/**
 * One retry covers the transient connect failure a first request to a dual-stack host can hit
 * before the resolver settles; a second failure is reported as unreachable.
 */
async function request(target: URL, timeoutMs: number, options: UrlPolicyOptions): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          // The audit reads a site's English edition where it negotiates language.
          "accept-language": "en-US,en;q=0.9",
          "user-agent": options.userAgent ?? DEFAULTS.userAgent,
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new UrlPolicyError("collection_timeout", "Collecting this page took too long.", 504);
      }
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new UrlPolicyError("dns_failure", `That site could not be reached: ${describe(lastError)}`, 502);
}

async function readBounded(response: Response, maxBytes: number): Promise<{ body: string; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { body: "", truncated: false };

  const decoder = new TextDecoder("utf-8");
  let received = 0;
  let text = "";
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    received += value.byteLength;
    if (received > maxBytes) {
      text += decoder.decode(value.slice(0, Math.max(0, value.byteLength - (received - maxBytes))));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    text += decoder.decode(value, { stream: true });
  }

  return { body: text, truncated };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? error.message;
  }
  return "unknown error";
}

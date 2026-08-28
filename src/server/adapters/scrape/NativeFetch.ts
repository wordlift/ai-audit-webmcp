import { parseHTML } from "linkedom";
import { safeFetch, UrlPolicyError, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import { probeMcpEndpoint } from "./mcpProbe.js";
import type {
  DiscoveryDocument,
  McpEndpointProbe,
  PageAgentTool,
  ScrapeProvider,
  SiteForm,
  SiteSnapshot,
} from "./ScrapeProvider.js";
import { collectDeclarativeTools, dedupePageTools, extractImperativeTools } from "./webmcpTools.js";

const MAX_LINKS = 150;
const MAX_FORMS = 20;
const MAX_TEXT = 20_000;
const MAX_SCRIPTS = 6;
const MAX_SCRIPT_BYTES = 400_000;
const MAX_MCP_ENDPOINTS = 3;

/**
 * Paths worth asking for. A WebMCP manifest is not part of the WebMCP spec, so its absence is never
 * held against a site — it is read as a convenience when a site chooses to publish one, while the
 * tools themselves are read from the page.
 */
const DISCOVERY_PATHS: Array<{ kind: DiscoveryDocument["kind"]; path: string }> = [
  { kind: "robots", path: "/robots.txt" },
  { kind: "llms", path: "/llms.txt" },
  { kind: "skill", path: "/skill.md" },
  { kind: "mcp", path: "/.well-known/mcp.json" },
  { kind: "openapi", path: "/openapi.json" },
  { kind: "agent-skills", path: "/.well-known/agent-skills/index.json" },
  { kind: "ucp", path: "/.well-known/ucp" },
  { kind: "webmcp-tools", path: "/.well-known/webmcp/tools.json" },
  { kind: "mcp-server-card", path: "/.well-known/mcp/server-card.json" },
  { kind: "agent-card", path: "/.well-known/agent-card.json" },
  { kind: "api-catalog", path: "/.well-known/api-catalog" },
];

/** Asked for once, to learn whether a 200 on this site means anything at all. */
const SOFT_NOT_FOUND_PROBE = "/.well-known/audit-soft-404-probe-do-not-implement";

/** A linked path that looks like an MCP transport rather than the `.well-known` descriptor. */
const MCP_ENDPOINT_PATTERN = /(^|\/)mcp(\/|$|-)/;

/** Fetches the main document. Swappable so a rendered-collection provider can supply the HTML. */
export type PageFetcher = (url: URL) => Promise<{ finalUrl: string; body: string; truncated: boolean }>;

/**
 * Collects a bounded public representation of a page and its agent-discovery documents using the
 * platform fetch, through the same URL policy that guards every outbound request.
 */
export class NativeFetchCollector implements ScrapeProvider {
  readonly name: string;

  constructor(
    private readonly options: UrlPolicyOptions = {},
    private readonly fetchPage?: PageFetcher,
    name = "native-fetch",
  ) {
    this.name = name;
  }

  async collect(url: URL): Promise<SiteSnapshot> {
    const page = this.fetchPage
      ? await this.fetchPage(url)
      : await safeFetch(url, { ...this.options, timeoutMs: this.options.timeoutMs ?? 15_000 });
    const { document } = parseHTML(page.body);
    const finalUrl = new URL(page.finalUrl);

    const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
    const canonicalUrl = resolve(canonicalHref, finalUrl) ?? finalUrl.toString();

    const links = [...document.querySelectorAll("a[href]")].slice(0, MAX_LINKS);
    const [{ discovery, softNotFound }, pageTools] = await Promise.all([
      this.collectDiscovery(finalUrl),
      this.collectPageTools(document, finalUrl),
    ]);
    // The server card names its own transports, so it has to be read before anything is probed.
    // A search term taken from the page, so a tool call never needs invented vocabulary.
    const seedQuery = text(document.querySelector("h1")) || text(document.querySelector("title")) || finalUrl.hostname;
    const mcpEndpoints = await this.probeMcpEndpoints(document, finalUrl, discovery, seedQuery.slice(0, 60));

    return {
      requestedUrl: url.toString(),
      canonicalUrl,
      title: text(document.querySelector("title")),
      description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.slice(0, 500) ?? "",
      text: readableText(document),
      headings: [...document.querySelectorAll("h1, h2, h3")].slice(0, 40).map((node) => text(node)).filter(Boolean),
      linkPaths: unique(links.map((node) => path(node.getAttribute("href"), finalUrl)).filter(Boolean)),
      linkLabels: unique(links.map((node) => text(node).toLowerCase()).filter(Boolean)).slice(0, 80),
      forms: collectForms(document, finalUrl),
      jsonLdTypes: collectJsonLdTypes(document),
      discovery,
      pageTools,
      mcpEndpoints,
      softNotFound,
      truncated: page.truncated,
    };
  }

  private async collectDiscovery(base: URL): Promise<{ discovery: DiscoveryDocument[]; softNotFound: boolean }> {
    const [results, softNotFound] = await Promise.all([
      Promise.allSettled(
        DISCOVERY_PATHS.map(async ({ kind, path: documentPath }) => {
          const target = new URL(documentPath, base.origin);
          const response = await safeFetch(target, { ...this.options, timeoutMs: 6_000, maxBytes: 250_000 });
          return {
            kind,
            url: target.toString(),
            status: documentStatus(kind, response.status, response.body),
            body: response.body,
          };
        }),
      ),
      this.detectSoftNotFound(base),
    ]);

    const discovery = results.map((result, index) => {
      const { kind, path: documentPath } = DISCOVERY_PATHS[index];
      // A missing or blocked discovery document is a finding, not a failure.
      if (result.status !== "fulfilled") {
        return { kind, url: new URL(documentPath, base.origin).toString(), status: "missing", found: false, declaredNames: [] } satisfies DiscoveryDocument;
      }

      // On a site that answers everything with its page, an HTML answer says nothing about this
      // path in particular. Calling that a broken declaration would invent a claim the site never made.
      const status = softNotFound && result.value.status === "invalid" ? "missing" : result.value.status;
      return {
        kind,
        url: result.value.url,
        status,
        found: status === "valid",
        declaredNames: status === "valid" ? declaredNames(kind, result.value.body) : [],
      } satisfies DiscoveryDocument;
    });

    return { discovery, softNotFound };
  }

  /** Asks for a path that cannot exist. A 200 with HTML means every other 200 here is suspect. */
  private async detectSoftNotFound(base: URL): Promise<boolean> {
    try {
      const response = await safeFetch(new URL(SOFT_NOT_FOUND_PROBE, base.origin), {
        ...this.options,
        timeoutMs: 6_000,
        maxBytes: 50_000,
      });
      return response.status === 200 && documentStatus("mcp", response.status, response.body) === "invalid";
    } catch {
      return false;
    }
  }

  /**
   * Reads the WebMCP tools this page offers: the ones annotated on elements, and the ones its own
   * scripts register. Site JavaScript is never executed, so a script match is a declaration.
   */
  private async collectPageTools(document: Document, base: URL): Promise<PageAgentTool[]> {
    const page = base.toString();
    const tools = collectDeclarativeTools(document, page);

    for (const script of [...document.querySelectorAll("script:not([src])")].slice(0, 25)) {
      tools.push(...extractImperativeTools(script.textContent ?? "", page));
    }

    const sources = unique(
      [...document.querySelectorAll("script[src]")]
        .map((script) => resolve(script.getAttribute("src"), base))
        .filter((href): href is string => href !== null && sameOrigin(href, base)),
    ).slice(0, MAX_SCRIPTS);

    const fetched = await Promise.allSettled(
      sources.map(async (source) => {
        const response = await safeFetch(source, { ...this.options, timeoutMs: 6_000, maxBytes: MAX_SCRIPT_BYTES });
        return response.status === 200 ? extractImperativeTools(response.body, source) : [];
      }),
    );

    for (const result of fetched) {
      if (result.status === "fulfilled") tools.push(...result.value);
    }

    return dedupePageTools(tools);
  }

  /** Talks to MCP endpoints the page links to and the ones its server card declares. */
  private async probeMcpEndpoints(
    document: Document,
    base: URL,
    discovery: DiscoveryDocument[],
    seedQuery: string,
  ): Promise<McpEndpointProbe[]> {
    const linked = [...document.querySelectorAll("a[href], link[href]")]
      .map((node) => resolve(node.getAttribute("href"), base))
      .filter((href): href is string => href !== null && sameOrigin(href, base))
      .filter((href) => MCP_ENDPOINT_PATTERN.test(new URL(href).pathname.toLowerCase()));

    const card = discovery.find((entry) => entry.kind === "mcp-server-card" && entry.found);
    const declared = card ? card.declaredNames.filter((name) => sameOrigin(name, base)) : [];

    // A declared transport outranks a linked path: it is what the site says an agent should use.
    const candidates = unique([...declared, ...linked]).slice(0, MAX_MCP_ENDPOINTS);
    const results = await Promise.allSettled(
      candidates.map((candidate) =>
        probeMcpEndpoint(new URL(candidate), { ...this.options, timeoutMs: 12_000, seedQuery }),
      ),
    );

    return results
      .map((result) => (result.status === "fulfilled" ? result.value : null))
      .filter((probe): probe is McpEndpointProbe => probe !== null);
  }
}

const JSON_DOCUMENTS = new Set<DiscoveryDocument["kind"]>([
  "mcp",
  "openapi",
  "agent-skills",
  "ucp",
  "webmcp-tools",
  "mcp-server-card",
  "agent-card",
  "api-catalog",
]);

/**
 * Decides whether a 200 response really is the document it claims to be. Single-page sites answer
 * unknown paths with their HTML shell, and reporting that as an agent interface would be a lie.
 */
export function documentStatus(
  kind: DiscoveryDocument["kind"],
  httpStatus: number,
  body: string,
): DiscoveryDocument["status"] {
  const trimmed = body.trim();
  if (httpStatus !== 200 || trimmed.length === 0) return "missing";

  const looksLikeHtml = /^<(!doctype|html|\?xml)/i.test(trimmed) || /<html[\s>]/i.test(trimmed.slice(0, 500));
  if (JSON_DOCUMENTS.has(kind)) {
    if (looksLikeHtml) return "invalid";
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return parsed && typeof parsed === "object" ? "valid" : "invalid";
    } catch {
      return "invalid";
    }
  }

  return looksLikeHtml ? "invalid" : "valid";
}

function declaredNames(kind: DiscoveryDocument["kind"], body: string): string[] {
  if (!JSON_DOCUMENTS.has(kind)) return [];
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (kind === "openapi") {
      const paths = parsed.paths;
      return paths && typeof paths === "object" ? Object.keys(paths).slice(0, 40) : [];
    }
    if (kind === "mcp-server-card") {
      // The card names the transports an agent should use, which is what gets probed next. Streamable
      // HTTP is listed first: it is the current transport, and the SSE one is deprecated.
      const transports = Array.isArray(parsed.transports) ? parsed.transports : [];
      return transports
        .map((entry) => (entry && typeof entry === "object" ? (entry as { endpoint?: unknown; type?: unknown }) : {}))
        .map((entry) => ({ endpoint: String(entry.endpoint ?? ""), streamable: String(entry.type ?? "") !== "sse" }))
        .filter((entry) => /^https?:\/\//.test(entry.endpoint))
        .sort((left, right) => Number(right.streamable) - Number(left.streamable))
        .map((entry) => entry.endpoint)
        .slice(0, 10);
    }
    if (kind === "api-catalog") {
      const linkset = Array.isArray(parsed.linkset) ? parsed.linkset : [];
      return linkset
        .flatMap((entry) => (entry && typeof entry === "object" ? Object.keys(entry as object) : []))
        .filter((key) => key !== "anchor")
        .slice(0, 40);
    }
    if (kind === "ucp") {
      const root = (parsed.ucp && typeof parsed.ucp === "object" ? parsed.ucp : parsed) as Record<string, unknown>;
      const names = new Set<string>();
      for (const key of ["services", "capabilities"]) {
        const group = root[key];
        if (group && typeof group === "object") for (const name of Object.keys(group)) names.add(name);
      }
      return [...names].slice(0, 40);
    }
    const entries = Array.isArray(parsed.tools)
      ? parsed.tools
      : Array.isArray(parsed.skills)
        ? parsed.skills
        : [];
    return entries
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const record = entry as { name?: unknown; id?: unknown };
        return String(record.name ?? record.id ?? "");
      })
      .filter(Boolean)
      .slice(0, 40);
  } catch {
    return [];
  }
}

function collectForms(document: Document, base: URL): SiteForm[] {
  return [...document.querySelectorAll("form")].slice(0, MAX_FORMS).map((form) => {
    const inputs = [...form.querySelectorAll("input, select, textarea")];
    const inputNames = unique(
      inputs.map((input) => (input.getAttribute("name") ?? input.getAttribute("id") ?? "").toLowerCase()).filter(Boolean),
    ).slice(0, 25);
    const types = inputs.map((input) => (input.getAttribute("type") ?? "").toLowerCase());

    return {
      name: (form.getAttribute("name") ?? form.getAttribute("id") ?? form.getAttribute("aria-label") ?? "").slice(0, 80),
      method: (form.getAttribute("method") ?? "get").toLowerCase(),
      action: path(form.getAttribute("action"), base) || "/",
      inputNames,
      hasDateInput: types.includes("date") || inputNames.some((name) => /date|check.?in|check.?out|arrival|depart/.test(name)),
      hasSearchInput:
        types.includes("search") ||
        form.getAttribute("role") === "search" ||
        inputNames.some((name) => /^(q|s|query|search|keyword)/.test(name)),
    };
  });
}

function collectJsonLdTypes(document: Document): string[] {
  const types = new Set<string>();

  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 25)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    collectTypes(parsed, types, 0);
  }

  return [...types].sort().slice(0, 40);
}

function collectTypes(node: unknown, types: Set<string>, depth: number): void {
  if (depth > 6 || !node) return;
  if (Array.isArray(node)) {
    for (const entry of node) collectTypes(entry, types, depth + 1);
    return;
  }
  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const type = record["@type"];
  if (typeof type === "string") types.add(type.replace(/^https?:\/\/schema\.org\//, ""));
  if (Array.isArray(type)) {
    for (const entry of type) if (typeof entry === "string") types.add(entry);
  }
  if (record.potentialAction) types.add("SearchAction");

  for (const key of ["@graph", "mainEntity", "itemListElement", "offers", "hasOfferCatalog", "about"]) {
    if (record[key]) collectTypes(record[key], types, depth + 1);
  }
}

/** Classifier input: what a person reads on the page, never its script, style, or JSON-LD text. */
export function readableText(document: Document): string {
  const main = document.querySelector("main") ?? document.querySelector("article") ?? document.body;
  if (!main) return "";
  // Cloned so the removal never mutates the document the other extractors still read.
  const clone = main.cloneNode(true) as Element;
  for (const node of [...clone.querySelectorAll("script, style, noscript, template")]) node.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function text(node: Element | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
}

function resolve(href: string | null | undefined, base: URL): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function sameOrigin(href: string, base: URL): boolean {
  try {
    return new URL(href).origin === base.origin;
  } catch {
    return false;
  }
}

function path(href: string | null | undefined, base: URL): string {
  const resolved = resolve(href, base);
  if (!resolved) return "";
  try {
    const url = new URL(resolved);
    return url.host === base.host ? `${url.pathname}${url.search}`.toLowerCase().slice(0, 200) : "";
  } catch {
    return "";
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function collectorErrorCode(error: unknown): string {
  return error instanceof UrlPolicyError ? error.code : "collector_failed";
}

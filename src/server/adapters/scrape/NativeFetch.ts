import { parseHTML } from "linkedom";
import { safeFetch, UrlPolicyError, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import { probeMcpEndpoint } from "./mcpProbe.js";
import type {
  DiscoveryDocument,
  ExtractedEntity,
  McpEndpointProbe,
  PageAgentTool,
  ScrapeProvider,
  SiteForm,
  SitePageSnapshot,
  SiteSnapshot,
} from "./ScrapeProvider.js";
import { detectWordLiftMarker, wordLiftDatasetEntity } from "../../../domain/evidence/detectWordLift.js";
import { executeSearchAction, findSearchActionTemplate } from "./searchAction.js";
import { collectDeclarativeTools, dedupePageTools, extractImperativeTools } from "./webmcpTools.js";

const MAX_LINKS = 150;
const MAX_FORMS = 20;
const MAX_TEXT = 20_000;
const MAX_PAGES = 4;
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
export type PageFetcher = (url: URL) => Promise<{ finalUrl: string; body: string; truncated: boolean; status?: number }>;

/** Statuses that are the site's bouncer, not its page. */
const REFUSAL_STATUSES = new Set([401, 403, 451]);
/** Challenge pages name themselves in the title, whatever status they ship with. */
const CHALLENGE_TITLE =
  /<title>[^<]*(just a moment|access denied|attention required|pardon our interruption|verify you are human|are you a human|bot verification|request unsuccessful|security check|the request could not be satisfied|403 forbidden)/i;
/** Fingerprints of the usual bot walls, for challenge pages with a bland title. */
const CHALLENGE_TOKENS = /cf-chl-bypass|cf-browser-verification|\/cdn-cgi\/challenge-platform\/|_Incapsula_Resource|distil_r_captcha|px-captcha|awswaf-captcha/i;

/**
 * Tells a site's bouncer from its page. A 401/403/451 is a refusal, a 429 a rate limit, and a
 * challenge page — whatever its status — asks for a proof of humanity an agent cannot give. Each
 * is reported as what it is, never audited as if it were the site. Returns the reason, or null
 * when the response is the page itself.
 */
const JS_NOTICE = /javascript is (disabled|required|not enabled|turned off)|enable javascript|turn on javascript|requires javascript/i;

/**
 * A page whose only readable content is a notice about JavaScript is a shell the site serves to
 * anything it does not consider a browser — including, by construction, an agent.
 */
export function javascriptShell(page: Pick<SitePageSnapshot, "title" | "headings" | "text">): boolean {
  const readable = [page.title, ...page.headings, page.text].join(" ").trim();
  return readable.length < 400 && JS_NOTICE.test(readable);
}

export function blockedResponse(status: number | undefined, body: string): string | null {
  if (status === 429) return "The site rate-limited automated collection (HTTP 429). Try again later.";
  if (status !== undefined && REFUSAL_STATUSES.has(status)) {
    return `The site refused automated access (HTTP ${status}); an agent cannot read it either.`;
  }
  const head = body.slice(0, 8_000);
  if (CHALLENGE_TITLE.test(head) || CHALLENGE_TOKENS.test(head)) {
    return "The site answered with a bot challenge instead of its page; an agent cannot read it either.";
  }
  return null;
}

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
    const page = await this.fetchPublicPage(url);
    // A refusal or a bot challenge is reported as such, never audited as if it were the site;
    // neither is an outage page.
    const refusal = blockedResponse(page.status, page.body);
    if (refusal) throw new UrlPolicyError("site_blocked", refusal, 403);
    if (page.status !== undefined && page.status >= 500) {
      throw new UrlPolicyError("dns_failure", `The site answered HTTP ${page.status} instead of its page.`, 502);
    }
    const { document } = parseHTML(page.body);
    const finalUrl = new URL(page.finalUrl);

    const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
    const canonicalUrl = resolve(canonicalHref, finalUrl) ?? finalUrl.toString();

    const links = [...document.querySelectorAll("a[href]")].slice(0, MAX_LINKS);
    const [{ discovery, softNotFound }, pageTools] = await Promise.all([
      this.collectDiscovery(finalUrl),
      this.collectPageTools(document, finalUrl),
    ]);
    const mainPage = extractPage(document, finalUrl, "entry", page.truncated, pageTools);
    if (javascriptShell(mainPage)) {
      throw new UrlPolicyError(
        "site_blocked",
        "The site answered with an empty JavaScript shell instead of its page; an agent without a full browser sees the same.",
        403,
      );
    }
    const pageCandidates = selectRepresentativePages(links, finalUrl);
    const collectedPages = await Promise.allSettled(
      pageCandidates.map(async (candidate) => {
        const response = await this.fetchPublicPage(candidate.url);
        // A secondary page behind a bouncer is skipped rather than read as an "Access Denied" page.
        const refusal = blockedResponse(response.status, response.body);
        if (refusal) throw new UrlPolicyError("site_blocked", refusal, 403);
        const parsed = parseHTML(response.body).document;
        // Across secondary pages we read declarative and inline tools but avoid re-fetching the
        // same site-wide script bundle up to three more times.
        const tools = [
          ...collectDeclarativeTools(parsed, response.finalUrl),
          ...[...parsed.querySelectorAll("script:not([src])")]
            .slice(0, 25)
            .flatMap((script) => extractImperativeTools(script.textContent ?? "", response.finalUrl)),
        ];
        return extractPage(parsed, new URL(response.finalUrl), candidate.role, response.truncated, dedupePageTools(tools));
      }),
    );
    const pages = [
      mainPage,
      ...collectedPages
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((item): item is SitePageSnapshot => item !== null),
    ].slice(0, MAX_PAGES);
    // The server card names its own transports, so it has to be read before anything is probed.
    // A search term taken from the page, so a tool call never needs invented vocabulary.
    const seedQuery = text(document.querySelector("h1")) || text(document.querySelector("title")) || finalUrl.hostname;
    const mcpEndpoints = await this.probeMcpEndpoints(document, finalUrl, discovery, seedQuery.slice(0, 60));

    // The most widespread declared interface on the web gets the same treatment as an MCP tool:
    // it is executed, once and read-only, and only a page that acknowledges the query confirms it.
    const searchTemplate = findSearchActionTemplate(document, finalUrl);
    const searchAction = searchTemplate
      ? await executeSearchAction(searchTemplate, seedQuery.slice(0, 60), this.options)
      : undefined;

    // The entry page's raw body is only in hand here, so its platform fingerprints are read now.
    // Without one, a server-side install still shows itself: entity ids on the site's own data.
    // subdomain, confirmed by the one header the dataset portal answers with.
    const wordliftMarker = detectWordLiftMarker(page.body);
    const wordlift = wordliftMarker
      ? { marker: wordliftMarker, sourceUrl: page.finalUrl }
      : await this.confirmWordLiftDataset(pages.flatMap((entry) => entry.entities), finalUrl);

    return {
      requestedUrl: url.toString(),
      canonicalUrl,
      title: text(document.querySelector("title")),
      description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.slice(0, 500) ?? "",
      pages,
      // What a person reads on a page includes its title, description, and headings — on an
      // image-led homepage they are most of it — so they lead each page's classification text.
      text: pages
        .map((entry) => [entry.title, entry.description, ...entry.headings, entry.text].filter(Boolean).join("\n"))
        .join("\n\n")
        .slice(0, 60_000),
      headings: unique(pages.flatMap((entry) => entry.headings)).slice(0, 80),
      linkPaths: unique(pages.flatMap((entry) => entry.linkPaths)).slice(0, MAX_LINKS),
      linkLabels: unique(pages.flatMap((entry) => entry.linkLabels)).slice(0, 120),
      forms: pages.flatMap((entry) => entry.forms).slice(0, MAX_FORMS),
      jsonLdTypes: unique(pages.flatMap((entry) => entry.jsonLdTypes)).sort().slice(0, 80),
      discovery,
      pageTools: dedupePageTools(pages.flatMap((entry) => entry.pageTools)),
      mcpEndpoints,
      ...(searchAction ? { searchAction } : {}),
      ...(wordlift ? { wordlift } : {}),
      softNotFound,
      truncated: pages.some((entry) => entry.truncated) || collectedPages.some((result) => result.status === "rejected"),
    };
  }

  /** One bounded call confirms a server-side install: the dataset portal names itself in a header. */
  private async confirmWordLiftDataset(
    entities: ExtractedEntity[],
    base: URL,
  ): Promise<{ marker: string; sourceUrl: string } | null> {
    const match = wordLiftDatasetEntity(entities, base.toString());
    if (!match) return null;
    try {
      const response = await safeFetch(match.id, {
        ...this.options,
        timeoutMs: 6_000,
        maxBytes: 50_000,
        captureHeaders: ["x-wordlift-service"],
      });
      if (response.headers["x-wordlift-service"]) {
        return {
          marker: `The site's dataset subdomain answers as a WordLift data portal (${new URL(match.id).hostname})`,
          sourceUrl: match.id,
        };
      }
    } catch {
      // An unreachable dataset id proves nothing either way; the entity-id pattern still speaks.
    }
    return null;
  }

  private async fetchPublicPage(url: URL) {
    return this.fetchPage
      ? this.fetchPage(url)
      : safeFetch(url, { ...this.options, timeoutMs: this.options.timeoutMs ?? 15_000 });
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

export interface PageCandidate {
  url: URL;
  role: SitePageSnapshot["role"];
  score: number;
  order: number;
}

/**
 * Selects complementary evidence surfaces. One product/detail page, one commercial/action page,
 * and one policy/contact page tell us much more than the first three navigation links.
 */
export function selectRepresentativePages(links: Element[], base: URL): PageCandidate[] {
  const candidates = links
    .map((link, order) => {
      const href = resolve(link.getAttribute("href"), base);
      if (!href || !sameOrigin(href, base)) return null;
      const url = new URL(href);
      if (url.pathname === base.pathname || /\.(?:png|jpe?g|gif|svg|pdf|zip|xml)$/i.test(url.pathname)) return null;
      url.hash = "";
      const haystack = `${url.pathname} ${text(link)}`.toLowerCase();
      const role = pageRole(haystack);
      const roleWeight = { detail: 40, offer: 36, policy: 30, contact: 28, other: 8, entry: 0 }[role];
      const depthBonus = Math.min(url.pathname.split("/").filter(Boolean).length, 4);
      return { url, role, score: roleWeight + depthBonus, order } satisfies PageCandidate;
    })
    .filter((candidate): candidate is PageCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.order - right.order);

  const selected: PageCandidate[] = [];
  const seenUrls = new Set<string>();
  const seenRoles = new Set<SitePageSnapshot["role"]>();
  for (const candidate of candidates) {
    const key = candidate.url.toString();
    if (seenUrls.has(key)) continue;
    if (seenRoles.has(candidate.role) && candidates.some((item) => !seenRoles.has(item.role))) continue;
    selected.push(candidate);
    seenUrls.add(key);
    seenRoles.add(candidate.role);
    if (selected.length === MAX_PAGES - 1) break;
  }
  return selected;
}

function pageRole(value: string): SitePageSnapshot["role"] {
  if (/\b(products?|property|properties|rooms?|stays?|accommodations?|articles?|story|stories|posts?|services?|solutions?|features?)\b/.test(value)) return "detail";
  if (/\b(price|pricing|offer|availability|book|booking|reserve|shop|checkout|demo|trial|signup)\b/.test(value)) return "offer";
  if (/\b(faq|policy|terms|shipping|return|privacy|help|guide)\b/.test(value)) return "policy";
  if (/\b(contact|inquiry|enquiry|support)\b/.test(value)) return "contact";
  return "other";
}

function extractPage(
  document: Document,
  base: URL,
  role: SitePageSnapshot["role"],
  truncated: boolean,
  pageTools: PageAgentTool[],
): SitePageSnapshot {
  const links = [...document.querySelectorAll("a[href]")].slice(0, MAX_LINKS);
  const jsonLd = collectJsonLd(document, base);
  return {
    url: base.toString(),
    title: text(document.querySelector("title")),
    description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.slice(0, 500) ?? "",
    role,
    text: readableText(document),
    headings: [...document.querySelectorAll("h1, h2, h3")].slice(0, 40).map((node) => text(node)).filter(Boolean),
    linkPaths: unique(links.map((node) => path(node.getAttribute("href"), base)).filter(Boolean)),
    linkLabels: unique(links.map((node) => text(node).toLowerCase()).filter(Boolean)).slice(0, 80),
    forms: collectForms(document, base),
    jsonLdTypes: jsonLd.types,
    entities: jsonLd.entities,
    pageTools,
    truncated,
  };
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

function collectJsonLd(document: Document, base: URL): { types: string[]; entities: ExtractedEntity[] } {
  const types = new Set<string>();
  const entities: ExtractedEntity[] = [];

  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 25)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    collectTypes(parsed, types, 0);
    collectEntities(parsed, entities, base, 0);
  }

  return { types: [...types].sort().slice(0, 80), entities: dedupeEntities(entities).slice(0, 60) };
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

const DOMAIN_ENTITY_TYPES = new Set([
  "Organization",
  "LocalBusiness",
  "LodgingBusiness",
  "Hotel",
  "Resort",
  "Apartment",
  "Accommodation",
  "Product",
  "ProductGroup",
  "Service",
  "SoftwareApplication",
  "WebApplication",
  "Article",
  "NewsArticle",
  "BlogPosting",
  "Person",
  "FinancialService",
  "InsuranceAgency",
  "Event",
  "Place",
]);

function collectEntities(node: unknown, entities: ExtractedEntity[], base: URL, depth: number): void {
  if (depth > 8 || !node) return;
  if (Array.isArray(node)) {
    for (const entry of node) collectEntities(entry, entities, base, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const types = stringList(record["@type"]).map((type) => type.replace(/^https?:\/\/schema\.org\//, ""));
  const name = firstString(record.name, record.headline);
  if (name && types.some((type) => DOMAIN_ENTITY_TYPES.has(type))) {
    entities.push({
      id: entityId(record, types[0] ?? "Thing", name, base),
      types: unique(types).slice(0, 12),
      name: name.slice(0, 300),
      alternateNames: stringList(record.alternateName).slice(0, 20),
      description: firstString(record.description)?.slice(0, 1_000),
      sourceUrl: base.toString(),
      sameAs: stringList(record.sameAs).map((value) => resolve(value, base)).filter((value): value is string => Boolean(value)).slice(0, 12),
      offers: extractOffers(record.offers, base),
    });
  }
  for (const value of Object.values(record)) collectEntities(value, entities, base, depth + 1);
}

function entityId(record: Record<string, unknown>, type: string, name: string, base: URL): string {
  for (const candidate of [record["@id"], record.url]) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(candidate) && !candidate.startsWith("/")) return candidate.slice(0, 500);
    const resolved = resolve(candidate, base);
    if (resolved) return resolved.slice(0, 500);
  }
  return `urn:wordlift:entity:${slug(type)}:${slug(name)}`.slice(0, 500);
}

function extractOffers(value: unknown, base: URL): ExtractedEntity["offers"] {
  const entries = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return entries.slice(0, 12).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const offer = entry as Record<string, unknown>;
    const url = firstString(offer.url);
    return [{
      id: firstString(offer["@id"])?.slice(0, 500),
      name: firstString(offer.name)?.slice(0, 240),
      price: typeof offer.price === "number" || typeof offer.price === "string" ? offer.price : undefined,
      priceCurrency: firstString(offer.priceCurrency)?.slice(0, 8),
      availability: firstString(offer.availability)?.replace(/^https?:\/\/schema\.org\//, "").slice(0, 240),
      url: url ? resolve(url, base) ?? undefined : undefined,
    }];
  });
}

function dedupeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const byId = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    const existing = byId.get(entity.id);
    if (!existing) {
      byId.set(entity.id, entity);
      continue;
    }
    byId.set(entity.id, {
      ...existing,
      types: unique([...existing.types, ...entity.types]),
      alternateNames: unique([...existing.alternateNames, ...entity.alternateNames]),
      sameAs: unique([...existing.sameAs, ...entity.sameAs]),
      offers: [...existing.offers, ...entity.offers].slice(0, 12),
    });
  }
  return [...byId.values()];
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringList);
  return [];
}

function firstString(...values: unknown[]): string | undefined {
  return values.flatMap(stringList).find(Boolean);
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unnamed";
}

/** A landmark with less text than this is a shell or a hero, not what the person read. */
const MIN_LANDMARK_TEXT = 300;

/** Classifier input: what a person reads on the page, never its script, style, or JSON-LD text. */
export function readableText(document: Document): string {
  const landmark = document.querySelector("main") ?? document.querySelector("article");
  const fromLandmark = landmark ? strippedText(landmark) : "";
  // A near-empty <main> — a client-rendered shell, a hero region — hides the page that surrounds
  // it; the body is read instead so an image-led homepage still classifies.
  const text = fromLandmark.length >= MIN_LANDMARK_TEXT || !document.body ? fromLandmark : strippedText(document.body);
  return text.slice(0, MAX_TEXT);
}

function strippedText(root: Element): string {
  // Cloned so the removal never mutates the document the other extractors still read.
  const clone = root.cloneNode(true) as Element;
  for (const node of [...clone.querySelectorAll("script, style, noscript, template")]) node.remove();
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
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

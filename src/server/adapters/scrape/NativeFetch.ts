import { parseHTML } from "linkedom";
import { safeFetch, UrlPolicyError, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import type { DiscoveryDocument, ScrapeProvider, SiteForm, SiteSnapshot } from "./ScrapeProvider.js";

const MAX_LINKS = 150;
const MAX_FORMS = 20;
const MAX_TEXT = 20_000;

const DISCOVERY_PATHS: Array<{ kind: DiscoveryDocument["kind"]; path: string }> = [
  { kind: "robots", path: "/robots.txt" },
  { kind: "llms", path: "/llms.txt" },
  { kind: "skill", path: "/skill.md" },
  { kind: "mcp", path: "/.well-known/mcp.json" },
  { kind: "webmcp-tools", path: "/.well-known/webmcp/tools.json" },
  { kind: "openapi", path: "/openapi.json" },
  { kind: "agent-skills", path: "/.well-known/agent-skills/index.json" },
];

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
    const discovery = await this.collectDiscovery(finalUrl);

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
      truncated: page.truncated,
    };
  }

  private async collectDiscovery(base: URL): Promise<DiscoveryDocument[]> {
    const results = await Promise.allSettled(
      DISCOVERY_PATHS.map(async ({ kind, path: documentPath }) => {
        const target = new URL(documentPath, base.origin);
        const response = await safeFetch(target, { ...this.options, timeoutMs: 6_000, maxBytes: 250_000 });
        const status = documentStatus(kind, response.status, response.body);
        return {
          kind,
          url: target.toString(),
          status,
          found: status === "valid",
          declaredNames: status === "valid" ? declaredNames(kind, response.body) : [],
        } satisfies DiscoveryDocument;
      }),
    );

    return results.map((result, index) => {
      const { kind, path: documentPath } = DISCOVERY_PATHS[index];
      if (result.status === "fulfilled") return result.value;
      // A missing or blocked discovery document is a finding, not a failure.
      return {
        kind,
        url: new URL(documentPath, base.origin).toString(),
        status: "missing",
        found: false,
        declaredNames: [],
      } satisfies DiscoveryDocument;
    });
  }
}

const JSON_DOCUMENTS = new Set<DiscoveryDocument["kind"]>(["mcp", "webmcp-tools", "openapi", "agent-skills"]);

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
    const entries = Array.isArray(parsed.tools)
      ? parsed.tools
      : Array.isArray(parsed.skills)
        ? parsed.skills
        : [];
    return entries
      .map((entry) => (entry && typeof entry === "object" ? String((entry as { name?: unknown }).name ?? "") : ""))
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

function readableText(document: Document): string {
  const main = document.querySelector("main") ?? document.querySelector("article") ?? document.body;
  return (main?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
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

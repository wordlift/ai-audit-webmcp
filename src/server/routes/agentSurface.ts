import { buildFeed, ownCatalog, ownServerCard } from "../../domain/publish/feed.js";
import type { PublishedSiteStore } from "../adapters/published/PublishedSiteStore.js";
import { Router, type Request } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  AUDIT_WEBSITE_TOOL,
  EXPLAIN_CAPABILITY_TOOL,
  EXPLAIN_FOUNDATION_AUDIT_TOOL,
  GET_AUDIT_REPORT_TOOL,
  INSPECT_SERVICE_MAP_TOOL,
  INSPECT_SERVICE_MAP_TOOL_ALIAS,
  REFINE_SERVICE_MAP_TOOL,
  REFINE_SERVICE_MAP_TOOL_ALIAS,
} from "../../shared/tools/definitions.js";
import {
  auditSummaryText,
  inspectServiceMap,
  inspectSummaryText,
  summarizeReportForAgent,
} from "../../shared/format/agentSummary.js";
import { businessIdentity } from "../../shared/format/businessModel.js";
import { modelView } from "../../shared/format/modelView.js";
import type { ReportRecord } from "../../shared/types/index.js";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";

export interface AgentSurfaceOptions {
  orchestrator?: AuditOrchestrator;
  staticDirectory?: string;
  /** The sites that publish through us, for the entry source. Absent means an empty feed. */
  published?: PublishedSiteStore;
  /** False on a preview: robots are told to stay out, and every response says noindex. */
  indexable?: boolean;
}

/**
 * Tools registered on every page, and the ones a report page adds when its route mounts. Both
 * lists reference the same constants the client registers, so a published descriptor cannot name
 * a tool that no longer exists.
 */
interface ToolDescriptor {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly annotations?: unknown;
  readonly deprecated?: boolean;
  readonly replacedBy?: string;
}

const GLOBAL_TOOLS: readonly ToolDescriptor[] = [AUDIT_WEBSITE_TOOL, GET_AUDIT_REPORT_TOOL];
const REPORT_TOOLS: readonly ToolDescriptor[] = [
  INSPECT_SERVICE_MAP_TOOL,
  EXPLAIN_CAPABILITY_TOOL,
  EXPLAIN_FOUNDATION_AUDIT_TOOL,
  REFINE_SERVICE_MAP_TOOL,
];

/**
 * Names these tools answered to before the rename. They are published so the deprecation is
 * legible to a reader that only has the old name, and never listed as the way to call the tool.
 */
const DEPRECATED_REPORT_TOOLS: readonly ToolDescriptor[] = [
  INSPECT_SERVICE_MAP_TOOL_ALIAS,
  REFINE_SERVICE_MAP_TOOL_ALIAS,
];

/** The prerendered summary is bounded: a report with many actions must not inflate the shell. */
const MAX_SUMMARY_BYTES = 24_000;

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Audited sites author much of the text in a report. It is bounded and de-noised on the way in,
 * but it is still untrusted, so every value crossing into HTML is escaped here.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] as string);
}

/** `<` is escaped so no report value can close the surrounding script element. */
function embedJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c");
}

function baseUrl(request: Request): string {
  return `${request.protocol}://${request.get("host") ?? "beta.audit.wordlift.io"}`;
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

/**
 * This service measures whether sites let agents in, so it answers the same questions it asks.
 * Everything here is public and safe to read; the write paths live behind /api and are rate limited.
 */
/** A preview asks every crawler to stay out: the brand lives on the production domain and nowhere else. */
const PREVIEW_ROBOTS = ["# Preview deployment: not for indexing.", "User-agent: *", "Disallow: /", ""].join("\n");

function robotsTxt(base: string): string {
  return [
    "# WordLift AI Audit — this service maps websites for AI agents, and welcomes them.",
    "# Reports render client-side; every report page also carries a machine-readable",
    "# summary in its markup, and the same data as JSON at /api/reports/<reportId>.",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    "# Agent-readable overview of this service:",
    `# ${base}/llms.txt`,
    "# Declared WebMCP tool surface:",
    `# ${base}/.well-known/webmcp/tools.json`,
    "",
  ].join("\n");
}

function llmsTxt(base: string): string {
  return [
    "# WordLift AI Audit",
    "",
    "> Audits a public website from an AI agent's perspective: what a human can do on it, which of",
    "> those actions an agent can actually complete, and what evidence supports each claim. Results",
    "> are published as machine-generated Terms of Action that a human can review and refine.",
    "",
    "This site exposes its own functionality to agents through WebMCP: tools are registered on the",
    "page via `navigator.modelContext`, so an agent browsing the page can call them directly. In a",
    "browser without WebMCP the same data is available over the HTTP API below.",
    "",
    "## Tools",
    "",
    ...GLOBAL_TOOLS.map((tool) => `- **${tool.name}** (any page): ${tool.description}`),
    ...REPORT_TOOLS.map((tool) => `- **${tool.name}** (report pages): ${tool.description}`),
    "",
    "## API",
    "",
    `- [Tool descriptors](${base}/.well-known/webmcp/tools.json): the declared WebMCP surface as JSON.`,
    `- [Report JSON](${base}/api/reports/): append a reportId for the full stored report.`,
    `- [Action contract](${base}/api/reports/): \`<reportId>/contracts/<actionId>\` returns JSON-LD for one action.`,
    `- [Publication](${base}/api/reports/): \`<reportId>/publish\` returns what the site publishes from a report, and \`/publish/page.jsonld\`, \`/publish/skill.md\`, \`/publish/ai-catalog.json\` each document as itself.`,
    `- [Health](${base}/api/health): service status and released commit.`,
    "",
    "## Notes",
    "",
    "- Report pages are addressed as `/reports/<reportId>` and expire 30 days after creation.",
    "- Starting an audit is a write and is rate limited; reading a report is not.",
    `- [Privacy policy](${base}/privacy): what the service collects, who sees it, and how long it is kept.`,
    "",
  ].join("\n");
}

/**
 * A WebMCP manifest is not part of the spec, and this service never holds its absence against an
 * audited site. It is published here because the tools are worth finding without a WebMCP browser.
 */
function toolsManifest(base: string) {
  const describe = (tool: ToolDescriptor, scope: string) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    scope,
    ...(tool.deprecated ? { deprecated: true, replacedBy: tool.replacedBy } : {}),
  });
  return {
    name: "WordLift AI Audit",
    description:
      "Audits a public website from an AI agent's perspective and publishes machine-generated Terms of Action.",
    homepage: base,
    registration: "navigator.modelContext",
    documentation: `${base}/llms.txt`,
    privacyPolicy: `${base}/privacy`,
    tools: [
      ...GLOBAL_TOOLS.map((tool) => describe(tool, "site")),
      ...REPORT_TOOLS.map((tool) => describe(tool, "/reports/:reportId")),
      ...DEPRECATED_REPORT_TOOLS.map((tool) => describe(tool, "/reports/:reportId")),
    ],
  };
}

/** The report as schema.org, for readers that prefer structured data to prose. */
function reportJsonLd(report: ReportRecord, reportUrl: string, description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Report",
    name: `Agent readiness of ${report.canonicalUrl ?? report.requestedUrl}`,
    url: reportUrl,
    description,
    about: { "@type": "WebSite", url: report.canonicalUrl ?? report.requestedUrl },
    ...(report.completedAt ? { datePublished: report.completedAt } : {}),
    creator: { "@type": "Organization", name: "WordLift", url: "https://wordlift.io" },
    isAccessibleForFree: true,
  };
}

/** The picture a shared link shows: the same for every page, and a PNG, because chat previews do not draw SVG. */
const SHARE_IMAGE = { path: "/brand/share-card.png", width: 1200, height: 630, alt: "WordLift AI Audit: see how AI understands your business, and what agents can do." };
const SITE_NAME = "WordLift AI Audit";

/** What a link preview reads: Open Graph for Slack, LinkedIn and the rest, and the two tags X needs of its own. */
function socialTags(card: { title: string; description: string; url: string; origin: string; type: "website" | "article" }): string[] {
  const image = `${card.origin}${SHARE_IMAGE.path}`;
  return [
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:type" content="${card.type}" />`,
    `<meta property="og:title" content="${escapeHtml(card.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(card.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(card.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:image:width" content="${SHARE_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${SHARE_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(SHARE_IMAGE.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(card.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(card.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" />`,
  ];
}

function hostOfSite(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * A report as a shared link reads it, in the order the page reads: who the business is, then what
 * agents can do there. The site is named by its host, never by a raw address a chat would turn
 * into a second link. The business is said in a sentence only when the report settled who it is;
 * otherwise the site's own description is quoted as the site's. The count is the page's count:
 * expected actions verified by a call.
 */
export function shareCard(report: ReportRecord): { title: string; description: string } {
  const host = hostOfSite(report.canonicalUrl ?? report.requestedUrl);
  const expected = (report.capabilities ?? []).filter((capability) => capability.expected);
  const verified = expected.filter((capability) => capability.state === "agent-ready").length;
  const pages = report.contextGraph?.pages ?? [];
  const settled = businessIdentity(report).status === "settled";
  const sentence = settled ? modelView(report).sentence : null;
  const entry = pages.find((page) => page.role === "entry") ?? pages[0];
  const ownWords = entry?.description?.replace(/\s+/g, " ").trim();
  const about = sentence ?? (ownWords && ownWords.length >= 24 ? `In its own words: “${truncate(ownWords, 120)}”` : null);
  const actions =
    expected.length === 0
      ? "No agent actions are expected of this kind of site."
      : verified === 0
        ? `None of its ${expected.length} expected actions is verified for AI agents yet.`
        : `${verified} of ${expected.length} expected actions ${verified === 1 ? "is" : "are"} verified for AI agents.`;
  const read = pages.length > 0 ? ` Read from ${pages.length} ${pages.length === 1 ? "page" : "pages"}.` : "";
  return {
    title: `${host}: how AI understands this business, and what agents can do`,
    description: truncate(`${about ? `${/[.!?”]$/.test(about) ? about : `${about}.`} ` : ""}${actions}${read}`, 300),
  };
}

/** The home page's own preview, with an absolute image, which the static shell cannot know. */
export function prerenderHome(shell: string, origin: string): string {
  const title = "WordLift AI Audit: see how AI understands your business, and what agents can do";
  const description = "Paste a URL. WordLift builds a first model of the business from its pages, shows what the site declares and what it only says in its content, and checks what AI agents can actually do with it. Free, no account.";
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(`${origin}/`)}" />`,
    ...socialTags({ title, description, url: `${origin}/`, origin, type: "website" }),
  ].join("\n    ");
  return shell.replace(/<meta\s+name="description"[\s\S]*?\/>/i, "").replace(/<title>[\s\S]*?<\/title>/i, head);
}

/**
 * Injects a report's own title, description and agent-readable summary into the shell. The page is
 * still rendered by React: the summary sits in `<noscript>`, so it reaches a reader that does not
 * run scripts and never competes with the mounted app.
 */
export function prerenderReport(shell: string, report: ReportRecord, reportUrl: string): string {
  const summary = summarizeReportForAgent(report, reportUrl);
  const terms = inspectServiceMap(report, reportUrl);
  const card = shareCard(report);
  const title = `${card.title} · ${SITE_NAME}`;
  const description = card.description;
  let origin = "";
  try {
    origin = new URL(reportUrl).origin;
  } catch {
    origin = "";
  }

  const body = truncate(
    [auditSummaryText(summary), "", inspectSummaryText(terms)].join("\n"),
    MAX_SUMMARY_BYTES,
  );

  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(reportUrl)}" />`,
    // The preview's title leaves the product's name to og:site_name, which a card shows on its own line.
    ...socialTags({ title: card.title, description, url: reportUrl, origin, type: "article" }),
    `<script type="application/ld+json">${embedJson(reportJsonLd(report, reportUrl, description))}</script>`,
  ].join("\n    ");

  return shell
    .replace(/<meta\s+name="description"[\s\S]*?\/>/i, "")
    .replace(/<title>[\s\S]*?<\/title>/i, head)
    .replace(
      /<div id="root"><\/div>/,
      `<div id="root"></div>\n    <noscript>\n      <h1>${escapeHtml(title)}</h1>\n      <pre>${escapeHtml(body)}</pre>\n      <p>Full report JSON: <a href="${escapeHtml(`/api/reports/${report.id}`)}">/api/reports/${escapeHtml(report.id)}</a></p>\n    </noscript>`,
    );
}

/**
 * The documents an agent looks for before it looks at the page. These are declared ahead of the
 * SPA fallback: answering /robots.txt with the HTML shell reports a document that is not there.
 */
export function createAgentSurfaceRouter(options: AgentSurfaceOptions = {}): Router {
  const router = Router();
  const { orchestrator, staticDirectory, published } = options;
  const indexable = options.indexable ?? true;

  let shell: string | null = null;
  const loadShell = (): string | null => {
    if (shell !== null) return shell;
    if (!staticDirectory) return null;
    try {
      shell = readFileSync(path.join(staticDirectory, "index.html"), "utf8");
    } catch {
      shell = null;
    }
    return shell;
  };

  // The privacy policy is a legal document: it is served as plain HTML that reads without scripts,
  // and declared ahead of the SPA fallback, which would otherwise answer with the empty shell.
  let privacyPage: string | null = null;
  const loadPrivacyPage = (): string | null => {
    if (privacyPage !== null) return privacyPage;
    if (!staticDirectory) return null;
    try {
      privacyPage = readFileSync(path.join(staticDirectory, "privacy.html"), "utf8");
    } catch {
      privacyPage = null;
    }
    return privacyPage;
  };

  router.get("/privacy", (_request, response, next) => {
    const page = loadPrivacyPage();
    if (!page) {
      next();
      return;
    }
    response.type("text/html; charset=utf-8").set("cache-control", "public, max-age=3600").send(page);
  });

  router.get("/robots.txt", (request, response) => {
    response.type("text/plain; charset=utf-8").set("cache-control", "public, max-age=3600").send(indexable ? robotsTxt(baseUrl(request)) : PREVIEW_ROBOTS);
  });

  router.get("/llms.txt", (request, response) => {
    response.type("text/plain; charset=utf-8").set("cache-control", "public, max-age=3600").send(llmsTxt(baseUrl(request)));
  });

  // This service's own catalog, and the card it points at: the audit answers the questions it asks.
  router.get("/.well-known/ai-catalog.json", (request, response) => {
    response.type("application/json").set("cache-control", "public, max-age=3600").send(JSON.stringify(ownCatalog(baseUrl(request)), null, 2));
  });
  router.get("/.well-known/mcp/server-card.json", (request, response) => {
    response.type("application/json").set("cache-control", "public, max-age=3600").send(JSON.stringify(ownServerCard(baseUrl(request)), null, 2));
  });
  // The entry source for registries: the sites that publish through us, each on its own domain.
  router.get("/feed/ai-catalog.json", async (request, response) => {
    const sites = published ? await published.list().catch(() => []) : [];
    response.type("application/json").set("cache-control", "public, max-age=3600").send(JSON.stringify(buildFeed(sites, { base: baseUrl(request) }), null, 2));
  });

  router.get("/.well-known/webmcp/tools.json", (request, response) => {
    response.type("application/json").set("cache-control", "public, max-age=3600").send(embedJson(toolsManifest(baseUrl(request))));
  });

  // A report that is missing, still running, or unreadable falls through to the untouched shell:
  // the app renders its own empty and error states, and a prerender failure must not lose the page.
  // The home page shared as a link: the same shell, with a preview of its own.
  router.get("/", (request, response, next) => {
    const template = loadShell();
    if (!template) {
      next();
      return;
    }
    let origin = baseUrl(request);
    try {
      if (orchestrator) origin = new URL(orchestrator.reportUrl("home")).origin;
    } catch {
      // The request's own origin stands.
    }
    response.type("text/html; charset=utf-8").set("cache-control", "public, max-age=0, must-revalidate").send(prerenderHome(template, origin));
  });

  // A report's link and its Activate page are the same report to whoever receives them.
  router.get(["/reports/:reportId", "/reports/:reportId/activate"], async (request, response, next) => {
    const template = loadShell();
    if (!template || !orchestrator) {
      next();
      return;
    }
    try {
      const report = await orchestrator.get(request.params.reportId as string);
      if (!report || report.status === "running" || report.status === "failed") {
        next();
        return;
      }
      response
        .type("text/html; charset=utf-8")
        .set("cache-control", "public, max-age=0, must-revalidate")
        .send(prerenderReport(template, report, orchestrator.reportUrl(report.id)));
    } catch {
      next();
    }
  });

  return router;
}

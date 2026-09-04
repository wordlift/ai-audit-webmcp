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
} from "../../client/webmcp/toolSchemas.js";
import {
  auditSummaryText,
  inspectServiceMap,
  inspectSummaryText,
  summarizeReportForAgent,
} from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import type { AuditOrchestrator } from "../services/AuditOrchestrator.js";

export interface AgentSurfaceOptions {
  orchestrator?: AuditOrchestrator;
  staticDirectory?: string;
}

/**
 * Tools registered on every page, and the ones a report page adds when its route mounts. Both
 * lists reference the same constants the client registers, so a published descriptor cannot name
 * a tool that no longer exists.
 */
interface ToolDescriptor {
  readonly name: string;
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
    `- [Health](${base}/api/health): service status and released commit.`,
    "",
    "## Notes",
    "",
    "- Report pages are addressed as `/reports/<reportId>` and expire 30 days after creation.",
    "- Starting an audit is a write and is rate limited; reading a report is not.",
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

/**
 * Injects a report's own title, description and agent-readable summary into the shell. The page is
 * still rendered by React: the summary sits in `<noscript>`, so it reaches a reader that does not
 * run scripts and never competes with the mounted app.
 */
export function prerenderReport(shell: string, report: ReportRecord, reportUrl: string): string {
  const summary = summarizeReportForAgent(report, reportUrl);
  const terms = inspectServiceMap(report, reportUrl);
  const site = summary.canonicalUrl;

  const title = `${site} — agent readiness ${summary.agentReadinessScore}/100 · WordLift AI Audit`;
  const description = truncate(
    `${site} looks like a ${summary.archetype.replace("-", "/")} site. Verified agent readiness ` +
      `${summary.agentReadinessScore}/100 across ${summary.pagesAnalyzed} page` +
      `${summary.pagesAnalyzed === 1 ? "" : "s"}` +
      `${summary.priorityGaps.length > 0 ? `, with ${summary.priorityGaps.length} priority capability gap${summary.priorityGaps.length === 1 ? "" : "s"}` : ", with no expected action missing agent support"}.`,
    300,
  );

  const body = truncate(
    [auditSummaryText(summary), "", inspectSummaryText(terms)].join("\n"),
    MAX_SUMMARY_BYTES,
  );

  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${escapeHtml(reportUrl)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(reportUrl)}" />`,
    `<meta name="twitter:card" content="summary" />`,
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
  const { orchestrator, staticDirectory } = options;

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

  router.get("/robots.txt", (request, response) => {
    response.type("text/plain; charset=utf-8").set("cache-control", "public, max-age=3600").send(robotsTxt(baseUrl(request)));
  });

  router.get("/llms.txt", (request, response) => {
    response.type("text/plain; charset=utf-8").set("cache-control", "public, max-age=3600").send(llmsTxt(baseUrl(request)));
  });

  router.get("/.well-known/webmcp/tools.json", (request, response) => {
    response.type("application/json").set("cache-control", "public, max-age=3600").send(embedJson(toolsManifest(baseUrl(request))));
  });

  // A report that is missing, still running, or unreadable falls through to the untouched shell:
  // the app renders its own empty and error states, and a prerender failure must not lose the page.
  router.get("/reports/:reportId", async (request, response, next) => {
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

import { z } from "zod";
import { SCHEMA_ACTION_MAP } from "../../../domain/evidence/schemaActions.js";
import type { CapabilityEvidence, FoundationAuditSummary, ReportError } from "../../../shared/types/index.js";
import { sanitizeEvidence } from "../../security/sanitizeEvidence.js";
import type { AuditEvidenceBundle, AuditProvider } from "./AuditProvider.js";

/**
 * The private WordLift AI Audit response, validated loosely on purpose: the service keeps adding
 * criteria, and an unknown field must never fail a report. Only the fields mapped below are read.
 */
const sectionSchema = z
  .object({
    score: z.number().optional(),
    status: z.string().optional(),
    explanation: z.string().optional(),
  })
  .loose();

const auditResponseSchema = z
  .object({
    success: z.boolean().optional(),
    data: z
      .object({
        url: z.string().optional(),
        domain: z.string().optional(),
        summary: z.string().optional(),
        overallScore: z.number().optional(),
        score: z.number().optional(),
        status: z.string().optional(),
        siteFiles: sectionSchema
          .extend({
            robotsTxt: z.string().optional(),
            llmsTxt: z.string().optional(),
            hasLlmsTxt: z.boolean().optional(),
            hasSkillMd: z.boolean().optional(),
            botStatus: z.array(z.object({ name: z.string(), vendor: z.string().optional(), status: z.string() }).loose()).optional(),
            wellKnown: z
              .object({
                mcpJson: z.boolean().optional(),
                mcpServerCard: z.boolean().optional(),
                webmcpToolsJson: z.boolean().optional(),
                mcpLinkTag: z.boolean().optional(),
                agentSkillsIndex: z.boolean().optional(),
                agentSkillsCount: z.number().optional(),
              })
              .loose()
              .optional(),
          })
          .optional(),
        seoFundamentals: sectionSchema.extend({ title: z.string().optional(), description: z.string().optional() }).optional(),
        structuredData: sectionSchema
          .extend({
            hasJsonLd: z.boolean().optional(),
            detectedSchemas: z.array(z.object({ type: z.string(), format: z.string().optional() }).loose()).optional(),
          })
          .optional(),
        contentStructure: sectionSchema.optional(),
        imageAccessibility: sectionSchema.optional(),
        automationReadiness: sectionSchema
          .extend({
            issues: z
              .array(z.object({ priority: z.string().optional(), criterion: z.string().optional(), what: z.string().optional() }).loose())
              .optional(),
          })
          .optional(),
        jsRendering: sectionSchema
          .extend({ frameworkDetected: z.string().optional(), renderingType: z.string().optional() })
          .optional(),
        quickWins: sectionSchema
          .extend({ wins: z.array(z.object({ title: z.string(), impact: z.string().optional() }).loose()).optional() })
          .optional(),
        /** The documented API shape nests criteria here; newer deployments also return them flat. */
        results: z.record(z.string(), z.unknown()).optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type WordLiftAuditResponse = z.infer<typeof auditResponseSchema>;
type AuditData = NonNullable<WordLiftAuditResponse["data"]>;

export interface WordLiftAuditOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

/** Raised when the private audit cannot produce evidence; the orchestrator degrades honestly. */
export class AuditProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AuditProviderError";
  }
}

export class WordLiftAuditProvider implements AuditProvider {
  readonly name = "wordlift-ai-audit";

  constructor(private readonly options: WordLiftAuditOptions) {}

  async audit(url: URL): Promise<AuditEvidenceBundle> {
    const response = await this.call(url);
    const data = response.data;
    if (!data) {
      throw new AuditProviderError("audit_empty_response", "The audit service returned no data for this site.", true);
    }

    const collectedAt = (this.options.now?.() ?? new Date()).toISOString();
    const site = data.url ?? url.toString();
    const normalized = normalizeAuditData(data);

    return {
      url: site,
      status: "completed",
      foundation: this.foundation(normalized, collectedAt, site),
      signals: signalsFrom(normalized),
      evidence: sanitizeEvidence(evidenceFrom(normalized, site, collectedAt)).evidence,
      errors: [],
    };
  }

  private async call(url: URL): Promise<WordLiftAuditResponse> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = new URL("/audit", this.options.baseUrl).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 150_000);

    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Key ${this.options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ url: url.toString() }),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        throw new AuditProviderError("audit_unauthorized", "The audit service rejected this deployment's credentials.", false);
      }
      if (response.status === 429) {
        throw new AuditProviderError("audit_rate_limited", "The audit service is rate limiting this deployment.", true);
      }
      if (!response.ok) {
        throw new AuditProviderError("audit_upstream_error", `The audit service returned status ${response.status}.`, true);
      }

      return auditResponseSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof AuditProviderError) throw error;
      if (controller.signal.aborted) {
        throw new AuditProviderError("audit_timeout", "The audit service took too long to respond.", true);
      }
      if (error instanceof z.ZodError) {
        throw new AuditProviderError("audit_invalid_response", "The audit service returned an unreadable response.", false);
      }
      throw new AuditProviderError("audit_unreachable", "The audit service could not be reached.", true);
    } finally {
      clearTimeout(timer);
    }
  }

  private foundation(
    data: NonNullable<WordLiftAuditResponse["data"]>,
    collectedAt: string,
    sourceUrl: string,
  ): FoundationAuditSummary | undefined {
    const score = data.overallScore ?? data.score;
    if (typeof score !== "number") return undefined;
    return {
      score: Math.max(0, Math.min(100, Math.round(score))),
      summary: clip(data.summary ?? "The foundation audit completed without a written summary.", 2_000),
      findings: findingsFrom(data),
      sections: detailedSections(data),
      quickWins: (data.quickWins?.wins ?? []).slice(0, 30).map((win) => ({
        title: clip(win.title, 300),
        impact: win.impact ? clip(win.impact, 120) : undefined,
      })),
      botAccess: (data.siteFiles?.botStatus ?? [])
        .filter((bot) => bot.name && bot.status)
        .slice(0, 12)
        .map((bot) => ({
          name: clip(bot.name, 60),
          ...(bot.vendor ? { vendor: clip(bot.vendor, 60) } : {}),
          status: clip(bot.status, 40),
        })),
      provider: "wordlift-ai-audit",
      collectedAt,
      sourceUrl,
    };
  }
}

/** Accept both the documented `data.results` envelope and the newer flat response shape. */
function normalizeAuditData(data: AuditData): AuditData {
  const nested = isRecord(data.results) ? data.results : {};
  const normalized = { ...nested, ...data } as AuditData;

  normalized.summary ??= stringValue(nested.summary);
  normalized.overallScore ??= numberValue(nested.score);
  normalized.contentStructure ??= recordValue(nested.semanticHtml) as AuditData["contentStructure"];
  normalized.automationReadiness ??= recordValue(nested.automation) as AuditData["automationReadiness"];
  normalized.structuredData ??= recordValue(nested.structuredData) as AuditData["structuredData"];
  normalized.imageAccessibility ??= recordValue(nested.imageAccessibility) as AuditData["imageAccessibility"];
  normalized.jsRendering ??= recordValue(nested.jsRendering) as AuditData["jsRendering"];

  if (!normalized.siteFiles) {
    const robots = recordValue(nested.robotsTxt);
    const llms = recordValue(nested.llmsTxt);
    if (robots || llms) {
      normalized.siteFiles = {
        robotsTxt: stringValue(robots?.status),
        llmsTxt: stringValue(llms?.status),
        hasLlmsTxt: stringValue(llms?.status) === "found",
        status: stringValue(robots?.status),
      };
    }
  }
  return normalized;
}

function clip(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function findingsFrom(data: AuditData): string[] {
  const findings: string[] = [];
  for (const win of data.quickWins?.wins ?? []) {
    findings.push(clip(`Quick win: ${win.title}${win.impact ? ` (${win.impact} impact)` : ""}`, 600));
  }
  for (const issue of data.automationReadiness?.issues ?? []) {
    findings.push(clip(`Automation gap: ${issue.criterion ?? "Agent readiness"} — ${issue.what ?? ""}`.trim(), 600));
  }
  for (const [label, section] of sections(data)) {
    if (section?.status && section.status !== "Unknown") {
      findings.push(clip(`${label}: ${section.status}${section.score === undefined ? "" : ` (${section.score})`}`, 600));
    }
    for (const detail of safeSectionDetails(section ?? {})) {
      if (/recommendation|issue|error|missing|warning/i.test(detail.label)) {
        findings.push(clip(`${label} — ${detail.label}: ${detail.value}`, 600));
      }
    }
  }
  return [...new Set(findings)].slice(0, 60);
}

function sections(data: AuditData): Array<[string, Record<string, unknown> | undefined]> {
  return sectionEntries(data).map((entry) => [entry.label, entry.section]);
}

function detailedSections(data: AuditData): NonNullable<FoundationAuditSummary["sections"]> {
  return sectionEntries(data).flatMap(({ id, label, section }) => {
    if (!section) return [];
    const score = typeof section.score === "number" ? section.score : undefined;
    const status = typeof section.status === "string" ? clip(section.status, 120) : undefined;
    const explanation = typeof section.explanation === "string" ? clip(section.explanation, 1_000) : undefined;
    return [{ id, label, score, status, explanation, details: safeSectionDetails(section) }];
  });
}

const SECTION_DEFINITIONS: Array<{ key: string; id: string; label: string; aliases?: string[] }> = [
  { key: "siteFiles", id: "site-files", label: "Site files & agent discovery", aliases: ["robotsTxt", "llmsTxt"] },
  { key: "seoFundamentals", id: "seo-fundamentals", label: "SEO fundamentals" },
  { key: "structuredData", id: "structured-data", label: "Structured data inventory" },
  { key: "contentStructure", id: "content-structure", label: "Content structure & token budget", aliases: ["semanticHtml"] },
  { key: "imageAccessibility", id: "image-accessibility", label: "Image accessibility" },
  { key: "automationReadiness", id: "automation-readiness", label: "Automation readiness", aliases: ["automation"] },
  { key: "jsRendering", id: "javascript-rendering", label: "JavaScript rendering" },
];

const RESERVED_AUDIT_KEYS = new Set([
  "url", "domain", "timestamp", "status", "accountId", "accountUrl", "summary", "overallScore", "score", "success",
  "quickWins", "results",
]);

function sectionEntries(data: AuditData) {
  const record = data as Record<string, unknown>;
  const consumed = new Set<string>();
  const entries: Array<{ id: string; label: string; section: Record<string, unknown> }> = [];

  for (const definition of SECTION_DEFINITIONS) {
    consumed.add(definition.key);
    for (const alias of definition.aliases ?? []) consumed.add(alias);
    const section = recordValue(record[definition.key]);
    if (section) entries.push({ id: definition.id, label: definition.label, section });
  }

  for (const [key, value] of Object.entries(record)) {
    if (consumed.has(key) || RESERVED_AUDIT_KEYS.has(key)) continue;
    const section = recordValue(value);
    if (!section || safeSectionDetails(section).length === 0) continue;
    entries.push({ id: slug(key), label: humanize(key), section });
  }

  return entries.slice(0, 24);
}

/** Preserves every bounded, display-safe scalar while excluding raw bodies and secret-like fields. */
function safeSectionDetails(section: Record<string, unknown>) {
  return Object.entries(section)
    .filter(([key]) => !["score", "status", "explanation"].includes(key))
    .flatMap(([key, value]) => flattenDetail(value, [humanize(key)], 0))
    .slice(0, 80);
}

const BLOCKED_DETAIL_KEYS = /^(rawHtml|html|pageHtml|pageSource|sourceHtml|body|content|markdown|screenshot|base64|apiKey|authorization|cookie|token)$/i;

function flattenDetail(value: unknown, path: string[], depth: number): Array<{ label: string; value: string }> {
  if (value === undefined || value === null || value === "" || depth > 4) return [];
  if (["string", "number", "boolean"].includes(typeof value)) {
    return [{ label: path.join(" · "), value: clip(String(value), 600) }];
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).flatMap((entry, index) =>
      flattenDetail(entry, value.length === 1 ? path : [...path, String(index + 1)], depth + 1),
    );
  }
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([key]) => !BLOCKED_DETAIL_KEYS.test(key))
    .slice(0, 40)
    .flatMap(([key, entry]) => flattenDetail(entry, [...path, humanize(key)], depth + 1));
}

function humanize(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase());
}

function slug(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Behavioral signals for deterministic archetype inference. */
export function signalsFrom(data: NonNullable<WordLiftAuditResponse["data"]>): string[] {
  const signals = new Set<string>();

  for (const schema of data.structuredData?.detectedSchemas ?? []) {
    if (schema.type) signals.add(`schema:${schema.type}`);
  }
  const wellKnown = data.siteFiles?.wellKnown;
  if (data.siteFiles?.hasLlmsTxt) signals.add("agent:llms-txt");
  if (data.siteFiles?.hasSkillMd) signals.add("agent:skill-md");
  if (wellKnown?.mcpJson) signals.add("agent:mcp-json");
  if (wellKnown?.mcpServerCard) signals.add("agent:mcp-server-card");
  if (wellKnown?.webmcpToolsJson) signals.add("agent:well-known-tools-json");
  if (wellKnown?.agentSkillsIndex) signals.add("agent:agent-skills");
  if (data.jsRendering?.frameworkDetected) signals.add(`framework:${data.jsRendering.frameworkDetected}`);

  return [...signals].sort();
}

/**
 * Turns audit findings into typed evidence. Everything here is `declared`: the audit observes that
 * an interface is announced, never that an agent successfully called it.
 */
export function evidenceFrom(
  data: NonNullable<WordLiftAuditResponse["data"]>,
  siteUrl: string,
  collectedAt: string,
): CapabilityEvidence[] {
  const evidence: CapabilityEvidence[] = [];
  const base = { audience: "agent" as const, verification: "declared" as const, collectedAt };
  const origin = safeOrigin(siteUrl);

  const push = (item: Omit<CapabilityEvidence, "audience" | "verification" | "collectedAt">) =>
    evidence.push({ ...base, ...item });

  for (const schema of data.structuredData?.detectedSchemas ?? []) {
    for (const actionId of SCHEMA_ACTION_MAP[schema.type] ?? []) {
      push({
        id: `schema-${schema.type}-${actionId}`,
        actionId,
        kind: "structured-data",
        sourceUrl: siteUrl,
        claim: `${schema.type} is published as ${schema.format ?? "structured data"}`,
        confidence: 0.9,
      });
    }
  }

  const wellKnown = data.siteFiles?.wellKnown;
  if (data.siteFiles?.hasLlmsTxt) {
    push({
      id: "discovery-llms-txt",
      actionId: "site.browse",
      kind: "discovery",
      sourceUrl: `${origin}/llms.txt`,
      claim: "The site publishes llms.txt so agents can find its content",
      confidence: 0.8,
    });
  }
  if (data.siteFiles?.hasSkillMd) {
    push({
      id: "discovery-skill-md",
      actionId: "site.browse",
      kind: "discovery",
      sourceUrl: `${origin}/skill.md`,
      claim: "The site publishes a skill description for agents",
      confidence: 0.8,
    });
  }
  if (wellKnown?.mcpJson || wellKnown?.mcpServerCard) {
    push({
      id: "discovery-mcp",
      actionId: "site.search",
      kind: "discovery",
      sourceUrl: `${origin}/.well-known/mcp.json`,
      claim: "An MCP discovery document is declared at .well-known",
      confidence: 0.75,
    });
  }
  return evidence;
}

function safeOrigin(siteUrl: string): string {
  try {
    return new URL(siteUrl).origin;
  } catch {
    return siteUrl.replace(/\/$/, "");
  }
}

export function auditErrorToReportError(error: unknown, phase: ReportError["phase"] = "understanding"): ReportError {
  if (error instanceof AuditProviderError) {
    return { code: error.code, phase, provider: "wordlift-ai-audit", message: error.message, retryable: error.retryable };
  }
  return {
    code: "audit_failed",
    phase,
    provider: "wordlift-ai-audit",
    message: "The foundation audit could not be completed.",
    retryable: true,
  };
}

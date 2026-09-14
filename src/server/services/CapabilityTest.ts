import type { CapabilityEvidence, ReportRecord } from "../../shared/types/index.js";
import { reflects } from "../adapters/scrape/entryPoints.js";
import { callMcpTool, openMcpSession } from "../adapters/scrape/mcpProbe.js";
import { isSafeToCall, type JsonSchema } from "../adapters/scrape/mcpToolCalls.js";
import { ReportRequestError } from "../errors.js";
import { safeFetch, type UrlPolicyOptions } from "../security/urlPolicy.js";
import type { AuditOrchestrator } from "./AuditOrchestrator.js";

/**
 * A person's own call on one capability's interface: what the audit does when it verifies, with
 * the inputs the audit would not invent supplied by the person. The same gate applies, a tool is
 * called only when its server marks it read-only and its name carries no verb of consequence, and
 * a declared entry point only when it is a read over GET on the site's own address; one call per
 * click; the outcome is reported as it came; and it becomes evidence only when the person says
 * so, as a new immutable version of the report, readiness moving the way the evidence says.
 * In-page WebMCP tools are detected and never called: no server can reach them.
 */
export interface TestableInterface {
  id: string;
  name: string;
  protocol: "mcp" | "sidecar" | "http-get";
  endpoint: string;
  safe: boolean;
  note?: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface CapabilityTestOutcome {
  outcome: "answered" | "failed";
  latencyMs: number;
  answer: string;
  error?: string;
  request: { endpoint: string; tool: string; arguments: Record<string, unknown> };
  testedAt: string;
  updatedReportId?: string;
  updatedReportUrl?: string;
}

const SIDECAR_HOST = "alpina.travel";
const SIDECAR_INTERFACE: TestableInterface = {
  id: "sidecar:alpina-availability",
  name: "Check availability through the WordLift sidecar",
  protocol: "sidecar",
  endpoint: "/api/sidecars/alpina/availability",
  safe: true,
  description: "The approved read-only sidecar: dates and guests in, availability out. No booking, no hold, no guest data.",
  inputSchema: {
    type: "object",
    properties: {
      checkIn: { type: "string", format: "date", description: "First night" },
      checkOut: { type: "string", format: "date", description: "Morning of departure" },
      adults: { type: "integer", minimum: 1, maximum: 6, default: 2 },
    },
    required: ["checkIn", "checkOut", "adults"],
  } as JsonSchema,
};
const MAX_ENDPOINTS = 3;
const MAX_TEMPLATES = 3;
const CALL_TIMEOUT_MS = 20_000;
const ANSWER_CHARACTERS = 1_200;
const PAGE_BYTES = 1_000_000;
/** A placeholder as a schema.org template writes it, an RFC 6570 operator allowed in front. */
const PLACEHOLDER = /\{([?&+#./;]?)([A-Za-z0-9_.-]{1,64})\}/g;

const NOTES: Record<string, string> = {
  "not annotated read-only": "The server does not mark this tool read-only, so it is not called from here.",
  "annotated destructive": "The server marks this tool destructive, so it is not called from here.",
  "the name implies a transaction": "The name implies a transaction, so it is not called from here.",
};

export class CapabilityTestService {
  constructor(
    private readonly orchestrator: AuditOrchestrator,
    private readonly options: UrlPolicyOptions & { timeoutMs?: number } = {},
  ) {}

  /** What a person can call on this capability, live from the site's own server. */
  async list(reportId: string, actionId: string): Promise<{ interfaces: TestableInterface[] }> {
    const { report } = await this.capability(reportId, actionId);
    const interfaces: TestableInterface[] = [];
    if (actionId === "availability.check" && hostOf(report) === SIDECAR_HOST) interfaces.push(SIDECAR_INTERFACE);
    for (const entry of getTemplatesDeclared(report, actionId)) interfaces.push(templateInterface(entry));
    const declared = mcpToolsDeclared(report, actionId);
    for (const [endpoint, names] of [...declared.entries()].slice(0, MAX_ENDPOINTS)) {
      const session = await this.session(endpoint);
      if (!session.initialized) {
        interfaces.push({ id: `mcp:${endpoint}`, name: session.serverName || endpoint, protocol: "mcp", endpoint, safe: false, note: `The server could not be reached: ${session.error ?? "it did not answer"}.` });
        continue;
      }
      for (const tool of session.tools.filter((candidate) => names.has(candidate.name))) {
        const { safe, note } = isSafeToCall(tool);
        interfaces.push({
          id: interfaceId(endpoint, tool.name),
          name: tool.name,
          protocol: "mcp",
          endpoint,
          safe,
          ...(note ? { note: NOTES[note] ?? note } : {}),
          ...(tool.description ? { description: tool.description } : {}),
          ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
        });
      }
    }
    return { interfaces };
  }

  /** One call, with the person's inputs; evidence only on request. */
  async run(reportId: string, actionId: string, input: { interfaceId: string; arguments: Record<string, unknown>; save?: boolean }): Promise<CapabilityTestOutcome> {
    const { report } = await this.capability(reportId, actionId);
    const target = parseInterfaceId(input.interfaceId);
    if (!target) throw new ReportRequestError("That is not an interface this report names.", 400);
    if (target.kind === "http-get") return this.runTemplate(report, actionId, target.template, input);
    // Only what the report itself names for this action is ever called: never an address a caller supplies.
    if (!(mcpToolsDeclared(report, actionId).get(target.endpoint)?.has(target.tool))) {
      throw new ReportRequestError(`This report does not name an MCP tool "${target.tool}" at that address for this action.`, 404);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? CALL_TIMEOUT_MS);
    const started = Date.now();
    try {
      const session = await openMcpSession(new URL(target.endpoint), controller, this.options);
      if (!session.initialized) throw new ReportRequestError(`The server could not be reached: ${session.error ?? "it did not answer"}.`, 502);
      const tool = session.tools.find((candidate) => candidate.name === target.tool);
      if (!tool) throw new ReportRequestError(`The server no longer lists a tool "${target.tool}".`, 404);
      const { safe, note } = isSafeToCall(tool);
      if (!safe) throw new ReportRequestError(NOTES[note ?? ""] ?? `This tool is not safe to call: ${note}.`, 409);
      const call = await callMcpTool(new URL(target.endpoint), controller, this.options, session.session, tool.name, input.arguments);
      const latencyMs = Date.now() - started;
      const testedAt = new Date().toISOString();
      const outcome: CapabilityTestOutcome = {
        outcome: call.ok ? "answered" : "failed",
        latencyMs,
        answer: answerText(call.result),
        ...(call.error ? { error: call.error } : {}),
        request: { endpoint: target.endpoint, tool: tool.name, arguments: input.arguments },
        testedAt,
      };
      if (input.save) {
        const evidence: CapabilityEvidence = {
          id: `test:${actionId}:${tool.name}:${Date.now()}`.slice(0, 160),
          actionId,
          audience: "agent",
          kind: "tool-result",
          sourceUrl: target.endpoint,
          claim: call.ok
            ? `A person ran the site's MCP tool "${tool.name}" with their own inputs and it answered`
            : `A person ran the site's MCP tool "${tool.name}" with their own inputs and it failed: ${call.error ?? "no answer"}`,
          confidence: 1,
          verification: call.ok ? "invoked" : "failed",
          collectedAt: testedAt,
        };
        const child = await this.orchestrator.attachInvocationEvidence(report.id, [evidence]);
        outcome.updatedReportId = child.id;
        outcome.updatedReportUrl = `/reports/${child.id}`;
      }
      return outcome;
    } catch (error) {
      if (controller.signal.aborted) throw new ReportRequestError("The server did not answer in time.", 504);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One GET on a template the report names for this action, the person's inputs in its
   * placeholders. Judged the way the audit judges it: a 200 whose body acknowledges an input
   * confirms; a 200 that does not is an answer without proof, since results may render in the
   * browser; anything else is a failure. Nothing but the address is sent.
   */
  private async runTemplate(report: ReportRecord, actionId: string, template: string, input: { arguments: Record<string, unknown>; save?: boolean }): Promise<CapabilityTestOutcome> {
    const entry = getTemplatesDeclared(report, actionId).find((candidate) => candidate.template === template);
    if (!entry) throw new ReportRequestError("This report does not name that address for this action.", 404);
    const values: string[] = [];
    const url = template.replace(PLACEHOLDER, (_match, operator: string, name: string) => {
      const value = input.arguments[name];
      if (value === undefined || value === null || String(value).trim() === "") throw new ReportRequestError(`${name} is needed.`, 400);
      values.push(String(value).trim());
      return `${operator === "?" || operator === "&" ? `${operator}${name}=` : ""}${encodeURIComponent(String(value).trim())}`;
    });
    const started = Date.now();
    const testedAt = new Date().toISOString();
    let status = 0;
    let finalUrl = url;
    let acknowledged = false;
    let answer = "";
    let error: string | undefined;
    try {
      const response = await safeFetch(url, { ...this.options, timeoutMs: this.options.timeoutMs ?? CALL_TIMEOUT_MS, maxBytes: PAGE_BYTES });
      status = response.status;
      finalUrl = response.finalUrl;
      const answered = status === 200 && response.body.trim().length > 0;
      acknowledged = answered && (values.length === 0 || values.some((value) => reflects(response.body, value)));
      if (!answered) error = status === 200 ? "It answered with an empty body." : `It answered HTTP ${status}.`;
      answer = [
        `HTTP ${status}`,
        answered ? (acknowledged ? (values.length === 0 ? "The page answered." : "The page acknowledges your input.") : "The page answered but does not mention your input: results may render in the browser, where this call cannot see them.") : "",
        pageExcerpt(response.body, response.contentType),
      ].filter(Boolean).join("\n").slice(0, ANSWER_CHARACTERS);
    } catch (caught) {
      error = caught instanceof Error ? caught.message.slice(0, 160) : "The address could not be called.";
    }
    const outcome: CapabilityTestOutcome = {
      outcome: error ? "failed" : "answered",
      latencyMs: Date.now() - started,
      answer,
      ...(error ? { error } : {}),
      request: { endpoint: url, tool: entry.actionType, arguments: input.arguments },
      testedAt,
    };
    if (input.save) {
      const evidence: CapabilityEvidence = {
        id: `test:${actionId}:${entry.actionType}:${Date.now()}`.slice(0, 160),
        actionId,
        audience: "agent",
        kind: "api-result",
        sourceUrl: finalUrl,
        claim: error
          ? `A person ran the site's declared ${entry.actionType} entry point with their own inputs and it failed: ${error}`
          : acknowledged
            ? `A person ran the site's declared ${entry.actionType} entry point with their own inputs and the site answered for them`
            : `A person ran the site's declared ${entry.actionType} entry point with their own inputs; it answered, but results could not be confirmed without executing site scripts`,
        snippet: template,
        confidence: error ? 0.9 : acknowledged ? 1 : 0.7,
        verification: error ? "failed" : acknowledged ? "invoked" : "declared",
        collectedAt: testedAt,
      };
      const child = await this.orchestrator.attachInvocationEvidence(report.id, [evidence]);
      outcome.updatedReportId = child.id;
      outcome.updatedReportUrl = `/reports/${child.id}`;
    }
    return outcome;
  }

  private async session(endpoint: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? CALL_TIMEOUT_MS);
    try {
      return await openMcpSession(new URL(endpoint), controller, this.options);
    } catch (error) {
      return { initialized: false as const, session: null, serverName: "", tools: [], error: controller.signal.aborted ? "it did not answer in time" : error instanceof Error ? error.message : "it did not answer" };
    } finally {
      clearTimeout(timer);
    }
  }

  private async capability(reportId: string, actionId: string) {
    const report = await this.orchestrator.get(reportId);
    if (!report) throw new ReportRequestError("Report not found or expired", 404, "report_not_found");
    const capability = report.capabilities?.find((candidate) => candidate.actionId === actionId);
    if (!capability) throw new ReportRequestError(`This report has no action "${actionId}".`, 404);
    return { report, capability };
  }
}

/** The MCP tools this report names for the action, by endpoint, on the current transport only. */
function mcpToolsDeclared(report: ReportRecord, actionId: string): Map<string, Set<string>> {
  const byEndpoint = new Map<string, Set<string>>();
  for (const item of report.contextGraph?.interfaces ?? []) {
    if (item.actionId !== actionId || item.protocol !== "mcp" || !item.id.startsWith("interface:mcp-tool-")) continue;
    if (/\/sse\/?$/.test(item.sourceUrl)) continue;
    const names = byEndpoint.get(item.sourceUrl) ?? new Set<string>();
    names.add(item.name);
    byEndpoint.set(item.sourceUrl, names);
  }
  return byEndpoint;
}

interface DeclaredTemplate {
  actionType: string;
  template: string;
  placeholders: string[];
}

/**
 * The GET templates this report names for the action: the site's own schema.org entry points,
 * read ones only, as the audit recorded them with the evidence. A write never carries its
 * template here, so it is never offered. Only the site's own host is ever called.
 */
function getTemplatesDeclared(report: ReportRecord, actionId: string): DeclaredTemplate[] {
  const host = hostOf(report);
  const found: DeclaredTemplate[] = [];
  const capability = report.capabilities?.find((candidate) => candidate.actionId === actionId);
  for (const item of capability?.evidence ?? []) {
    const actionType = item.id.startsWith("search-action-") ? "SearchAction" : /^entry-point-[^-]+-([A-Za-z]+)$/.exec(item.id)?.[1];
    if (!actionType || typeof item.snippet !== "string" || found.some((entry) => entry.template === item.snippet)) continue;
    const placeholders = [...item.snippet.matchAll(PLACEHOLDER)].map((match) => match[2]!);
    let url: URL;
    try {
      url = new URL(item.snippet.replace(PLACEHOLDER, "probe"));
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || url.hostname.replace(/^www\./, "") !== host) continue;
    // A placeholder the pattern does not read would be sent as written: not this template.
    if (/\{/.test(item.snippet.replace(PLACEHOLDER, ""))) continue;
    found.push({ actionType, template: item.snippet, placeholders: [...new Set(placeholders)] });
    if (found.length >= MAX_TEMPLATES) break;
  }
  return found;
}

function templateInterface(entry: DeclaredTemplate): TestableInterface {
  return {
    id: `http-get:${entry.template}`,
    name: entry.actionType,
    protocol: "http-get",
    endpoint: entry.template,
    safe: true,
    description: entry.placeholders.length > 0
      ? `The site's declared schema.org ${entry.actionType}: one GET on the site's own address, your inputs in its placeholders. Nothing but the address is sent.`
      : `The site's declared schema.org ${entry.actionType}: one GET on the site's own address. Nothing but the address is sent.`,
    inputSchema: {
      type: "object",
      properties: Object.fromEntries(entry.placeholders.map((name) => [name, { type: "string", description: `What goes in {${name}}` }])),
      required: entry.placeholders,
    } as JsonSchema,
  };
}

function interfaceId(endpoint: string, tool: string): string {
  return `mcp-tool:${endpoint}#${tool}`;
}

type InterfaceTarget = { kind: "mcp"; endpoint: string; tool: string } | { kind: "http-get"; template: string };

function parseInterfaceId(id: string): InterfaceTarget | null {
  const template = /^http-get:(.+)$/.exec(id);
  if (template) return { kind: "http-get", template: template[1]! };
  const match = /^mcp-tool:(.+)#([^#]+)$/.exec(id);
  return match ? { kind: "mcp", endpoint: match[1]!, tool: match[2]! } : null;
}

/** What the page said, as text a person reads: JSON as it came, a page without its markup, bounded. */
export function pageExcerpt(body: string, contentType: string): string {
  if (/json/i.test(contentType)) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2).slice(0, ANSWER_CHARACTERS);
    } catch {
      return body.slice(0, ANSWER_CHARACTERS);
    }
  }
  return body
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(nbsp|#160);/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ANSWER_CHARACTERS);
}

/** The answer as text a person reads: the text parts of the result, else the result as JSON, bounded. */
export function answerText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (Array.isArray(content)) {
    const texts = content.map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")).filter(Boolean);
    if (texts.length > 0) return texts.join("\n").slice(0, ANSWER_CHARACTERS);
  }
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  try {
    return JSON.stringify(structured ?? result, null, 2).slice(0, ANSWER_CHARACTERS);
  } catch {
    return "";
  }
}

function hostOf(report: ReportRecord): string {
  try {
    return new URL(report.canonicalUrl ?? report.requestedUrl).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

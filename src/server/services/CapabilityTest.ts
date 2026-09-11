import type { CapabilityEvidence, ReportRecord } from "../../shared/types/index.js";
import { callMcpTool, openMcpSession } from "../adapters/scrape/mcpProbe.js";
import { isSafeToCall, type JsonSchema } from "../adapters/scrape/mcpToolCalls.js";
import { ReportRequestError } from "../errors.js";
import type { UrlPolicyOptions } from "../security/urlPolicy.js";
import type { AuditOrchestrator } from "./AuditOrchestrator.js";

/**
 * A person's own call on one capability's interface: what the audit does when it verifies, with
 * the inputs the audit would not invent supplied by the person. The same gate applies, a tool is
 * called only when its server marks it read-only and its name carries no verb of consequence;
 * one call per click; the outcome is reported as it came; and it becomes evidence only when the
 * person says so, as a new immutable version of the report, readiness moving the way the
 * evidence says.
 */
export interface TestableInterface {
  id: string;
  name: string;
  protocol: "mcp" | "sidecar";
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
const CALL_TIMEOUT_MS = 20_000;
const ANSWER_CHARACTERS = 1_200;

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

function interfaceId(endpoint: string, tool: string): string {
  return `mcp-tool:${endpoint}#${tool}`;
}

function parseInterfaceId(id: string): { endpoint: string; tool: string } | null {
  const match = /^mcp-tool:(.+)#([^#]+)$/.exec(id);
  return match ? { endpoint: match[1]!, tool: match[2]! } : null;
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

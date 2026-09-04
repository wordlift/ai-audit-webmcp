import type { ZodType } from "zod";
import {
  auditRunningText,
  auditSummaryText,
  capabilitySummaryText,
  describeCapabilityForAgent,
  inspectServiceMap,
  inspectSummaryText,
  summarizeReportForAgent,
  summarizeRunningReport,
  type AuditRunningResult,
  type AuditToolResult,
  type CapabilityToolResult,
  type InspectServiceMapResult,
} from "../../shared/format/agentSummary.js";
import { explainReportError, visibleErrors } from "../../shared/format/explainError.js";
import {
  foundationAuditForAgent,
  foundationAuditText,
  refineSummaryText,
  refineToolResult,
  type FoundationAuditToolResult,
  type RefineToolResult,
} from "../../shared/format/toolResults.js";
import { humanAssertionSchema } from "../../shared/schemas/report.js";
import {
  auditWebsiteInputSchema,
  explainCapabilityInputSchema,
  reportScopedInputSchema,
} from "../../shared/tools/inputs.js";
import type { ReportRecord } from "../../shared/types/index.js";
import {
  claimMatches,
  hashClaimToken,
  newClaimToken,
  type ClaimStore,
} from "../adapters/claims/index.js";
import type { AuditOrchestrator } from "./AuditOrchestrator.js";
import { DeepScanGate, newReportId } from "./DeepScanGate.js";
import { reportNotFound, reportStillRunning, ToolCallError } from "./toolErrors.js";

/**
 * The audit as a set of tool calls, with no transport in it.
 *
 * The browser's WebMCP tools, the REST API, and the remote MCP server are three ways of reaching
 * the same six answers. This is where those answers are composed — once — so a remote caller and
 * an agent standing on the page cannot be told different things about the same report. Every
 * result shape here is the one the browser already returns, built by the same shared formatters.
 */

/** How long a tool call waits for a whole audit before answering with something pollable instead. */
const DEFAULT_GRACE_MS = 25_000;

export interface AuditToolServiceOptions {
  graceMs?: number;
  /** Test seam: how the grace window is waited out. */
  wait?: (ms: number) => Promise<void>;
  /** Which surface the caller is standing on, recorded with a deep scan's address. */
  source?: "web" | "webmcp" | "mcp";
  /**
   * Where this surface's report claims live. With a store, the caller that ran an audit is handed
   * a claim and is the only one who can refine that report; without one, refinement is open, which
   * is what the in-page surface has always been.
   */
  claims?: ClaimStore;
  /** How long a claim outlives its report's creation. Matches the report TTL. */
  claimTtlDays?: number;
}

export interface ToolAnswer<T> {
  /** What a model reads. */
  text: string;
  /** What a program reads. */
  structured: T;
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export class AuditToolService {
  constructor(
    private readonly orchestrator: AuditOrchestrator,
    private readonly options: AuditToolServiceOptions = {},
    private readonly deepScan: DeepScanGate = new DeepScanGate(null),
  ) {}

  /**
   * Starts an audit and answers with the finished report when it arrives inside the grace window.
   * A slower site answers with the report id and its phase — never "audit started" dressed up as a
   * result — and the audit keeps running behind the answer, so `get-audit-report` completes it.
   */
  async auditWebsite(input: unknown): Promise<ToolAnswer<AuditToolResult | AuditRunningResult>> {
    const { url, archetype, depth, email } = parse(auditWebsiteInputSchema, input);
    const reportId = newReportId();

    // The exchange is settled before any crawling happens: a deep scan that fails still knows
    // whose address it owes a report to.
    const access = await this.deepScan.authorize({
      reportId,
      reportUrl: this.orchestrator.reportUrl(reportId),
      depth,
      email,
      source: this.options.source ?? "mcp",
    });

    const claimToken = await this.issueClaim(reportId);

    const running = this.orchestrator
      .create({ requestId: reportId, url, archetypeOverride: archetype ?? null, depth: access.depth })
      .then((report) => ({ report }) as const, (error: unknown) => ({ error }) as const);

    const wait = this.options.wait ?? sleep;
    const outcome = await Promise.race([running, wait(this.options.graceMs ?? DEFAULT_GRACE_MS).then(() => null)]);

    if (outcome === null) {
      const current = await this.orchestrator.get(reportId).catch(() => null);
      if (current && current.status === "failed") throw auditFailed(url, current);
      if (current && current.status !== "running") return this.finished(current, access.note, claimToken);
      return this.stillRunning(current ?? { id: reportId, phase: "understanding" }, access.note);
    }
    if ("error" in outcome) throw outcome.error;
    if (outcome.report.status === "failed") throw auditFailed(url, outcome.report);
    return this.finished(outcome.report, access.note, claimToken);
  }

  async getAuditReport(input: unknown): Promise<ToolAnswer<AuditToolResult | AuditRunningResult>> {
    const { reportId } = parse(reportScopedInputSchema, input);
    const report = await this.orchestrator.get(reportId);
    if (!report) throw reportNotFound(reportId);
    if (report.status === "running") return this.stillRunning(report);
    if (report.status === "failed") throw auditFailed(report.canonicalUrl ?? report.requestedUrl, report);
    return this.finished(report);
  }

  /** The read half of the refinement loop: everything a reviewer is about to be interviewed on. */
  async inspectTermsOfAction(input: unknown): Promise<ToolAnswer<InspectServiceMapResult>> {
    const report = await this.readable(input);
    if (!report.capabilities || !report.contextGraph) {
      throw new ToolCallError("This report carries no Terms of Action to inspect.", "no_terms_of_action", 409);
    }
    const structured = inspectServiceMap(report, this.orchestrator.reportUrl(report.id));
    return { text: inspectSummaryText(structured), structured };
  }

  async explainCapability(input: unknown): Promise<ToolAnswer<CapabilityToolResult>> {
    const { reportId, actionId } = parse(explainCapabilityInputSchema, input);
    const report = await this.readable({ reportId });
    if (!report.capabilities) {
      throw new ToolCallError("This report carries no capability map.", "no_capability_map", 409);
    }

    const capability = report.capabilities.find((candidate) => candidate.actionId === actionId);
    if (!capability) {
      const known = report.capabilities.map((candidate) => candidate.actionId).join(", ");
      throw new ToolCallError(
        `Report ${report.id} has no action "${actionId}". Known actions: ${known}.`,
        "action_not_found",
        404,
      );
    }

    const structured = describeCapabilityForAgent(
      report,
      capability,
      capability.contract ? this.contractUrl(report.id, capability.actionId) : null,
    );
    return { text: capabilitySummaryText(structured), structured };
  }

  async explainFoundationAudit(input: unknown): Promise<ToolAnswer<FoundationAuditToolResult>> {
    const report = await this.readable(input);
    if (!report.foundationAudit) {
      throw new ToolCallError("This report has no WordLift foundation audit.", "no_foundation_audit", 409);
    }
    const structured = foundationAuditForAgent(report);
    return { text: foundationAuditText(structured), structured };
  }

  /**
   * The write half: a reviewer's decisions become a new immutable child report. The parent is
   * never edited, and no decision here can raise readiness — that still takes invocation evidence.
   */
  async refineTermsOfAction(input: unknown): Promise<ToolAnswer<RefineToolResult>> {
    const { reportId, claimToken, ...rest } = (input ?? {}) as Record<string, unknown>;
    const parent = await this.readable({ reportId });
    await this.assertClaimed(parent.id, claimToken);
    if (!parent.capabilities) {
      throw new ToolCallError("This report carries no Terms of Action to refine.", "no_terms_of_action", 409);
    }

    const parsed = humanAssertionSchema.safeParse(rest);
    if (!parsed.success) {
      const reasons = parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      throw new ToolCallError(
        `The refinement was not applied — fix the input and call again. ${reasons}`,
        "invalid_input",
        400,
      );
    }

    const child = await this.orchestrator.refine(parent.id, parsed.data);
    const structured = refineToolResult(parent, child, parsed.data, this.orchestrator.reportUrl(child.id));
    return { text: refineSummaryText(structured), structured };
  }

  /**
   * Refinement is where a report stops being a machine's reading and becomes a person's published
   * judgment, so it belongs to whoever ran the audit. A report with no claim on file predates this
   * boundary, or was made on a surface that does not issue claims; it stays refinable.
   */
  private async assertClaimed(reportId: string, token: unknown): Promise<void> {
    const claims = this.options.claims;
    if (!claims) return;
    const claim = await claims.get(reportId);
    if (!claim) return;
    if (typeof token === "string" && token.length > 0 && claimMatches(claim, token)) return;
    throw new ToolCallError(
      "This report belongs to the caller that audited it. Pass the claimToken audit-website returned for it, or run audit-website yourself to make a report you can refine.",
      "report_not_yours",
      403,
    );
  }

  /** A report that exists and has something to say. Running and failed reports say so themselves. */
  private async readable(input: unknown): Promise<ReportRecord> {
    const { reportId } = parse(reportScopedInputSchema, input);
    const report = await this.orchestrator.get(reportId);
    if (!report) throw reportNotFound(reportId);
    if (report.status === "running") throw reportStillRunning(report.id, report.phase);
    if (report.status === "failed") {
      throw new ToolCallError(
        "That audit failed, so there are no findings to work with.",
        "report_failed",
        409,
      );
    }
    return report;
  }

  private finished(report: ReportRecord, note?: string | null, claimToken?: string | null): ToolAnswer<AuditToolResult> {
    const base = summarizeReportForAgent(report, this.orchestrator.reportUrl(report.id));
    const withNote = note ? { ...base, notes: [...base.notes, note] } : base;
    const structured = claimToken ? { ...withNote, claimToken } : withNote;
    const claimLine = claimToken
      ? `Keep this claimToken to refine the report later; it is the only proof this audit was yours: ${claimToken}`
      : null;
    return { text: [auditSummaryText(structured), note, claimLine].filter(Boolean).join("\n"), structured };
  }

  /** A claim exists only where a store does, so the in-page surface keeps working as it always has. */
  private async issueClaim(reportId: string): Promise<string | null> {
    const claims = this.options.claims;
    if (!claims) return null;
    const token = newClaimToken();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + (this.options.claimTtlDays ?? 30));
    await claims.put({
      reportId,
      tokenHash: hashClaimToken(token),
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return token;
  }

  private stillRunning(
    report: Pick<ReportRecord, "id" | "phase">,
    note?: string | null,
  ): ToolAnswer<AuditRunningResult> {
    const base = summarizeRunningReport(report, this.orchestrator.reportUrl(report.id));
    const structured = note ? { ...base, note: `${base.note} ${note}` } : base;
    return { text: auditRunningText(structured), structured };
  }

  private contractUrl(reportId: string, actionId: string): string {
    return new URL(
      `/api/reports/${reportId}/contracts/${encodeURIComponent(actionId)}`,
      this.orchestrator.reportUrl(reportId),
    ).toString();
  }
}

function parse<T>(schema: ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const reasons = parsed.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
  throw new ToolCallError(`The call was not made — fix the input and try again. ${reasons}`, "invalid_input", 400);
}

function auditFailed(url: string, report: ReportRecord): ToolCallError {
  const reason =
    visibleErrors(report.errors).map(explainReportError).join(" ") ||
    "No usable evidence could be collected from this site.";
  return new ToolCallError(`The audit could not be completed for ${url}: ${reason}`, "audit_failed", 502);
}

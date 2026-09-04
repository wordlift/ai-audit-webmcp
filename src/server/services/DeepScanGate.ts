import { randomUUID } from "node:crypto";
import type { ScanDepth } from "../../shared/types/index.js";
import { deepScanLeadSchema, type LeadStore } from "../adapters/leads/index.js";
import { describeDepth, maskEmail } from "../../shared/format/deepScan.js";
import { ToolCallError } from "./toolErrors.js";

/**
 * The gate on the one thing the audit charges for.
 *
 * Everything here is free: auditing a URL, reading a report, sharing its link. Reading more of a
 * site than the basic four pages costs an email address, and the finished report is sent to it.
 * The address is recorded before the audit starts — a crash must not lose what someone paid with —
 * and it is recorded beside the report, never inside it.
 */
export interface DeepScanRequest {
  reportId: string;
  reportUrl: string;
  depth?: ScanDepth;
  email?: string;
  source: "web" | "webmcp" | "mcp";
}

export interface DeepScanDecision {
  depth: ScanDepth;
  /** Shown back to the person so they can recognise the address they gave. Never the address. */
  maskedEmail: string | null;
  note: string | null;
}

const ASK_FOR_EMAIL =
  "A deep scan reads more of the site than the free four-page scan, and the finished report is sent to you by email. Ask the person which address to send it to, then call again with depth \"deep\" and that email. The basic scan needs nothing at all.";

export class DeepScanGate {
  constructor(
    private readonly leads: LeadStore | null,
    private readonly ttlDays = 30,
    private readonly now = () => new Date(),
  ) {}

  async authorize(request: DeepScanRequest): Promise<DeepScanDecision> {
    if (request.depth !== "deep") {
      if (request.email) {
        // An address offered for a basic scan buys nothing and is not kept.
        throw new ToolCallError(
          "A basic scan needs no email address. Ask for depth \"deep\" if the person wants the wider scan sent to them.",
          "email_not_needed",
          400,
        );
      }
      return { depth: "basic", maskedEmail: null, note: null };
    }

    const email = request.email?.trim();
    if (!email) throw new ToolCallError(ASK_FOR_EMAIL, "email_required", 400);
    if (!this.leads) {
      throw new ToolCallError(
        "Deep scans are not available on this deployment. Run the basic scan instead.",
        "deep_scan_unavailable",
        503,
      );
    }

    const now = this.now();
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + this.ttlDays);

    const lead = deepScanLeadSchema.safeParse({
      reportId: request.reportId,
      email,
      reportUrl: request.reportUrl,
      source: request.source,
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    if (!lead.success) {
      throw new ToolCallError(
        `That email address does not look valid, so the deep scan was not started. ${ASK_FOR_EMAIL}`,
        "invalid_email",
        400,
      );
    }

    await this.leads.record(lead.data);
    const masked = maskEmail(email);
    return {
      depth: "deep",
      maskedEmail: masked,
      note: `This is a ${describeDepth("deep")}. The finished report will be sent to ${masked}; it is also readable at its own link, which stays public and free.`,
    };
  }
}

/** A report id a caller can be handed before the audit exists, so the lead can be filed first. */
export function newReportId(): string {
  return randomUUID();
}

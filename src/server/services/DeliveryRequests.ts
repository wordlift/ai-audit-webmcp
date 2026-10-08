import { randomUUID } from "node:crypto";
import type { LeadStore } from "../adapters/leads/index.js";
import { deepScanLeadSchema } from "../adapters/leads/index.js";
import { describeDepth, maskEmail } from "../../shared/format/deepScan.js";
import { ToolCallError } from "./toolErrors.js";
import type { ReportDelivery } from "./ReportDelivery.js";

/**
 * The one exchange in the service: an email address, for the report delivered to it.
 *
 * Everything is free and nothing is gated. Auditing a URL, reading a report, sharing its link.
 * An address buys delivery and nothing more; the scan is the same five pages whether or not one
 * is given. The address is recorded beside the report, never inside it, and it is recorded
 * before anything else happens — a crash must not lose what someone handed over — then told to
 * the lead platform at once, so a lead exists even if the audit never lands.
 */
export interface DeliveryRequest {
  reportId: string;
  reportUrl: string;
  /** The site being audited, known before the report exists; the first write names it. */
  siteUrl?: string;
  email?: string;
  source: "web" | "webmcp" | "mcp";
}

export interface DeliveryDecision {
  /** Shown back to the person so they can recognise the address they gave. Never the address. */
  maskedEmail: string | null;
  note: string | null;
}

export class DeliveryRequests {
  constructor(
    private readonly leads: LeadStore | null,
    private readonly ttlDays = 30,
    private readonly now = () => new Date(),
    private readonly delivery: ReportDelivery | null = null,
  ) {}

  /** Files the address, if one was given. An audit never waits on this beyond the write itself. */
  async request(request: DeliveryRequest): Promise<DeliveryDecision> {
    const email = request.email?.trim();
    if (!email) return { maskedEmail: null, note: null };
    if (!this.leads) {
      throw new ToolCallError(
        "Reports cannot be sent by email on this deployment. The report stays readable at its own link.",
        "delivery_unavailable",
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
        "That email address does not look valid, so the report cannot be sent to it. Ask the person for the address to use, or run the audit without one.",
        "invalid_email",
        400,
      );
    }
    await this.leads.record(lead.data);
    // The first of the two writes. It never blocks the person: a lead platform that is down is
    // retried from the ledger, and the audit runs regardless.
    this.delivery?.announce(request.reportId, request.siteUrl);
    const masked = maskEmail(email);
    return {
      maskedEmail: masked,
      note: `This is a ${describeDepth(undefined)}. The finished report will be sent to ${masked}; it is also readable at its own link, which stays public and free.`,
    };
  }
}

/** A report id a caller can be handed before the audit exists, so the address can be filed first. */
export function newReportId(): string {
  return randomUUID();
}

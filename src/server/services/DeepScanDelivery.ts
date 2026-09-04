import { auditSummaryText, summarizeReportForAgent } from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import type { LeadDelivery, LeadStore } from "../adapters/leads/index.js";

/**
 * Sending a deep scan's report to the address that bought it.
 *
 * The lead store is the ledger of what is owed; this is what settles it. A send that fails leaves
 * the lead pending rather than losing it, and the next completed deep scan retries the ones still
 * waiting — so a HubSpot outage delays delivery instead of dropping it.
 *
 * Nothing here blocks an audit. A person waiting for their report should never wait on a marketing
 * platform, and an audit must never fail because one did.
 */
export interface DeepScanDeliveryOptions {
  leads?: LeadStore;
  delivery?: LeadDelivery;
  publicReportUrl(reportId: string): string;
  loadReport(reportId: string): Promise<ReportRecord | null>;
  now?: () => Date;
  /** How many previously failed leads to retry alongside each new delivery. */
  retryBatch?: number;
}

export type DeliveryOutcome = "sent" | "not-owed" | "unavailable" | "failed";

export class DeepScanDelivery {
  constructor(private readonly options: DeepScanDeliveryOptions) {}

  /** True when this deployment can actually send anything. */
  get enabled(): boolean {
    return Boolean(this.options.leads && this.options.delivery);
  }

  async deliverFor(reportId: string): Promise<DeliveryOutcome> {
    const { leads, delivery } = this.options;
    if (!leads || !delivery) return "unavailable";

    const lead = await leads.get(reportId);
    if (!lead || lead.deliveredAt) return "not-owed";

    const report = await this.options.loadReport(reportId);
    if (!report || report.status === "running" || report.status === "failed") return "not-owed";

    try {
      await delivery.deliver(lead, {
        canonicalUrl: report.canonicalUrl ?? report.requestedUrl,
        reportUrl: this.options.publicReportUrl(report.id),
        agentReadinessScore: report.score?.value ?? 0,
        summary: auditSummaryText(summarizeReportForAgent(report, this.options.publicReportUrl(report.id))),
      });
    } catch (error) {
      // The address stays owed. Its owner is never named in a log line.
      console.error(
        "lead_delivery_failed",
        delivery.name,
        reportId,
        error instanceof Error ? error.message : "unknown",
      );
      return "failed";
    }

    await leads.markDelivered(reportId, (this.options.now ?? (() => new Date()))().toISOString());
    return "sent";
  }

  /** Retries what earlier failures left behind. Bounded, and never throws into the caller. */
  async drainPending(limit = this.options.retryBatch ?? 3): Promise<number> {
    const { leads } = this.options;
    if (!leads || !this.enabled || limit <= 0) return 0;

    const pending = await leads.pending(limit).catch(() => []);
    let sent = 0;
    for (const lead of pending) {
      if ((await this.deliverFor(lead.reportId).catch(() => "failed")) === "sent") sent += 1;
    }
    return sent;
  }

  /**
   * The call sites use this: it settles the report that just finished, then quietly retries older
   * debts, and it never rejects — an audit's success does not depend on a marketing platform.
   */
  settle(reportId: string): void {
    if (!this.enabled) return;
    void this.deliverFor(reportId)
      .then(() => this.drainPending())
      .catch(() => undefined);
  }
}

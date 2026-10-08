import { auditSummaryText, summarizeReportForAgent } from "../../shared/format/agentSummary.js";
import type { ReportRecord } from "../../shared/types/index.js";
import type { LeadDelivery, LeadStore } from "../adapters/leads/index.js";
import type { ContextEngine } from "../../shared/schemas/contextEngine.js";
import { leadSignals } from "../../domain/engine/signals.js";

/**
 * Sending a report to the address that asked for it, in two writes.
 *
 * The first, `announce`, goes the moment the address is given: the address and the site, so the
 * lead platform holds a contact even if the audit never lands. The second, `deliverFor`, goes when
 * the report is complete: the score, the summary, the link. The lead store is the ledger of what
 * is owed; this is what settles it. A send that fails leaves the lead pending rather than losing
 * it, and the next completed audit retries the ones still waiting — so a HubSpot outage delays
 * delivery instead of dropping it.
 *
 * Nothing here blocks an audit. A person waiting for their report should never wait on a marketing
 * platform, and an audit must never fail because one did.
 */
export interface ReportDeliveryOptions {
  leads?: LeadStore;
  delivery?: LeadDelivery;
  publicReportUrl(reportId: string): string;
  loadReport(reportId: string): Promise<ReportRecord | null>;
  /** The engine of the report's site, for the qualification signals the delivery carries. */
  engineFor?(report: ReportRecord): Promise<ContextEngine | null>;
  now?: () => Date;
  /** How many previously failed leads to retry alongside each new delivery. */
  retryBatch?: number;
}

export type DeliveryOutcome = "sent" | "not-owed" | "unavailable" | "failed";

export class ReportDelivery {
  constructor(private readonly options: ReportDeliveryOptions) {}

  /** True when this deployment can actually send anything. */
  get enabled(): boolean {
    return Boolean(this.options.leads && this.options.delivery);
  }

  /** The first write, fire-and-forget: a lead that could not be announced is still delivered later. */
  announce(reportId: string, siteUrl?: string): void {
    const { leads, delivery } = this.options;
    if (!leads || !delivery) return;
    void (async () => {
      const lead = await leads.get(reportId);
      if (!lead || lead.announcedAt || lead.deliveredAt) return;
      // Before the record exists the request's own URL is the site; after, the record's.
      const report = await this.options.loadReport(reportId);
      const canonicalUrl = report?.canonicalUrl ?? report?.requestedUrl ?? siteUrl;
      if (!canonicalUrl) return;
      await delivery.announce(lead, { canonicalUrl, reportUrl: this.options.publicReportUrl(reportId) });
      await leads.markAnnounced(reportId, (this.options.now ?? (() => new Date()))().toISOString());
    })().catch((error: unknown) => {
      // Not owed twice: the second write carries everything the first did. Never the address.
      console.error("lead_announce_failed", delivery.name, reportId, error instanceof Error ? error.message : "unknown");
    });
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
        signals: leadSignals(report, (await this.options.engineFor?.(report).catch(() => null)) ?? null),
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

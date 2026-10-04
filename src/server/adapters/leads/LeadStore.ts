import { z } from "zod";

/**
 * Where an email address lives.
 *
 * Not in the report: a report is a public document with a shareable link, and a private
 * identifier does not belong in one. A lead sits beside its report, keyed by report id, with its
 * own expiry, and is only ever read by the delivery system that sends the report to the person
 * who asked for it.
 */
export const deepScanLeadSchema = z
  .object({
    reportId: z.string().uuid(),
    email: z.string().email().max(254),
    reportUrl: z.string().url().max(2_048),
    /** Which surface the person was standing on when they asked. */
    source: z.enum(["web", "webmcp", "mcp"]),
    requestedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    /** Set by the delivery system once the address has opted in. */
    confirmedAt: z.string().datetime().optional(),
    /** Set by the delivery system once the report has actually been sent. */
    deliveredAt: z.string().datetime().optional(),
    /** The person clicked the one link that stops the notes and the re-reads. */
    unsubscribedAt: z.string().datetime().optional(),
    /** When the site was last read again on this address's behalf. */
    watchedAt: z.string().datetime().optional(),
    /** When a note about a movement last went out. */
    movedAt: z.string().datetime().optional(),
    /** The first crawler, and Google's first verified read, are told once each. */
    seenCrawlerAt: z.string().datetime().optional(),
    seenGoogleAt: z.string().datetime().optional(),
  })
  .strict();

/** What Observe records on a lead after a read. */
export type WatchPatch = Partial<Pick<DeepScanLead, "watchedAt" | "movedAt" | "seenCrawlerAt" | "seenGoogleAt">>;

export type DeepScanLead = z.infer<typeof deepScanLeadSchema>;

export interface LeadStore {
  /** Records the exchange before the audit runs, so a crash cannot lose the address. */
  record(lead: DeepScanLead): Promise<DeepScanLead>;
  get(reportId: string): Promise<DeepScanLead | null>;
  /**
   * The queue the delivery system drains: addresses whose report has not been sent yet. HubSpot
   * owns the sending; this store owns knowing what is still owed.
   */
  pending(limit?: number): Promise<DeepScanLead[]>;
  markConfirmed(reportId: string, at: string): Promise<DeepScanLead | null>;
  markDelivered(reportId: string, at: string): Promise<DeepScanLead | null>;
  /**
   * The addresses Observe may act for: delivered, not unsubscribed, not expired; the never-read
   * first, then the longest since. Bounded, because it bounds the cost of a tick.
   */
  watchable(limit?: number): Promise<DeepScanLead[]>;
  markWatched(reportId: string, patch: WatchPatch): Promise<DeepScanLead | null>;
  markUnsubscribed(reportId: string, at: string): Promise<DeepScanLead | null>;
}

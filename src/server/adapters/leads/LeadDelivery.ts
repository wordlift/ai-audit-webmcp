import type { DeepScanLead } from "./LeadStore.js";
import type { LeadSignals } from "../../../domain/engine/signals.js";

/**
 * What the delivery system is allowed to know about a report.
 *
 * Deliberately four fields. A report contains entities, evidence, contracts and findings; a
 * marketing platform needs the address it is writing to, the site that was audited, the headline
 * number, and a summary a person can read. Narrowing it here means no future adapter can quietly
 * start shipping the rest.
 */
export interface DeliverableReport {
  canonicalUrl: string;
  reportUrl: string;
  agentReadinessScore: number;
  summary: string;
  /** What this is about: the report itself (the default), or what moved since. Names the send, adds no data. */
  subject?: "report" | "movement";
  /** Counts and states for qualification: the shape of the business and its engine, never its content. */
  signals?: LeadSignals;
}

export class LeadDeliveryError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LeadDeliveryError";
  }
}

/** What the lead platform may know the moment an address is given: the site, and where the report will be. */
export interface AnnouncedReport {
  canonicalUrl: string;
  reportUrl: string;
}

export interface LeadDelivery {
  /** Named in logs, so an operator can tell which system was asked and refused. */
  readonly name: string;
  /**
   * The first of two writes: the address and the site, as soon as the address is given, so a
   * lead exists even if the audit never lands. The second, `deliver`, carries the result.
   */
  announce(lead: DeepScanLead, report: AnnouncedReport): Promise<void>;
  deliver(lead: DeepScanLead, report: DeliverableReport): Promise<void>;
}

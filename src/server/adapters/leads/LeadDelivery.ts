import type { DeepScanLead } from "./LeadStore.js";

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

export interface LeadDelivery {
  /** Named in logs, so an operator can tell which system was asked and refused. */
  readonly name: string;
  deliver(lead: DeepScanLead, report: DeliverableReport): Promise<void>;
}

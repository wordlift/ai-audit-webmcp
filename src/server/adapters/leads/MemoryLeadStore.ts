import { deepScanLeadSchema, type DeepScanLead, type LeadStore } from "./LeadStore.js";

export class MemoryLeadStore implements LeadStore {
  readonly #leads = new Map<string, DeepScanLead>();

  constructor(private readonly now = () => new Date()) {}

  async record(input: DeepScanLead): Promise<DeepScanLead> {
    const lead = deepScanLeadSchema.parse(input);
    // The same person asking twice for the same report is one lead, not two.
    const existing = this.#leads.get(lead.reportId);
    const stored = existing ? { ...lead, confirmedAt: existing.confirmedAt, deliveredAt: existing.deliveredAt } : lead;
    this.#leads.set(lead.reportId, stored);
    return structuredClone(stored);
  }

  async get(reportId: string): Promise<DeepScanLead | null> {
    const lead = this.#leads.get(reportId);
    if (!lead || new Date(lead.expiresAt) <= this.now()) return null;
    return structuredClone(lead);
  }

  async pending(limit = 50): Promise<DeepScanLead[]> {
    const now = this.now();
    return [...this.#leads.values()]
      .filter((lead) => !lead.deliveredAt && new Date(lead.expiresAt) > now)
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))
      .slice(0, limit)
      .map((lead) => structuredClone(lead));
  }

  async markConfirmed(reportId: string, at: string): Promise<DeepScanLead | null> {
    return this.#mark(reportId, { confirmedAt: at });
  }

  async markDelivered(reportId: string, at: string): Promise<DeepScanLead | null> {
    return this.#mark(reportId, { deliveredAt: at });
  }

  async #mark(reportId: string, patch: Partial<DeepScanLead>): Promise<DeepScanLead | null> {
    const lead = this.#leads.get(reportId);
    if (!lead) return null;
    const updated = deepScanLeadSchema.parse({ ...lead, ...patch });
    this.#leads.set(reportId, updated);
    return structuredClone(updated);
  }
}

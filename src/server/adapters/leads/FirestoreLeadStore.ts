import { Firestore } from "@google-cloud/firestore";
import { deepScanLeadSchema, type DeepScanLead, type LeadStore } from "./LeadStore.js";

/**
 * Leads live in their own collection, apart from reports, so nothing that serves a public report
 * ever reads an address. `expiresAt` carries the same TTL policy the reports collection uses.
 */
export class FirestoreLeadStore implements LeadStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly now = () => new Date(),
  ) {}

  static fromProject(projectId?: string) {
    return new FirestoreLeadStore(new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }));
  }

  private get collection() {
    return this.firestore.collection("deepScanLeads");
  }

  async record(input: DeepScanLead): Promise<DeepScanLead> {
    const lead = deepScanLeadSchema.parse(input);
    const reference = this.collection.doc(lead.reportId);
    const snapshot = await reference.get();
    const existing = snapshot.exists ? deepScanLeadSchema.parse(snapshot.data()) : null;
    const stored = existing
      ? { ...lead, confirmedAt: existing.confirmedAt, deliveredAt: existing.deliveredAt }
      : lead;
    await reference.set(stored);
    return stored;
  }

  async get(reportId: string): Promise<DeepScanLead | null> {
    const snapshot = await this.collection.doc(reportId).get();
    if (!snapshot.exists) return null;
    const lead = deepScanLeadSchema.parse(snapshot.data());
    return new Date(lead.expiresAt) > this.now() ? lead : null;
  }

  async pending(limit = 50): Promise<DeepScanLead[]> {
    const snapshot = await this.collection.orderBy("requestedAt").limit(limit * 2).get();
    const now = this.now();
    return snapshot.docs
      .map((document) => deepScanLeadSchema.parse(document.data()))
      .filter((lead) => !lead.deliveredAt && new Date(lead.expiresAt) > now)
      .slice(0, limit);
  }

  async markConfirmed(reportId: string, at: string): Promise<DeepScanLead | null> {
    return this.#mark(reportId, { confirmedAt: at });
  }

  async markDelivered(reportId: string, at: string): Promise<DeepScanLead | null> {
    return this.#mark(reportId, { deliveredAt: at });
  }

  async #mark(reportId: string, patch: Partial<DeepScanLead>): Promise<DeepScanLead | null> {
    const reference = this.collection.doc(reportId);
    const snapshot = await reference.get();
    if (!snapshot.exists) return null;
    const updated = deepScanLeadSchema.parse({ ...deepScanLeadSchema.parse(snapshot.data()), ...patch });
    await reference.set(updated);
    return updated;
  }
}

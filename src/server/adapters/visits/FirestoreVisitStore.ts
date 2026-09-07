import { FieldValue, Firestore } from "@google-cloud/firestore";
import { parseActivationKey, type ActivationCount, type DayVisits, type VisitCounts, type VisitStore } from "./VisitStore.js";

/**
 * Two collections beside the reports: `visits`, one document per report per day, and
 * `activations`, one per site per day. Counts are incremented in place, so two instances flushing
 * the same day add up rather than overwrite. `expiresAt` carries the same TTL policy the reports
 * collection uses; the policy itself is created once, see OPERATIONS.md.
 */
export class FirestoreVisitStore implements VisitStore {
  constructor(private readonly firestore: Firestore, private readonly now = () => new Date()) {}

  static fromProject(projectId?: string) {
    return new FirestoreVisitStore(new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }));
  }

  async addVisits(reportId: string, day: string, counts: VisitCounts, expiresAt: string): Promise<void> {
    const update: Record<string, unknown> = { reportId, day, expiresAt };
    for (const [cls, count] of Object.entries(counts)) update[`counts.${cls}`] = FieldValue.increment(count);
    await this.firestore.collection("visits").doc(`${reportId}_${day}`).set(update, { merge: true });
  }

  async visits(reportId: string): Promise<DayVisits[]> {
    const snapshot = await this.firestore.collection("visits").where("reportId", "==", reportId).get();
    const now = this.now();
    return snapshot.docs
      .map((document) => document.data() as DayVisits)
      .filter((row) => row.day && new Date(row.expiresAt) > now)
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((row) => ({ reportId: row.reportId, day: row.day, counts: { ...(row.counts ?? {}) }, expiresAt: row.expiresAt }));
  }

  async addActivations(site: string, day: string, counts: Record<string, number>, expiresAt: string): Promise<void> {
    const update: Record<string, unknown> = { site, day, expiresAt };
    for (const [key, count] of Object.entries(counts)) update[`counts.${key}`] = FieldValue.increment(count);
    await this.firestore.collection("activations").doc(`${site}_${day}`).set(update, { merge: true });
  }

  async activations(site: string): Promise<ActivationCount[]> {
    const snapshot = await this.firestore.collection("activations").where("site", "==", site).get();
    const now = this.now();
    return snapshot.docs
      .map((document) => document.data() as { site: string; day: string; counts?: Record<string, number>; expiresAt: string })
      .filter((row) => row.day && new Date(row.expiresAt) > now)
      .sort((left, right) => left.day.localeCompare(right.day))
      .flatMap((row) =>
        Object.entries(row.counts ?? {}).flatMap(([key, count]) => {
          const parsed = parseActivationKey(key);
          return parsed ? [{ day: row.day, ...parsed, count }] : [];
        }),
      );
  }
}

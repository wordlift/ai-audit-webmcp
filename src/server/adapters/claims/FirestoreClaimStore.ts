import { Firestore } from "@google-cloud/firestore";
import { reportClaimSchema, type ClaimStore, type ReportClaim } from "./ClaimStore.js";

/** Claims live apart from reports: nothing that serves a public report reads this collection. */
export class FirestoreClaimStore implements ClaimStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly now = () => new Date(),
  ) {}

  static fromProject(projectId?: string) {
    return new FirestoreClaimStore(new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }));
  }

  async put(input: ReportClaim): Promise<ReportClaim> {
    const claim = reportClaimSchema.parse(input);
    await this.firestore.collection("reportClaims").doc(claim.reportId).set(claim);
    return claim;
  }

  async get(reportId: string): Promise<ReportClaim | null> {
    const snapshot = await this.firestore.collection("reportClaims").doc(reportId).get();
    if (!snapshot.exists) return null;
    const claim = reportClaimSchema.parse(snapshot.data());
    return new Date(claim.expiresAt) > this.now() ? claim : null;
  }
}

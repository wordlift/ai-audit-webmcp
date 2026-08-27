import { Firestore, type Transaction } from "@google-cloud/firestore";
import { parseStoredReport } from "../../../shared/schemas/report.js";
import type { ReportRecord } from "../../../shared/types/index.js";
import type { ReportStore } from "./ReportStore.js";

export class FirestoreReportStore implements ReportStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly maximumBytes = 900_000,
    private readonly now = () => new Date(),
  ) {}

  static fromProject(projectId?: string, maximumBytes?: number) {
    return new FirestoreReportStore(new Firestore(projectId ? { projectId } : undefined), maximumBytes);
  }

  async put(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    await this.firestore.collection("reports").doc(report.id).create(report);
    return report;
  }

  async get(id: string): Promise<ReportRecord | null> {
    const snapshot = await this.firestore.collection("reports").doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const report = parseStoredReport(snapshot.data(), this.maximumBytes);
    if (new Date(report.expiresAt) <= this.now()) {
      return null;
    }
    return report;
  }

  async createRevision(parentReportId: string, input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    if (report.parentReportId !== parentReportId) {
      throw new Error("Child report must name the immutable parent report");
    }

    const reports = this.firestore.collection("reports");
    await this.firestore.runTransaction(async (transaction: Transaction) => {
      const parent = await transaction.get(reports.doc(parentReportId));
      if (!parent.exists) {
        throw new Error(`Parent report ${parentReportId} was not found`);
      }
      transaction.create(reports.doc(report.id), report);
    });
    return report;
  }
}

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
    // Optional report fields are absent rather than null, so undefined must not be a write error.
    return new FirestoreReportStore(
      new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }),
      maximumBytes,
    );
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

  async finalize(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    if (report.status === "running") throw new Error("Final report must have a terminal status");
    const reference = this.firestore.collection("reports").doc(report.id);
    await this.firestore.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || parseStoredReport(snapshot.data(), this.maximumBytes).status !== "running") {
        throw new Error(`Report ${report.id} is not an active running report`);
      }
      transaction.set(reference, report);
    });
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

import { Firestore, type Transaction } from "@google-cloud/firestore";
import { parseStoredReport } from "../../../shared/schemas/report.js";
import type { ReportRecord } from "../../../shared/types/index.js";
import type { ReportStore } from "./ReportStore.js";

export class FirestoreReportStore implements ReportStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly maximumBytes = 900_000,
    private readonly now = () => new Date(),
    private readonly prefix = "",
  ) {}

  static fromProject(projectId?: string, maximumBytes?: number, prefix = "") {
    // Optional report fields are absent rather than null, so undefined must not be a write error.
    return new FirestoreReportStore(
      new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }),
      maximumBytes,
      undefined,
      prefix,
    );
  }

  async put(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    await this.firestore.collection(`${this.prefix}reports`).doc(report.id).create(report);
    return report;
  }

  async get(id: string): Promise<ReportRecord | null> {
    const snapshot = await this.firestore.collection(`${this.prefix}reports`).doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const report = parseStoredReport(snapshot.data(), this.maximumBytes);
    if (new Date(report.expiresAt) <= this.now()) {
      return null;
    }
    return report;
  }

  /**
   * Backed by the composite index in firestore.indexes.json (requestedUrl ascending, createdAt
   * descending). Without it the query throws, and the caller reads that as "nothing to reuse",
   * never as a failed audit.
   */
  async findRecent(requestedUrl: string, since: Date, limit = 10): Promise<ReportRecord[]> {
    const snapshot = await this.firestore
      .collection(`${this.prefix}reports`)
      .where("requestedUrl", "==", requestedUrl)
      .where("createdAt", ">=", since.toISOString())
      .orderBy("createdAt", "desc")
      .limit(limit)
      .get();
    const now = this.now();
    return snapshot.docs
      .map((document) => parseStoredReport(document.data(), this.maximumBytes))
      .filter((report) => new Date(report.expiresAt) > now);
  }

  async update(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    if (report.status !== "running") throw new Error("A progress update must stay running");
    const reference = this.firestore.collection(`${this.prefix}reports`).doc(report.id);
    await this.firestore.runTransaction(async (transaction: Transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || parseStoredReport(snapshot.data(), this.maximumBytes).status !== "running") {
        throw new Error(`Report ${report.id} is not an active running report`);
      }
      transaction.set(reference, report);
    });
    return report;
  }

  async finalize(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    if (report.status === "running") throw new Error("Final report must have a terminal status");
    const reference = this.firestore.collection(`${this.prefix}reports`).doc(report.id);
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

    const reports = this.firestore.collection(`${this.prefix}reports`);
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

import { parseStoredReport } from "../../../shared/schemas/report.js";
import type { ReportRecord } from "../../../shared/types/index.js";
import type { ReportStore } from "./ReportStore.js";

export class MemoryReportStore implements ReportStore {
  readonly #records = new Map<string, ReportRecord>();

  constructor(private readonly maximumBytes = 900_000, private readonly now = () => new Date()) {}

  async put(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    if (this.#records.has(report.id)) {
      throw new Error(`Report ${report.id} already exists`);
    }
    this.#records.set(report.id, structuredClone(report));
    return structuredClone(report);
  }

  async get(id: string): Promise<ReportRecord | null> {
    const report = this.#records.get(id);
    if (!report || new Date(report.expiresAt) <= this.now()) {
      return null;
    }
    return structuredClone(report);
  }

  async update(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    const existing = this.#records.get(report.id);
    if (!existing || existing.status !== "running") {
      throw new Error(`Report ${report.id} is not an active running report`);
    }
    if (report.status !== "running") throw new Error("A progress update must stay running");
    this.#records.set(report.id, structuredClone(report));
    return structuredClone(report);
  }

  async finalize(input: ReportRecord): Promise<ReportRecord> {
    const report = parseStoredReport(input, this.maximumBytes);
    const existing = this.#records.get(report.id);
    if (!existing || existing.status !== "running") {
      throw new Error(`Report ${report.id} is not an active running report`);
    }
    if (report.status === "running") throw new Error("Final report must have a terminal status");
    this.#records.set(report.id, structuredClone(report));
    return structuredClone(report);
  }

  async createRevision(parentReportId: string, input: ReportRecord): Promise<ReportRecord> {
    const parent = await this.get(parentReportId);
    if (!parent) {
      throw new Error(`Parent report ${parentReportId} was not found or has expired`);
    }
    if (input.parentReportId !== parentReportId) {
      throw new Error("Child report must name the immutable parent report");
    }
    return this.put(input);
  }
}

import type { ReportRecord } from "../../../shared/types/index.js";

export interface ReportStore {
  put(report: ReportRecord): Promise<ReportRecord>;
  finalize(report: ReportRecord): Promise<ReportRecord>;
  get(id: string): Promise<ReportRecord | null>;
  createRevision(parentReportId: string, revision: ReportRecord): Promise<ReportRecord>;
}

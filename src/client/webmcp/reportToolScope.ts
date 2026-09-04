import type { ReportRecord } from "../../shared/types/index.js";
import { getReport } from "../api/client";

/**
 * Report tools register the moment the /reports/:id route mounts — before the report has even
 * loaded — so an agent discovers them without waiting for the page to render. Each tool resolves
 * the report only when invoked: the already-loaded record when the page has it, a fetch when it
 * does not.
 */
export async function resolveOpenReport(
  reportId: string,
  loaded: ReportRecord | null,
  requested?: unknown,
): Promise<ReportRecord> {
  if (typeof requested === "string" && requested.length > 0 && requested !== reportId) {
    throw new Error(`This page holds report ${reportId}. Open ${requested} to work with it.`);
  }
  const report = loaded && loaded.status !== "running" ? loaded : await getReport(reportId);
  if (report.status === "running") {
    throw new Error(
      `The audit is still running (phase: ${report.phase}). Ask again in a moment, or call get-audit-report with reportId ${reportId}.`,
    );
  }
  if (report.status === "failed") {
    throw new Error("This audit failed, so there are no Terms of Action to work with.");
  }
  return report;
}

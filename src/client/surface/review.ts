import type { HumanAssertion, ReportRecord } from "../../shared/types/index.js";
import { claimEngine, getReport, refineReport } from "../api/client";
import { keyForReview } from "../engine/engineKeys";
import { announceEngineChange } from "../engine/useEngine";

/**
 * How every review on these screens is filed: read the report as it stands now, then send the
 * person's explicit decisions through the one refinement the product has. The answer is an
 * immutable child report, and it is the authority on what was applied: the page never shows a
 * success of its own making, and never changes the report it was opened on.
 */
export interface FiledReview {
  child: ReportRecord;
  /** What the server said it could not apply, in its words. */
  unapplied: string[];
}

export class ReviewError extends Error {}

export async function fileReview(report: ReportRecord, assertions: HumanAssertion, engineKey?: string | null): Promise<FiledReview> {
  // The state before the write: a report that is gone, or no longer holds what is being decided, is said so before anything is sent.
  const current = await getReport(report.id);
  const entityIds = new Set((current.contextGraph?.entities ?? []).map((entity) => entity.id));
  const actionIds = new Set((current.capabilities ?? []).map((capability) => capability.actionId));
  const gone = [
    ...[...(assertions.primaryEntityIds ?? []), ...(assertions.demotedEntityIds ?? [])].filter((id) => !entityIds.has(id)),
    ...(assertions.actionDecisions ?? []).map((decision) => decision.actionId).filter((id) => !actionIds.has(id)),
  ];
  if (gone.length > 0) throw new ReviewError("This report no longer holds what you are reviewing. Reload it and try again.");
  const child = await refineReport(report.id, assertions, engineKey ?? (await keyForReview(report, claimEngine)));
  announceEngineChange();
  return { child, unapplied: child.refinement?.conflicts ?? [] };
}

export function reviewFailure(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message ? caught.message : fallback;
}

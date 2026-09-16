import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { EngineWithStanding } from "../api/client";
import type { ReportRecord } from "../../shared/types/index.js";

/**
 * Where this report stands in its site's Context Engine, in one line: whether the engine is a draft,
 * claimed or owner-verified; whether this read carries an earlier review; and, when a review landed
 * after this report was made (a person came back from ChatGPT), the door to the reviewed version.
 */
export function engineLine(engine: EngineWithStanding): string {
  if (engine.owner.state === "verified") return engine.standing === "owner" ? "Your Context Engine · owner verified" : "Owner-verified Context Engine";
  if (engine.claimed) return engine.standing === "reviewer" ? "Your Context Engine · claimed, ownership not verified" : "Claimed Context Engine · ownership not verified";
  return "Draft Context Engine · not claimed";
}

/** The reviewed version to open from this report, when one landed after it. */
export function newerReview(report: ReportRecord, engine: EngineWithStanding): { reportId: string; at: string } | null {
  const reviewedId = engine.latestReviewedReportId;
  if (!reviewedId || reviewedId === report.id) return null;
  const snapshot = engine.snapshots.find((entry) => entry.reportId === reviewedId);
  if (!snapshot || snapshot.at < report.createdAt) return null;
  return { reportId: reviewedId, at: snapshot.at };
}

export function EngineStatus({ report, engine }: { report: ReportRecord; engine: EngineWithStanding | null }) {
  if (!engine) return null;
  const newer = newerReview(report, engine);
  const carried = report.refinement?.carried;
  return (
    <div className="engine-status">
      <p className={`engine-status-line engine-status-${engine.owner.state === "verified" ? "verified" : engine.claimed ? "claimed" : "draft"}`}>
        {engine.owner.state === "verified" && <ShieldCheck size={14} aria-hidden="true" />} {engineLine(engine)}
        {engine.decisions.total > 0 && <> · {engine.decisions.total} {engine.decisions.total === 1 ? "decision" : "decisions"} kept</>}
      </p>
      {carried && (
        <p className="engine-carried" role="status">
          Your earlier review carried over to this read: {report.refinement!.decisions} {report.refinement!.decisions === 1 ? "decision" : "decisions"} applied to what the site says today.
        </p>
      )}
      {newer && (
        <p className="engine-newer" role="status">
          <b>Reviewed since this report.</b> The Context Engine has a newer reviewed version.{" "}
          <Link to={`/reports/${newer.reportId}`}>Open it <ArrowRight size={13} aria-hidden="true" /></Link>
        </p>
      )}
    </div>
  );
}

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ReportRecord } from "../../shared/types/index.js";
import { startReport } from "../api/client";
import { engineLine, newerReview } from "../components/EngineStatus";
import { readAgo } from "../components/FirstScreen";
import { holds, useReportEngine } from "../engine/EngineContext";
import { plural } from "./surface";

/**
 * Which report this is, said once and the same on every screen: the original scan or a reviewed
 * version, when the site was read, how many review decisions this version includes, and whose
 * they are. Decisions stored for the site elsewhere are told apart from decisions applied here, a
 * read reused from earlier is said to be reused, and nobody is called "you" unless this browser
 * holds the review. A newer reviewed version is offered, never switched to silently.
 */
export function reviewerLine(report: ReportRecord, heldHere: boolean): string | null {
  const refinement = report.refinement;
  if (!refinement) return null;
  const who = refinement.filedBy === "owner" ? "by the site's verified owner" : refinement.filedBy === "reviewer" ? "by a reviewer; ownership not verified" : "reviewer not identified";
  return `${who}${heldHere ? " (kept in this browser)" : ""}`;
}

export function VersionStrip({ report, now = () => Date.now() }: { report: ReportRecord; now?: () => number }) {
  const navigate = useNavigate();
  const { engine } = useReportEngine();
  const [rerunning, setRerunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refinement = report.refinement;
  // A review reads nothing: a reviewed version says when it was reviewed, and the site's read only when the report records one.
  const read = readAgo(report.collectedAt, now())?.replace(/^Checked/, "Site read") ?? (refinement ? readAgo(refinement.appliedAt, now())?.replace(/^Checked/, "Reviewed") : readAgo(report.createdAt, now())?.replace(/^Checked/, "Site read"));
  const newer = engine ? newerReview(report, engine) : null;
  const stored = engine?.decisions.total ?? 0;
  const reviewer = reviewerLine(report, holds(engine));

  async function runAgain() {
    setRerunning(true);
    setError(null);
    try {
      // The explicit re-verify, through the same audit the first scan used and at the depth it ran.
      const started = startReport(report.requestedUrl, { fresh: true, surface: "web", depth: report.scanDepth });
      await started.accepted;
      navigate(`/reports/${started.reportId}`, { state: { started: true } });
    } catch (caught) {
      setRerunning(false);
      setError(caught instanceof Error ? caught.message : "The site could not be read again.");
    }
  }

  return (
    <div className="version-strip">
      <details>
        <summary>
          <span className={`version-kind${refinement ? " is-reviewed" : ""}`}>{refinement ? "Reviewed version" : "Original scan"}</span>
          {read && <span>{read}{report.reusedFrom ? ", reused from an earlier read" : ""}</span>}
          <span>
            {refinement
              ? refinement.carried
                ? `${plural(refinement.decisions, "review decision")} carried over from an earlier review of this site`
                : `${plural(refinement.decisions, "decision")} in the review that made this version`
              : "No review decisions in this version"}
          </span>
          {reviewer && <span>{reviewer}</span>}
          <ChevronDown size={16} aria-hidden="true" />
          <span className="sr-only">Report details</span>
        </summary>
        <div className="version-detail">
          <p>Report <code>{report.id}</code>. This address always shows this version; a review or a new read creates another.</p>
          {report.reusedFrom && <p>The pages were read for an earlier report today and reused here. <Link to={`/reports/${report.reusedFrom}`}>Open that report</Link></p>}
          {report.parentReportId && <p><Link to={`/reports/${report.parentReportId}`}>Compare with the version before</Link></p>}
          {engine && (engine.claimed || engine.owner.state === "verified") && <p>Review of this site: {engineLine(engine)}.</p>}
          {refinement && refinement.conflicts.length > 0 && <p>Not applied in this version: {refinement.conflicts.join(" · ")}</p>}
        </div>
      </details>
      <div className="version-actions">
        {/* Stored for the site is not applied here: said as two facts, with the way to the version that has them. */}
        {!refinement && stored > 0 && (
          <span role="status">{plural(stored, "review decision")} stored for this site elsewhere; none applied here.</span>
        )}
        {newer && (
          <Link className="text-button text-button-strong" to={`/reports/${newer.reportId}`}>Open the reviewed version</Link>
        )}
        <button type="button" className="text-button" onClick={() => void runAgain()} disabled={rerunning}>{rerunning ? "Reading again…" : "Run again"}</button>
        <Link className="text-button" to="/">New audit</Link>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

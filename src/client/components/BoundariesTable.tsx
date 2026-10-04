import { Link } from "react-router-dom";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { OWN_WORDS } from "./OwnIt";
import { BOUNDARY_LABELS } from "./ServiceMapProvenance";

/**
 * Business boundaries, as the enterprise layer needs them in one place: for every action that
 * matters, who owns it, the partner when there is one, the rationale the person gave, and the
 * provenance of the decision. Nothing here is inferred; a boundary is a human decision or it is
 * undecided, and the table says which.
 */
export function boundaryRows(report: ReportRecord): CapabilityResult[] {
  return (report.capabilities ?? [])
    .filter((capability) => (capability.expected && capability.state !== "not-expected") || capability.boundary)
    .sort((left, right) => Number(Boolean(right.boundary)) - Number(Boolean(left.boundary)) || right.importance - left.importance || left.label.localeCompare(right.label));
}

export function BoundariesTable({ report }: { report: ReportRecord }) {
  const rows = boundaryRows(report);
  const decided = rows.filter((capability) => capability.boundary).length;
  if (rows.length === 0) return null;
  return (
    <section className="boundaries" aria-labelledby="boundaries-title">
      <h2 id="boundaries-title">Business boundaries</h2>
      <p className="boundaries-lead">
        {decided === 0 ? (
          <>
            No boundary has been decided yet. <Link to={`/reports/${report.id}#own-it`}>Answer the three questions</Link> on the report, or let the review interview
            your team; a boundary is a human decision, never an inference.
          </>
        ) : (
          <>
            {decided} of {rows.length} {rows.length === 1 ? "action" : "actions"} decided by a person. A boundary says who performs the action; it never says whether an
            interface answers.
          </>
        )}
      </p>
      <div className="table-scroll">
        <table className="pitch-table boundaries-table">
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Boundary</th>
              <th scope="col">Partner</th>
              <th scope="col">Rationale</th>
              <th scope="col">Provenance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((capability) => (
              <tr key={capability.actionId}>
                <th scope="row">{capability.label}</th>
                <td>
                  {capability.boundary ? (
                    <>
                      <span className={`boundary-chip boundary-${capability.boundary}`}>{BOUNDARY_LABELS[capability.boundary]}</span>
                      <span className="boundaries-plain">{OWN_WORDS[capability.boundary]}</span>
                    </>
                  ) : (
                    <span className="boundaries-undecided">Undecided</span>
                  )}
                </td>
                <td>
                  {capability.boundaryPartner ? (
                    capability.boundaryPartner.url ? (
                      <a href={capability.boundaryPartner.url} target="_blank" rel="noreferrer">{capability.boundaryPartner.name}</a>
                    ) : (
                      capability.boundaryPartner.name
                    )
                  ) : (
                    "–"
                  )}
                </td>
                <td>{capability.boundaryRationale ?? "–"}</td>
                <td>{capability.boundarySource === "human-provided" ? <span className="provenance-badge">Human-provided</span> : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

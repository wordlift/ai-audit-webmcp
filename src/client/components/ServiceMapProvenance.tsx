import { Bot, Copy, GitBranch, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { ReportRecord } from "../../shared/types/index.js";
import { reportPageUrl } from "../api/client";

export const BOUNDARY_LABELS: Record<string, string> = {
  owned: "Owned capability",
  "partner-handoff": "Partner handoff",
  "informational-only": "Informational only",
  "not-applicable": "Not applicable",
};

/**
 * Says plainly whose interpretation the reader is looking at. A fresh audit is a machine draft
 * to be reviewed; a refined revision names how many human decisions built it and what changed.
 */
export function ServiceMapProvenance({ report }: { report: ReportRecord }) {
  const [copied, setCopied] = useState(false);

  async function copyReviewPrompt() {
    const prompt = [
      `Review the machine-generated service map on this page: ${reportPageUrl(report.id)}`,
      "First use inspect-service-map. Then interview me about the operating role, the primary entities, the terminology, and the boundary of every expected action (owned, partner handoff, informational only, or not applicable). Use explain-capability whenever evidence is unclear.",
      "Once we have resolved the decisions, call refine-service-map. Do not alter evidence-based agent readiness.",
    ].join("\n\n");
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  if (report.refinement) {
    const refinement = report.refinement;
    const assertions = refinement.assertions;
    const entityName = (id: string) =>
      report.contextGraph?.entities.find((entity) => entity.id === id)?.name ?? id;
    const label = (actionId: string) =>
      report.capabilities?.find((capability) => capability.actionId === actionId)?.label ?? actionId;
    return (
      <section className="map-provenance map-provenance-refined" aria-label="Service map provenance">
        <div className="map-provenance-head">
          <p className="map-provenance-title"><UserRoundCheck aria-hidden="true" /> Human-refined service map</p>
          <p className="map-provenance-copy">
            Built from website evidence and {refinement.decisions} human decision{refinement.decisions === 1 ? "" : "s"}
            {report.classification?.businessRole ? <> — the business operates as a <strong>{report.classification.businessRole.replaceAll("-", " ")}</strong></> : null}.
          </p>
          {report.parentReportId && (
            <Link className="map-provenance-parent" to={`/reports/${report.parentReportId}`}>
              <GitBranch size={14} aria-hidden="true" /> Compare with the machine draft
            </Link>
          )}
        </div>
        {(() => {
          const primaryCount = (assertions.primaryEntityIds ?? []).length;
          const demotedCount = (assertions.demotedEntityIds ?? []).length;
          const termCount = (assertions.terminology ?? []).length + (assertions.terminologyDecisions ?? []).length;
          const actionCount = (assertions.actionDecisions ?? []).length;
          const stats = [
            primaryCount > 0 && `${primaryCount} primary entit${primaryCount === 1 ? "y" : "ies"}`,
            demotedCount > 0 && `${demotedCount} demoted`,
            termCount > 0 && `${termCount} term${termCount === 1 ? "" : "s"} clarified`,
            actionCount > 0 && `${actionCount} action boundar${actionCount === 1 ? "y" : "ies"} decided`,
          ].filter((entry): entry is string => Boolean(entry));
          return (
            <div className="map-stats" aria-label="What changed">
              {stats.map((entry) => <span key={entry} className="map-stat">{entry}</span>)}
            </div>
          );
        })()}
        <details className="map-diff">
          <summary>Full decision log</summary>
          <ul className="map-changes">
            {(assertions.primaryEntityIds ?? []).length > 0 && (
              <li><span className="provenance-badge">Human-provided</span> Primary entities: {(assertions.primaryEntityIds ?? []).map(entityName).join(", ")}</li>
            )}
            {(assertions.demotedEntityIds ?? []).length > 0 && (
              <li><span className="provenance-badge">Human-provided</span> Demoted: {(assertions.demotedEntityIds ?? []).map(entityName).join(", ")}</li>
            )}
            {(assertions.terminology ?? []).map((entry) => (
              <li key={entry.term}><span className="provenance-badge">Human-provided</span> "{entry.term}" means {entry.meaning}</li>
            ))}
            {(assertions.terminologyDecisions ?? []).map((decision) => (
              <li key={decision.term}>
                <span className="provenance-badge">Human-provided</span> "{decision.term}" {decision.decision === "reject" ? "rejected as machine vocabulary" : decision.decision === "confirm" ? "confirmed" : `now means ${decision.meaning}`}
              </li>
            ))}
            {(assertions.actionDecisions ?? []).map((decision) => (
              <li key={decision.actionId}>
                <span className="provenance-badge">Human-provided</span> {label(decision.actionId)}: {decision.decision === "confirm" ? "confirmed" : "rejected"}
                {decision.boundary ? ` · ${BOUNDARY_LABELS[decision.boundary]}` : ""}
                {decision.rationale ? <em> — {decision.rationale}</em> : null}
              </li>
            ))}
          </ul>
        </details>
        {refinement.conflicts.length > 0 && (
          <p className="map-conflicts">Not applied: {refinement.conflicts.join(" · ")}</p>
        )}
      </section>
    );
  }

  return (
    <section className="map-provenance map-provenance-draft" aria-label="Service map provenance">
      <div className="map-provenance-head">
        <p className="map-provenance-title"><Bot aria-hidden="true" /> Machine-generated service map</p>
        <p className="map-provenance-copy">
          Open this report in ChatGPT's built-in browser: ChatGPT will inspect the machine draft, interview you
          about the business — its role, its vocabulary, who owns each action — and compile a human-refined
          service map.
        </p>
      </div>
      <button type="button" className="review-cta" onClick={() => void copyReviewPrompt()}>
        <Copy size={15} aria-hidden="true" /> {copied ? "Prompt copied — paste it into ChatGPT" : "Review with ChatGPT"}
      </button>
    </section>
  );
}

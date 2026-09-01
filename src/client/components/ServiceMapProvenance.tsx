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
      `I ran a WordLift AI Audit on my website. The machine-generated service map is at ${reportPageUrl(report.id)} — open it in a WebMCP-enabled browser to use its tools.`,
      "Interview me about how the business actually works: its operating role, its primary entities, what its vocabulary means, and — for each expected action — whether we own it, hand it off to a partner, offer it as information only, or don't do it at all.",
      "Then call the refine-service-map tool with my decisions to compile a human-refined service map. Human decisions never mark an action agent-ready; readiness stays evidence-based.",
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
        <ul className="map-changes" aria-label="What changed">
          {(assertions.primaryEntityIds ?? []).length > 0 && (
            <li><span className="provenance-badge">Human-provided</span> Primary entities: {(assertions.primaryEntityIds ?? []).map(entityName).join(", ")}</li>
          )}
          {(assertions.demotedEntityIds ?? []).length > 0 && (
            <li><span className="provenance-badge">Human-provided</span> Demoted: {(assertions.demotedEntityIds ?? []).map(entityName).join(", ")}</li>
          )}
          {(assertions.terminology ?? []).map((entry) => (
            <li key={entry.term}><span className="provenance-badge">Human-provided</span> "{entry.term}" means {entry.meaning}</li>
          ))}
          {(assertions.actionDecisions ?? []).map((decision) => (
            <li key={decision.actionId}>
              <span className="provenance-badge">Human-provided</span> {label(decision.actionId)}: {decision.decision === "confirm" ? "confirmed" : "rejected"}
              {decision.boundary ? ` · ${BOUNDARY_LABELS[decision.boundary]}` : ""}
              {decision.rationale ? <em> — {decision.rationale}</em> : null}
            </li>
          ))}
        </ul>
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
          Review this interpretation with ChatGPT using your knowledge of the business. The machine read the
          website; only you know its role, its vocabulary, and who owns each action.
        </p>
      </div>
      <button type="button" className="review-cta" onClick={() => void copyReviewPrompt()}>
        <Copy size={15} aria-hidden="true" /> {copied ? "Prompt copied — paste it into ChatGPT" : "Review with ChatGPT"}
      </button>
    </section>
  );
}

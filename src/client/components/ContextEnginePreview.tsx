import type { ReportRecord } from "../../shared/types/index.js";
import type { EntityProvenance } from "../../shared/format/businessModel.js";
import { modelView, type ModelView, type ViewEntity } from "../../shared/format/modelView.js";
import { entityTypeLabel } from "./UnderstandPanel";

/**
 * The Context Engine as a person reads it on the first screen: the handful of things the business
 * is, offers and where, each marked with where the knowledge comes from. Three words only, and each
 * means one thing: declared by the site, inferred from its content, confirmed in a review. The
 * precise map, with terms, actions, interfaces and evidence, stays in the model & evidence fold.
 */
const MAX_PREVIEW = 6;

export const PROVENANCE_WORD: Record<EntityProvenance, string> = {
  declared: "Declared",
  inferred: "Inferred",
  "human-confirmed": "Confirmed",
};

const PROVENANCE_HINT: Record<EntityProvenance, string> = {
  declared: "The website explicitly identifies this in its markup.",
  inferred: "WordLift found this in the content; the website does not declare it.",
  "human-confirmed": "Confirmed in a review of this Context Engine.",
};

export interface ContextEngineSummary {
  pages: number;
  entities: number;
  declared: number;
  inferred: number;
  confirmed: number;
  relationships: number;
  /** What matters most, never a page or an article: the business, up to three offerings, up to two places. */
  preview: ViewEntity[];
  /** One sentence of what the business is, from the model's own facts. */
  sentence: string | null;
  view: ModelView;
  /** Named "not ours" in a review: said on the screen, so a correction is seen to land. */
  notOurs: string[];
  /** Human decisions the review filed, when this report is a reviewed one. */
  decisions: number | null;
  /** Whose decisions: the verified owner's, a claimant's, or nobody's in particular. */
  filedBy: "owner" | "reviewer" | null;
}

export function contextEngineSummary(report: ReportRecord): ContextEngineSummary | null {
  const pages = report.contextGraph?.pages.length ?? 0;
  if (pages === 0) return null;
  const view = modelView(report);
  if (view.preview.length === 0) return null;
  return {
    pages,
    entities: view.counts.declared + view.counts.inferred + view.counts.confirmed,
    declared: view.counts.declared,
    inferred: view.counts.inferred,
    confirmed: view.counts.confirmed,
    relationships: view.counts.relationships,
    preview: view.preview.slice(0, MAX_PREVIEW),
    sentence: view.sentence,
    view,
    notOurs: (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority === "demoted").map((entity) => entity.name),
    decisions: report.refinement ? report.refinement.decisions : null,
    filedBy: report.refinement?.filedBy ?? null,
  };
}

const count = (value: number, noun: string, plural = `${noun}s`) => `${value} ${value === 1 ? noun : plural}`;

export function ContextEnginePreview({ summary, onExplore }: { summary: ContextEngineSummary; onExplore?: () => void }) {
  // A zero says nothing a reader needs: "4 declared by the site", not "· 0 read from its text".
  const provenance = [
    [summary.declared, "declared by the site"],
    [summary.inferred, "read from its text"],
    [summary.confirmed, "confirmed in a review"],
  ].filter(([value]) => Number(value) > 0).map(([value, word]) => `${value} ${word}`);
  return (
    <div className="engine-preview">
      {summary.decisions !== null && (
        <p className="engine-reviewed" role="status">
          <b>{summary.filedBy === "owner" ? "Reviewed by the owner" : "Reviewed"}</b> · {count(summary.decisions, "decision")} added
          {summary.notOurs.length > 0 && <> · not ours: {summary.notOurs.slice(0, 3).join(", ")}</>}
        </p>
      )}
      <ul className="engine-entities" aria-label="What WordLift understood">
        {summary.preview.map((entity) => (
          <li key={entity.id} className={`engine-entity engine-entity-${entity.provenance}`}>
            <span className="engine-entity-name">{entity.name}</span>
            <span className="engine-entity-type">
              {entityTypeLabel(entity.type)}
              {entity.variants > 0 && ` · ${entity.variants + 1} variants`}
            </span>
            <span
              className={`engine-provenance engine-provenance-${entity.provenance}`}
              title={entity.provenance === "human-confirmed" && summary.filedBy === "owner" ? "Confirmed by the site's verified owner." : entity.provenance === "human-confirmed" && summary.filedBy !== "owner" ? "Confirmed in a review; the reviewer has not proved the site is theirs." : PROVENANCE_HINT[entity.provenance]}
            >
              {PROVENANCE_WORD[entity.provenance]}
            </span>
          </li>
        ))}
      </ul>
      <p className="engine-counts">
        {provenance.join(" · ")}.{" "}
        <a href="#understand" onClick={onExplore}>See everything we understood</a>
      </p>
    </div>
  );
}

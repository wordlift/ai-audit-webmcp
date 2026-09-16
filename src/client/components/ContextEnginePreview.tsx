import type { ReportRecord } from "../../shared/types/index.js";
import { businessModel, type EntityProvenance, type ModelledEntity } from "../../shared/format/businessModel.js";
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
  /** What matters most, never a page or an article: the business, its offerings, its places, its people. */
  preview: ModelledEntity[];
  /** Named "not ours" in a review: said on the screen, so a correction is seen to land. */
  notOurs: string[];
  /** Human decisions the review filed, when this report is a reviewed one. */
  decisions: number | null;
}

export function contextEngineSummary(report: ReportRecord): ContextEngineSummary | null {
  const pages = report.contextGraph?.pages.length ?? 0;
  if (pages === 0) return null;
  const model = businessModel(report, "");
  if (model.counts.entities === 0) return null;
  return {
    pages,
    entities: model.counts.entities,
    declared: model.counts.declared,
    inferred: model.counts.inferred,
    confirmed: model.counts.humanConfirmed,
    relationships: model.relationships.length,
    preview: model.entities.filter((entity) => entity.role !== "content").slice(0, MAX_PREVIEW),
    notOurs: (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority === "demoted").map((entity) => entity.name),
    decisions: report.refinement ? report.refinement.decisions : null,
  };
}

const count = (value: number, noun: string, plural = `${noun}s`) => `${value} ${value === 1 ? noun : plural}`;

export function ContextEnginePreview({ summary }: { summary: ContextEngineSummary }) {
  // A zero says nothing a reader needs: "4 declared", not "4 declared · 0 inferred".
  const provenance = [
    [summary.declared, "declared"],
    [summary.inferred, "inferred"],
    [summary.confirmed, "confirmed"],
  ].filter(([value]) => Number(value) > 0).map(([value, word]) => `${value} ${word}`);
  return (
    <div className="engine-preview">
      {summary.decisions !== null && (
        <p className="engine-reviewed" role="status">
          <b>Reviewed</b> · {count(summary.decisions, "decision")} added
          {summary.notOurs.length > 0 && <> · not ours: {summary.notOurs.slice(0, 3).join(", ")}</>}
        </p>
      )}
      <ul className="engine-entities" aria-label="What WordLift understood">
        {summary.preview.map((entity) => (
          <li key={entity.id} className={`engine-entity engine-entity-${entity.provenance}`}>
            <span className="engine-entity-name">{entity.name}</span>
            <span className="engine-entity-type">{entityTypeLabel(entity.type)}</span>
            <span className={`engine-provenance engine-provenance-${entity.provenance}`} title={PROVENANCE_HINT[entity.provenance]}>
              {PROVENANCE_WORD[entity.provenance]}
            </span>
          </li>
        ))}
      </ul>
      <p className="engine-counts">
        {count(summary.entities, "important thing")}
        {summary.relationships > 0 && <> · {count(summary.relationships, "relationship")}</>}
        {provenance.length > 0 && <span className="engine-counts-provenance"> ({provenance.join(" · ")})</span>}
        {" "}<a href="#understand">See everything we understood</a>
      </p>
    </div>
  );
}

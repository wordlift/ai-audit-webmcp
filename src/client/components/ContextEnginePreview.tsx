import { useState } from "react";
import type { ReportRecord } from "../../shared/types/index.js";
import { modelView, type ModelView, type ViewEntity } from "../../shared/format/modelView.js";
import { EntityCard, type CardDecision } from "./EntityCard";
import { ModelGraph, type GraphRelation, type RelationDecision } from "./ModelGraph";

/**
 * The Context Engine as a person reads it on the first screen: the handful of things the business
 * is, offers and where, each marked with where the knowledge comes from. Three words only, and each
 * means one thing: declared by the site, inferred from its content, confirmed in a review. The
 * precise map, with terms, actions, interfaces and evidence, stays in the model & evidence fold.
 */
const MAX_PREVIEW = 6;

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

export type { CardDecision } from "./EntityCard";

/** Every decision staged on the model, cards and connections alike, as one save. */
export interface StagedDecisions {
  cards: Record<string, CardDecision>;
  relations: Record<string, RelationDecision>;
}

/** What the model was told, as the assertions a review files: relevant things lead, what is not ours leaves, connections are settled. */
export function cardAssertions(staged: StagedDecisions | Record<string, CardDecision>): { primaryEntityIds?: string[]; demotedEntityIds?: string[]; relationDecisions?: Array<{ from: string; kind: GraphRelation["kind"]; to: string; decision: RelationDecision }> } {
  const cards = "cards" in staged && typeof staged.cards === "object" ? (staged as StagedDecisions).cards : (staged as Record<string, CardDecision>);
  const relations = "relations" in staged && typeof staged.relations === "object" ? (staged as StagedDecisions).relations : {};
  const primaryEntityIds = Object.entries(cards).filter(([, decision]) => decision === "relevant").map(([id]) => id);
  const demotedEntityIds = Object.entries(cards).filter(([, decision]) => decision === "not-ours").map(([id]) => id);
  const relationDecisions = Object.entries(relations).map(([key, decision]) => {
    const [from, kind, to] = key.split("|") as [string, GraphRelation["kind"], string];
    return { from, kind, to, decision };
  });
  return {
    ...(primaryEntityIds.length > 0 ? { primaryEntityIds } : {}),
    ...(demotedEntityIds.length > 0 ? { demotedEntityIds } : {}),
    ...(relationDecisions.length > 0 ? { relationDecisions } : {}),
  };
}

/** The connections between the things shown, as the diagram draws them. */
export function graphRelations(report: ReportRecord): GraphRelation[] {
  return (report.contextGraph?.relations ?? []).map((relation) => ({ from: relation.from, to: relation.to, kind: relation.kind, provenance: relation.provenance, ...(relation.evidence ? { evidence: relation.evidence } : {}) }));
}

/**
 * The model, drawn: the business, what it offers, where, and the connections between them, each
 * card a decision a person can make where they read it. What the text alone suggested is the wow
 * and the doubt at once, so it is confirmed here, not three folds down. Choices collect on the cards
 * and the connections, and are filed together as one review.
 */
export function ContextEnginePreview({
  summary,
  relations = [],
  onExplore,
  host = "The site",
  onSave,
  keptOnEngine = false,
}: {
  summary: ContextEngineSummary;
  relations?: GraphRelation[];
  onExplore?: () => void;
  host?: string;
  /** Files the choices as a review; absent, the cards only show. */
  onSave?: (decisions: StagedDecisions) => Promise<void>;
  keptOnEngine?: boolean;
}) {
  const [decisions, setDecisions] = useState<Record<string, CardDecision>>({});
  const [relationDecisions, setRelationDecisions] = useState<Record<string, RelationDecision>>({});
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A zero says nothing a reader needs: "4 declared by the site", not "· 0 read from its text".
  const provenance = [
    [summary.declared, "declared by the site"],
    [summary.inferred, "read from its text"],
    [summary.confirmed, "confirmed in a review"],
  ].filter(([value]) => Number(value) > 0).map(([value, word]) => `${value} ${word}`);
  const everything = [...(summary.view.business ? [summary.view.business] : []), ...summary.view.offerings, ...summary.view.places].slice(0, 30);
  const shownIds = new Set(summary.preview.map((entity) => entity.id));
  const extras = everything.filter((entity) => !shownIds.has(entity.id));
  const staged = Object.keys(decisions).length + Object.keys(relationDecisions).length;

  const decide = (id: string, decision: CardDecision) =>
    setDecisions((current) => {
      const next = { ...current };
      if (next[id] === decision) delete next[id];
      else next[id] = decision;
      return next;
    });
  const decideRelation = (key: string, decision: RelationDecision) =>
    setRelationDecisions((current) => {
      const next = { ...current };
      if (next[key] === decision) delete next[key];
      else next[key] = decision;
      return next;
    });

  async function save() {
    if (!onSave || staged === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ cards: decisions, relations: relationDecisions });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your corrections could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="engine-preview">
      {summary.decisions !== null && (
        <p className="engine-reviewed" role="status">
          <b>{summary.filedBy === "owner" ? "Reviewed by the owner" : "Reviewed"}</b> · {count(summary.decisions, "decision")} added
          {summary.notOurs.length > 0 && <> · not ours: {summary.notOurs.slice(0, 3).join(", ")}</>}
        </p>
      )}
      <ModelGraph
        entities={summary.preview}
        relations={relations}
        decisions={decisions}
        onDecide={onSave ? decide : undefined}
        relationDecisions={relationDecisions}
        onDecideRelation={onSave ? decideRelation : undefined}
        filedBy={summary.filedBy}
      />
      {summary.preview.length === 1 && everything.length === 1 && (
        <p className="engine-alone">
          Only the business was found on {summary.pages === 1 ? "this page" : `these ${summary.pages} pages`}: nothing it offers is declared there or named in their text.
          {onSave ? " Claiming reads more of the site." : ""}
        </p>
      )}
      {showAll && extras.length > 0 && (
        <ul className="engine-entities engine-extras" aria-label="Everything else WordLift found">
          {extras.map((entity) => (
            <EntityCard key={entity.id} entity={entity} decision={decisions[entity.id]} onDecide={onSave ? decide : undefined} filedBy={summary.filedBy} />
          ))}
        </ul>
      )}
      {staged > 0 && (
        <div className="engine-save" role="status">
          <span>
            {count(staged, "correction")} ready.{" "}
            {keptOnEngine ? "Saving keeps them on your Context Engine for every later read." : "Saving creates a reviewed version of this report."}
          </span>
          <button type="button" className="review-cta review-cta-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : `Save ${count(staged, "correction")}`}
          </button>
          <button type="button" className="engine-save-undo" onClick={() => { setDecisions({}); setRelationDecisions({}); }} disabled={saving}>Undo</button>
          {error && <span className="engine-save-error" role="alert">{error}</span>}
        </div>
      )}
      <p className="engine-counts">
        {/* Nothing declared is a finding about the site, said as one, not the tool hedging. */}
        {summary.declared === 0 && summary.confirmed === 0 && summary.inferred > 0
          ? `${host} declares none of these in its markup: WordLift read ${summary.inferred === 1 ? "it" : `all ${summary.inferred}`} from its text.`
          : `${provenance.join(" · ")}.`}{" "}
        {onSave && <span className="engine-counts-hint">Mark each one Relevant or Not ours. </span>}
        {extras.length > 0 && (
          <>
            <button type="button" className="engine-show-all" aria-expanded={showAll} onClick={() => setShowAll((current) => !current)}>
              {showAll ? "Show fewer" : `Show all ${everything.length}`}
            </button>{" "}
            ·{" "}
          </>
        )}
        <a href="#full-audit" onClick={(event) => { onExplore?.(); const fold = document.getElementById("full-audit") as HTMLDetailsElement | null; if (fold) fold.open = true; void event; }}>Full model &amp; evidence</a>
      </p>
    </div>
  );
}

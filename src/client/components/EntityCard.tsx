import type React from "react";
import type { EntityProvenance } from "../../shared/format/businessModel.js";
import type { ViewEntity } from "../../shared/format/modelView.js";

/**
 * One card for one thing the model holds, the same wherever it is shown: on the first screen, in the
 * diagram, and in Fix. Its name, its kind, where the knowledge comes from in one of three words, and
 * where a decision is possible, the two decisions a person can make about it. Fix adds detail below
 * the same head: the page it was read from, its connections, the actions it answers for, the site's
 * words for it. Nothing about the card changes its shape between places.
 */
export type CardDecision = "relevant" | "not-ours";

export const PROVENANCE_WORD: Record<EntityProvenance, string> = {
  declared: "Declared by site",
  inferred: "Inferred from text",
  "human-confirmed": "Confirmed",
};

const PROVENANCE_HINT: Record<EntityProvenance, string> = {
  declared: "The website explicitly identifies this in its markup.",
  inferred: "WordLift found this in the content; the website does not declare it.",
  "human-confirmed": "Confirmed in a review of this Context Engine.",
};

/** "LodgingBusiness" → "Lodging business": the schema.org type in words a person reads. */
export function entityTypeLabel(type: string | undefined): string {
  if (!type) return "Thing";
  if (type === "ProductLine") return "Product line";
  const words = type.replace(/^https?:\/\/schema\.org\//, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export interface CardDetail {
  /** The page it was read from, as a short path a person recognises. */
  where?: string;
  /** How it connects to the rest: "offers Samspitze 4", "in Mariapfarr (from the text)". */
  relations?: string[];
  /** The actions it answers for, in the colour of what agents can do today. */
  actions?: Array<{ actionId: string; label: string; word: "works" | "fix" | "talk" | null }>;
  /** The site's own words for it. */
  terms?: string[];
  wikidata?: { url: string; id: string } | null;
}

const PLAIN_WORDS: Record<string, string> = { works: "an AI agent can do this today", fix: "fix this, agents cannot do it yet", talk: "talk to us, there is no interface for it", none: "not expected of this kind of site" };

export function EntityCard({
  entity,
  decision,
  onDecide,
  filedBy = null,
  detail,
  cardRef,
  style,
}: {
  entity: ViewEntity;
  decision?: CardDecision;
  /** Absent, the card only shows: no decision is possible here. */
  onDecide?: (id: string, decision: CardDecision) => void;
  filedBy?: "owner" | "reviewer" | null;
  detail?: CardDetail;
  cardRef?: (element: HTMLLIElement | null) => void;
  /** Where the diagram puts it: its column. */
  style?: React.CSSProperties;
}) {
  const confirmed = entity.provenance === "human-confirmed";
  const hint =
    confirmed && filedBy === "owner"
      ? "Confirmed by the site's verified owner."
      : confirmed
        ? "Confirmed in a review; the reviewer has not proved the site is theirs."
        : PROVENANCE_HINT[entity.provenance];
  return (
    <li ref={cardRef} style={style} data-entity-id={entity.id} className={`engine-entity engine-entity-${entity.provenance}${decision ? ` is-${decision}` : ""}${detail ? " engine-entity-detailed" : ""}`}>
      <span className="engine-entity-name">{entity.name}</span>
      <span className="engine-entity-type">
        {entityTypeLabel(entity.type)}
        {entity.within && ` in ${entity.within}`}
        {entity.variants > 0 && ` · ${entity.variants + 1} variants`}
      </span>
      <span className={`engine-provenance engine-provenance-${entity.provenance}`} title={hint}>
        {PROVENANCE_WORD[entity.provenance]}
      </span>
      {onDecide && !confirmed && (
        <span className="engine-entity-actions" role="group" aria-label={`Is ${entity.name} right?`}>
          <button type="button" aria-pressed={decision === "relevant"} onClick={() => onDecide(entity.id, "relevant")}>Relevant</button>
          <button type="button" aria-pressed={decision === "not-ours"} onClick={() => onDecide(entity.id, "not-ours")}>Not ours</button>
        </span>
      )}
      {detail && (
        <span className="engine-entity-detail">
          {detail.where && <small className="engine-entity-where">Read on {detail.where}</small>}
          {detail.relations && detail.relations.length > 0 && <span className="engine-entity-relations">{detail.relations.join(" · ")}</span>}
          {((detail.actions && detail.actions.length > 0) || (detail.terms && detail.terms.length > 0) || detail.wikidata) && (
            <span className="entity-links" aria-label={`What the map links to ${entity.name}`}>
              {detail.actions && detail.actions.length > 0 && <small className="entity-links-label">Answers for</small>}
              {(detail.actions ?? []).map((action) => (
                <span key={action.actionId} className={`entity-link entity-link-${action.word ?? "none"}`} title={`${action.label}: ${PLAIN_WORDS[action.word ?? "none"]}`}>{action.label}</span>
              ))}
              {detail.terms && detail.terms.length > 0 && <small className="entity-links-label">In the site's words</small>}
              {(detail.terms ?? []).map((term) => (
                <span key={term} className="entity-link entity-link-term">“{term}”</span>
              ))}
              {detail.wikidata && (
                <a className="entity-link entity-link-wikidata" href={detail.wikidata.url} target="_blank" rel="noreferrer">
                  Wikidata {detail.wikidata.id}
                </a>
              )}
            </span>
          )}
        </span>
      )}
    </li>
  );
}

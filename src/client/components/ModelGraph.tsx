import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ViewEntity } from "../../shared/format/modelView.js";
import type { EntityRelation } from "../../shared/types/index.js";
import { EntityCard, type CardDecision } from "./EntityCard";

/**
 * The shape of the business, drawn: the business, what it offers, where, as the same cards the
 * first screen uses, in columns, with the connections between them as labelled lines. A declared
 * connection is drawn solid, one read from the text dashed, one a review confirmed in green: the
 * provenance of a relation is as visible as an entity's tag. A connection read from the text can be
 * settled here, Right or Wrong, with the same save as the cards.
 */
export interface GraphRelation {
  from: string;
  to: string;
  kind: EntityRelation["kind"];
  provenance: EntityRelation["provenance"];
  evidence?: string;
}

export type RelationDecision = "confirm" | "reject";

export const relationKey = (relation: Pick<GraphRelation, "from" | "kind" | "to">) => `${relation.from}|${relation.kind}|${relation.to}`;

const EDGE_WORDS: Record<EntityRelation["kind"], string> = {
  offers: "offers",
  "located-in": "in",
  "provided-by": "by",
  "part-of": "part of",
  serves: "serves",
  brand: "brand",
};

const COLUMNS: Array<{ role: ViewEntity["role"]; caption: string }> = [
  { role: "business", caption: "The business" },
  { role: "offering", caption: "What it offers" },
  { role: "place", caption: "Where" },
];

interface Edge {
  key: string;
  path: string;
  label: string;
  x: number;
  y: number;
  provenance: GraphRelation["provenance"];
}

function route(from: DOMRect, to: DOMRect, origin: DOMRect): { path: string; x: number; y: number } {
  const rect = (box: DOMRect) => ({ left: box.left - origin.left, right: box.right - origin.left, top: box.top - origin.top, bottom: box.bottom - origin.top, cx: (box.left + box.right) / 2 - origin.left, cy: (box.top + box.bottom) / 2 - origin.top });
  const a = rect(from);
  const b = rect(to);
  let x1: number, y1: number, x2: number, y2: number, c1x: number, c1y: number, c2x: number, c2y: number;
  if (b.left >= a.right - 4) {
    // Side by side: out of the right edge, into the left edge.
    [x1, y1, x2, y2] = [a.right, a.cy, b.left, b.cy];
    const bend = Math.max(24, (x2 - x1) / 2);
    [c1x, c1y, c2x, c2y] = [x1 + bend, y1, x2 - bend, y2];
  } else if (b.right <= a.left + 4) {
    [x1, y1, x2, y2] = [a.left, a.cy, b.right, b.cy];
    const bend = Math.max(24, (x1 - x2) / 2);
    [c1x, c1y, c2x, c2y] = [x1 - bend, y1, x2 + bend, y2];
  } else if (b.top >= a.bottom - 4) {
    // Stacked: out of the bottom, into the top.
    [x1, y1, x2, y2] = [a.cx, a.bottom, b.cx, b.top];
    const bend = Math.max(16, (y2 - y1) / 2);
    [c1x, c1y, c2x, c2y] = [x1, y1 + bend, x2, y2 - bend];
  } else {
    [x1, y1, x2, y2] = [a.cx, a.top, b.cx, b.bottom];
    const bend = Math.max(16, (y1 - y2) / 2);
    [c1x, c1y, c2x, c2y] = [x1, y1 - bend, x2, y2 + bend];
  }
  // The label sits at the curve's midpoint.
  const t = 0.5;
  const mx = (1 - t) ** 3 * x1 + 3 * (1 - t) ** 2 * t * c1x + 3 * (1 - t) * t ** 2 * c2x + t ** 3 * x2;
  const my = (1 - t) ** 3 * y1 + 3 * (1 - t) ** 2 * t * c1y + 3 * (1 - t) * t ** 2 * c2y + t ** 3 * y2;
  return { path: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`, x: mx, y: my };
}

export function ModelGraph({
  entities,
  relations,
  decisions,
  onDecide,
  relationDecisions = {},
  onDecideRelation,
  filedBy = null,
}: {
  entities: ViewEntity[];
  relations: GraphRelation[];
  decisions: Record<string, CardDecision>;
  onDecide?: (id: string, decision: CardDecision) => void;
  relationDecisions?: Record<string, RelationDecision>;
  onDecideRelation?: (key: string, decision: RelationDecision) => void;
  filedBy?: "owner" | "reviewer" | null;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const cards = useRef(new Map<string, HTMLLIElement>());
  const [edges, setEdges] = useState<Edge[]>([]);
  const names = new Map(entities.map((entity) => [entity.id, entity.name]));
  const shown = relations.filter((relation) => names.has(relation.from) && names.has(relation.to));
  // A connection marked wrong leaves the drawing at once, and stays in the list so the mark can be undone.
  const drawn = shown.filter((relation) => relationDecisions[relationKey(relation)] !== "reject");

  const measure = useCallback(() => {
    const origin = container.current?.getBoundingClientRect();
    if (!origin) return;
    setEdges(
      drawn.flatMap((relation) => {
        const from = cards.current.get(relation.from)?.getBoundingClientRect();
        const to = cards.current.get(relation.to)?.getBoundingClientRect();
        if (!from || !to) return [];
        const decided = relationDecisions[relationKey(relation)];
        return [{ key: relationKey(relation), ...route(from, to, origin), label: EDGE_WORDS[relation.kind], provenance: decided === "confirm" ? "confirmed" : relation.provenance }];
      }),
    );
    // The relations and decisions are what the edges are made of; a new set of either is a new drawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(drawn), JSON.stringify(relationDecisions)]);

  useLayoutEffect(() => {
    measure();
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measure]);

  const columns = COLUMNS.filter((column) => entities.some((entity) => entity.role === column.role));
  const rest = entities.filter((entity) => !COLUMNS.some((column) => column.role === entity.role));

  return (
    <div className="model-graph">
      <div ref={container} className={`model-graph-canvas model-graph-columns-${columns.length}`}>
        <ul className="engine-entities model-graph-grid" aria-label="What WordLift understood">
          {/* Each caption precedes its own cards, so a phone's single column reads in order; on a wider screen
              dense placement lifts every caption to the first row of its column. */}
          {columns.flatMap((column, index) => [
            <li key={`caption-${column.role}`} className="model-graph-caption" style={{ gridColumn: index + 1 }} aria-hidden="true">
              {column.caption}
            </li>,
            ...entities
              .filter((entity) => entity.role === column.role)
              .map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  decision={decisions[entity.id]}
                  onDecide={onDecide}
                  filedBy={filedBy}
                  style={{ gridColumn: index + 1 }}
                  cardRef={(element) => {
                    if (element) cards.current.set(entity.id, element);
                    else cards.current.delete(entity.id);
                  }}
                />
              )),
          ])}
          {rest.map((entity) => (
            <EntityCard key={entity.id} entity={entity} decision={decisions[entity.id]} onDecide={onDecide} filedBy={filedBy} />
          ))}
        </ul>
        {edges.length > 0 && (
          <>
            <svg className="model-graph-edges" aria-hidden="true">
              <defs>
                <marker id="model-graph-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                </marker>
              </defs>
              {edges.map((edge) => (
                <path key={edge.key} d={edge.path} className={`model-graph-edge model-graph-edge-${edge.provenance}`} markerEnd="url(#model-graph-arrow)" />
              ))}
            </svg>
            {edges.map((edge) => (
              <span key={`label-${edge.key}`} className={`model-graph-label model-graph-label-${edge.provenance}`} style={{ left: edge.x, top: edge.y }} aria-hidden="true">
                {edge.label}
              </span>
            ))}
          </>
        )}
      </div>
      {/* What the lines say, for a reader who cannot see them, and the decisions on the ones read from the text. */}
      {shown.length > 0 && (
        <ul className="model-graph-legend" aria-label="How it fits together">
          {shown.map((relation) => {
            const key = relationKey(relation);
            const decided = relationDecisions[key];
            const provenance = decided === "confirm" ? "confirmed" : relation.provenance;
            return (
              <li key={key} className={`model-graph-relation model-graph-relation-${provenance}`}>
                <span>
                  <b>{names.get(relation.from)}</b> {EDGE_WORDS[relation.kind]} <b>{names.get(relation.to)}</b>
                  <small>
                    {provenance === "declared" ? " · declared by site" : provenance === "confirmed" ? " · confirmed" : " · read from the text"}
                  </small>
                </span>
                {onDecideRelation && relation.provenance === "inferred" && (
                  <span className="engine-entity-actions" role="group" aria-label={`Is it right that ${names.get(relation.from)} ${EDGE_WORDS[relation.kind]} ${names.get(relation.to)}?`} title={relation.evidence ? `Read from: “${relation.evidence}”` : undefined}>
                    <button type="button" aria-pressed={decided === "confirm"} onClick={() => onDecideRelation(key, "confirm")}>Right</button>
                    <button type="button" aria-pressed={decided === "reject"} onClick={() => onDecideRelation(key, "reject")}>Wrong</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

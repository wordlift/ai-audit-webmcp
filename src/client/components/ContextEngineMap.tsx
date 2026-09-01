import { Braces, ExternalLink, Link2, Network, Tags } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { CapabilityResult, ClassificationResult, ContextGraph } from "../../shared/types/index.js";

const MAX_ENTITIES = 8;
const MAX_ACTIONS = 10;
const LEXICAL_PREVIEW = 5;

/** Types that name the container or the company, not the thing the business offers. */
const GENERIC_ENTITY_TYPES = new Set(["WebSite", "WebPage", "Organization"]);

/**
 * The entity worth opening the map on: the concrete thing with the most bound actions. The map
 * then arrives with a lit path instead of waiting for the reader to discover the interaction.
 */
export function heroEntityId(context: ContextGraph): string | null {
  const candidates = context.entities.slice(0, MAX_ENTITIES);
  if (candidates.length === 0) return null;
  const degree = (id: string) => context.bindings.filter((binding) => binding.entityId === id).length;
  const ranked = [...candidates].sort((left, right) => {
    const generic = Number(left.types.some((t) => GENERIC_ENTITY_TYPES.has(t))) - Number(right.types.some((t) => GENERIC_ENTITY_TYPES.has(t)));
    return generic || degree(right.id) - degree(left.id);
  });
  return degree(ranked[0].id) > 0 ? ranked[0].id : null;
}

interface Focus {
  kind: "entity" | "action";
  id: string;
}

interface Edge {
  key: string;
  entityId: string;
  actionId: string;
  d: string;
}

export function ContextEngineMap({
  context,
  classification,
  capabilities,
  selectedEntityId,
  onSelectEntity,
}: {
  context: ContextGraph;
  classification: ClassificationResult;
  capabilities: CapabilityResult[];
  selectedEntityId: string | null;
  onSelectEntity: (entityId: string | null) => void;
}) {
  const selected = context.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const [hovered, setHovered] = useState<Focus | null>(null);
  const [lexicalExpanded, setLexicalExpanded] = useState(false);

  const entities = context.entities.slice(0, MAX_ENTITIES);
  const boundActionIds = new Set(context.bindings.map((binding) => binding.actionId));
  const actions = capabilities.filter((capability) => boundActionIds.has(capability.actionId)).slice(0, MAX_ACTIONS);

  // The wiring the columns promise: one edge per entity–action binding, both ends rendered.
  const renderedEntityIds = new Set(entities.map((entity) => entity.id));
  const renderedActionIds = new Set(actions.map((action) => action.actionId));
  const pairs = new Map<string, { entityId: string; actionId: string }>();
  for (const binding of context.bindings) {
    if (renderedEntityIds.has(binding.entityId) && renderedActionIds.has(binding.actionId)) {
      pairs.set(`${binding.entityId}→${binding.actionId}`, { entityId: binding.entityId, actionId: binding.actionId });
    }
  }

  // The lit circuit follows the hover when there is one, the selection otherwise.
  const focus: Focus | null = hovered ?? (selected ? { kind: "entity", id: selected.id } : null);
  const connected = new Set<string>();
  if (focus) {
    connected.add(focus.id);
    for (const { entityId, actionId } of pairs.values()) {
      if (focus.kind === "entity" && entityId === focus.id) connected.add(actionId);
      if (focus.kind === "action" && actionId === focus.id) connected.add(entityId);
    }
  }
  const litEdge = (edge: { entityId: string; actionId: string }) =>
    focus !== null && (focus.kind === "entity" ? edge.entityId === focus.id : edge.actionId === focus.id);

  // Geometry: measured after layout, redrawn when anything can move the cards.
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const entityRefs = useRef(new Map<string, HTMLElement>());
  const actionRefs = useRef(new Map<string, HTMLElement>());
  const [edges, setEdges] = useState<Edge[]>([]);
  const pairsKey = [...pairs.keys()].join("|");

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const box = canvas.getBoundingClientRect();
      const next: Edge[] = [];
      for (const [key, pair] of pairs) {
        const from = entityRefs.current.get(pair.entityId)?.getBoundingClientRect();
        const to = actionRefs.current.get(pair.actionId)?.getBoundingClientRect();
        if (!from || !to) continue;
        const x1 = from.right - box.left;
        const y1 = from.top + from.height / 2 - box.top;
        const x2 = to.left - box.left;
        const y2 = to.top + to.height / 2 - box.top;
        const bend = (x2 - x1) / 2;
        next.push({ key, ...pair, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` });
      }
      setEdges(next);
    };

    draw();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    return () => observer?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey, selectedEntityId, lexicalExpanded, context, capabilities]);

  // Vocabulary: deduplicated; when an entity is focused, only the language that belongs to it.
  const seenLexical = new Set<string>();
  const dedupedLexical = context.lexicalEntries.filter((entry) => {
    const key = `${entry.kind}:${entry.label.toLowerCase()}`;
    if (seenLexical.has(key)) return false;
    seenLexical.add(key);
    return true;
  });
  const ownLexical = selected ? dedupedLexical.filter((entry) => entry.entityIds.includes(selected.id)) : dedupedLexical;
  const lexical = ownLexical.length > 0 ? ownLexical : dedupedLexical.filter((entry) => entry.kind === "category");
  const visibleLexical = lexicalExpanded ? lexical.slice(0, 24) : lexical.slice(0, LEXICAL_PREVIEW);
  const hiddenLexical = lexical.length - visibleLexical.length;

  const interfaces = context.interfaces.filter(
    (item) => renderedActionIds.has(item.actionId) && (!selected || item.entityIds.includes(selected.id)),
  );
  const selectedActionCount = selected
    ? [...pairs.values()].filter((pair) => pair.entityId === selected.id).length
    : actions.length;

  const tally = [
    { label: "ready", tone: "ready", count: actions.filter((a) => a.state === "agent-ready" || a.state === "sidecar-enabled").length },
    { label: "unverified", tone: "unverified", count: actions.filter((a) => a.state === "unverified").length },
    { label: "human-only", tone: "human-only", count: actions.filter((a) => a.state === "human-only").length },
    { label: "missing", tone: "missing", count: actions.filter((a) => a.state === "missing").length },
  ].filter((entry) => entry.count > 0);

  return (
    <section className="context-engine" aria-labelledby="context-engine-title">
      <div className="context-engine-heading">
        <div>
          <p className="section-kicker">WordLift Context Engine</p>
          <h2 id="context-engine-title">From what the site means to what an agent can do</h2>
          <p>Domain entities, language, actions and interfaces are connected in one evidence-backed graph.</p>
        </div>
        <p className="page-count"><strong>{context.pages.length}</strong> representative page{context.pages.length === 1 ? "" : "s"} analyzed</p>
      </div>

      <section className="context-provenance-block" aria-labelledby="context-provenance-title">
        <div className="context-provenance-heading">
          <div>
            <p className="section-kicker">Evidence provenance</p>
            <h3 id="context-provenance-title">Pages used to understand this site</h3>
          </div>
          <p>Every entity, term and capability below traces back to this representative evidence set.</p>
        </div>
        <div className="context-provenance" aria-label="Analyzed pages">
          {context.pages.map((page) => (
            <a key={page.url} href={page.url} target="_blank" rel="noreferrer">
              <span>{page.role}</span>{page.title || new URL(page.url).pathname}<ExternalLink />
            </a>
          ))}
        </div>
      </section>

      <p className="context-compiler-note">
        <strong>{classification.primaryArchetype.replaceAll("-", " / ")}</strong> classification selects the expected
        action journey; observed entities and interfaces determine what is supported and what is missing.
      </p>

      <div className="context-layers" ref={canvasRef}>
        <svg className="context-edges" aria-hidden="true">
          {edges.map((edge) =>
            litEdge(edge) ? <path key={`${edge.key}:halo`} d={edge.d} className="context-edge-halo" /> : null,
          )}
          {edges.map((edge) => (
            <path
              key={edge.key}
              d={edge.d}
              data-lit={litEdge(edge) || undefined}
              className={`context-edge ${litEdge(edge) ? "context-edge-lit" : focus ? "context-edge-dim" : ""}`}
            />
          ))}
        </svg>

        <Layer icon={<Network />} eyebrow="Domain graph" title="Entities & offers">
          <div className="entity-list">
            {entities.map((entity) => (
              <button
                key={entity.id}
                type="button"
                ref={(node) => {
                  if (node) entityRefs.current.set(entity.id, node);
                  else entityRefs.current.delete(entity.id);
                }}
                className={`entity-card ${selected?.id === entity.id ? "entity-card-selected" : ""} ${focus && !connected.has(entity.id) ? "map-dimmed" : ""}`}
                aria-pressed={selected?.id === entity.id}
                onClick={() => onSelectEntity(selected?.id === entity.id ? null : entity.id)}
                onMouseEnter={() => setHovered({ kind: "entity", id: entity.id })}
                onMouseLeave={() => setHovered(null)}
              >
                <span>{entity.types[0]}</span>
                <strong>{entity.name}</strong>
                <small>{entity.offers.length > 0 ? `${entity.offers.length} offer${entity.offers.length === 1 ? "" : "s"}` : `${entity.sourceUrls.length} source page${entity.sourceUrls.length === 1 ? "" : "s"}`}</small>
              </button>
            ))}
            {entities.length === 0 && <p className="empty-layer">No named domain entity was extracted.</p>}
          </div>
        </Layer>

        <Layer icon={<Tags />} eyebrow="Lexical graph" title="Meaning & vocabulary">
          <div className="lexical-list">
            {visibleLexical.map((entry) => (
              <span key={entry.id} className={`lexical-chip lexical-${entry.kind}`}>
                <small>{entry.kind.replace("-", " ")}</small>{entry.label}
              </span>
            ))}
            {hiddenLexical > 0 && (
              <button type="button" className="lexical-more" onClick={() => setLexicalExpanded(true)}>
                +{hiddenLexical} more
              </button>
            )}
            {lexicalExpanded && lexical.length > LEXICAL_PREVIEW && (
              <button type="button" className="lexical-more" onClick={() => setLexicalExpanded(false)}>
                Show fewer
              </button>
            )}
          </div>
          <p className="layer-note">
            {selected
              ? `The language that connects ${selected.name} to its actions.`
              : "Google categories, entity names, aliases and page topics retain their provenance."}
          </p>
        </Layer>

        <Layer
          icon={<Braces />}
          eyebrow="Action layer"
          title="Functions & boundaries"
          aside={
            tally.length > 0 && (
              <span className="layer-tally" aria-label="Action readiness">
                {tally.map((entry) => (
                  <em key={entry.label} className={`layer-tally-chip tally-${entry.tone}`}>{entry.count} {entry.label}</em>
                ))}
              </span>
            )
          }
        >
          <div className="context-action-list">
            {actions.map((action) => (
              <span
                key={action.actionId}
                ref={(node) => {
                  if (node) actionRefs.current.set(action.actionId, node);
                  else actionRefs.current.delete(action.actionId);
                }}
                className={`context-action state-border-${action.state} ${focus && !connected.has(action.actionId) ? "map-dimmed" : ""}`}
                onMouseEnter={() => setHovered({ kind: "action", id: action.actionId })}
                onMouseLeave={() => setHovered(null)}
              >
                <strong>{action.label}</strong>
                <small>{action.state.replace("-", " ")}</small>
              </span>
            ))}
            {selected && selectedActionCount === 0 && <p className="empty-layer">No expected action is bound to {selected.name} yet.</p>}
          </div>
          <div className="interface-summary"><Link2 /> {interfaces.length} observed or declared interface{interfaces.length === 1 ? "" : "s"}</div>
        </Layer>
      </div>

    </section>
  );
}

function Layer({
  icon,
  eyebrow,
  title,
  aside,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article className="context-layer">
      <header>{icon}<div><span>{eyebrow}</span><h3>{title}</h3></div></header>
      {aside}
      {children}
    </article>
  );
}

import { ArrowRight, Braces, ExternalLink, Link2, Network, Tags } from "lucide-react";
import type { CapabilityResult, ClassificationResult, ContextGraph } from "../../shared/types/index.js";

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
  const bindings = selected
    ? context.bindings.filter((binding) => binding.entityId === selected.id)
    : context.bindings;
  const actionIds = new Set(bindings.map((binding) => binding.actionId));
  const actions = capabilities.filter((capability) => actionIds.has(capability.actionId));
  const lexical = context.lexicalEntries.filter(
    (entry) => !selected || entry.kind === "category" || entry.entityIds.includes(selected.id),
  );
  const interfaces = context.interfaces.filter(
    (item) => actionIds.has(item.actionId) && (!selected || item.entityIds.includes(selected.id)),
  );

  return (
    <section className="context-engine" aria-labelledby="context-engine-title">
      <div className="context-engine-heading">
        <div>
          <p className="section-kicker">WordLift Context Engine</p>
          <h2 id="context-engine-title">From what the site means to what an agent can do</h2>
          <p>Domain entities, language, actions and interfaces are connected in one evidence-backed graph.</p>
        </div>
        <p className="page-count"><strong>{context.pages.length}</strong> representative pages analyzed</p>
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

      <div className="context-layers">
        <Layer icon={<Network />} eyebrow="Domain graph" title="Entities & offers">
          <div className="entity-list">
            {context.entities.slice(0, 8).map((entity) => (
              <button
                key={entity.id}
                type="button"
                className={`entity-card ${selected?.id === entity.id ? "entity-card-selected" : ""}`}
                aria-pressed={selected?.id === entity.id}
                onClick={() => onSelectEntity(selected?.id === entity.id ? null : entity.id)}
              >
                <span>{entity.types[0]}</span>
                <strong>{entity.name}</strong>
                <small>{entity.offers.length > 0 ? `${entity.offers.length} offer${entity.offers.length === 1 ? "" : "s"}` : `${entity.sourceUrls.length} source page${entity.sourceUrls.length === 1 ? "" : "s"}`}</small>
              </button>
            ))}
            {context.entities.length === 0 && <p className="empty-layer">No named domain entity was extracted.</p>}
          </div>
        </Layer>

        <ArrowRight className="layer-arrow" aria-hidden="true" />

        <Layer icon={<Tags />} eyebrow="Lexical graph" title="Meaning & vocabulary">
          <div className="lexical-list">
            {lexical.slice(0, 10).map((entry) => (
              <span key={entry.id} className={`lexical-chip lexical-${entry.kind}`}>
                <small>{entry.kind.replace("-", " ")}</small>{entry.label}
              </span>
            ))}
          </div>
          <p className="layer-note">Google categories, entity names, aliases and page topics retain their provenance.</p>
        </Layer>

        <ArrowRight className="layer-arrow" aria-hidden="true" />

        <Layer icon={<Braces />} eyebrow="Action layer" title="Functions & boundaries">
          <div className="context-action-list">
            {actions.slice(0, 10).map((action) => (
              <span key={action.actionId} className={`context-action state-border-${action.state}`}>
                <strong>{action.label}</strong>
                <small>{action.state.replace("-", " ")}</small>
              </span>
            ))}
            {selected && actions.length === 0 && <p className="empty-layer">No expected action is bound to {selected.name} yet.</p>}
          </div>
          <div className="interface-summary"><Link2 /> {interfaces.length} observed or declared interface{interfaces.length === 1 ? "" : "s"}</div>
        </Layer>
      </div>

    </section>
  );
}

function Layer({ icon, eyebrow, title, children }: { icon: React.ReactNode; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="context-layer">
      <header>{icon}<div><span>{eyebrow}</span><h3>{title}</h3></div></header>
      {children}
    </article>
  );
}

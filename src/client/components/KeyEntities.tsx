import { ExternalLink } from "lucide-react";
import { actionsForEntityType } from "../../domain/evidence/schemaActions.js";
import type { CapabilityResult, SiteEntity } from "../../shared/types/index.js";

/**
 * The Key Entities layer of the Service Map: what the business offers, read from its own
 * structured data. Every card names its source, and the chips connect each entity to the actions
 * it justifies on the map below.
 */
export function KeyEntities({
  entities,
  capabilities,
  selectedId = null,
  onSelect,
}: {
  entities: SiteEntity[];
  capabilities: CapabilityResult[];
  selectedId?: string | null;
  onSelect?: (entityId: string) => void;
}) {
  if (entities.length === 0) return null;
  const labels = new Map(capabilities.map((capability) => [capability.actionId, capability.label]));

  return (
    <section className="key-entities" aria-label="Key entities">
      <div className="entity-grid">
        {entities.map((entity) => {
          const actions = actionsForEntityType(entity.type)
            .map((actionId) => labels.get(actionId))
            .filter((label): label is string => Boolean(label));
          const isSelected = selectedId === entity.id;
          const body = (
            <>
              <span className="entity-type">{entity.type}</span>
              <strong>{entity.name}</strong>
              {entity.description && <p className="entity-description">{entity.description}</p>}
              {offerLine(entity) && <p className="entity-offer">{offerLine(entity)}</p>}
            </>
          );
          return (
            <article
              className={`entity-card${isSelected ? " selected" : ""}${selectedId !== null && !isSelected ? " unselected" : ""}`}
              key={entity.id}
            >
              {onSelect ? (
                <button type="button" className="entity-trace" aria-pressed={isSelected} onClick={() => onSelect(entity.id)}>
                  {body}
                </button>
              ) : (
                <div className="entity-trace">{body}</div>
              )}
              {actions.length > 0 && (
                <p className="entity-actions" aria-label="Actions this entity justifies">
                  {actions.map((label) => <span className="category-chip" key={label}>{label}</span>)}
                </p>
              )}
              <a className="entity-source" href={entity.sourceUrl} target="_blank" rel="noreferrer">
                {entity.method} · {entity.collectedAt.slice(0, 10)} <ExternalLink size={13} />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function offerLine(entity: SiteEntity): string | null {
  const offer = entity.offer;
  if (!offer) return null;
  const parts: string[] = [];
  if (offer.price) parts.push(`From ${offer.price}${offer.priceCurrency ? ` ${offer.priceCurrency}` : ""}`);
  // schema.org availability tokens read fine once the camel case is spaced out.
  if (offer.availability) parts.push(offer.availability.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
  if (offer.validThrough) parts.push(`until ${offer.validThrough}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

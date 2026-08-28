import { useState } from "react";
import { actionsForEntityType } from "../../domain/evidence/schemaActions.js";
import type { Archetype, ReportRecord } from "../../shared/types/index.js";
import { ActionJourney } from "./ActionJourney";
import { ClassificationCard } from "./ClassificationCard";
import { KeyEntities } from "./KeyEntities";

/**
 * The Agent Service Map as one connected view: what the business offers, what it means, and what
 * an agent may do — with a selectable trace from an entity to the actions it justifies. The three
 * layers share one selection state, so the connection is shown, not asserted.
 */
export function ServiceMap({ report, onOverride }: { report: ReportRecord; onOverride: (archetype: Archetype) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entities = report.entities ?? [];
  const capabilities = report.capabilities ?? [];

  const selected = entities.find((entity) => entity.id === selectedId) ?? null;
  const linked = selected
    ? actionsForEntityType(selected.type).filter((actionId) =>
        capabilities.some((capability) => capability.actionId === actionId),
      )
    : [];
  const focusActionIds = selected && linked.length > 0 ? new Set(linked) : null;

  return (
    <section className="service-map" aria-label="Agent Service Map">
      <div className="service-map-heading">
        <h2>From what this business offers to what an agent may do</h2>
        <p>
          {entities.length > 0
            ? "Select an entity to trace the actions it justifies. Open any action for its evidence, boundary, and contract."
            : "Open any action for its evidence, boundary, and contract."}
        </p>
      </div>

      {entities.length > 0 ? (
        <KeyEntities
          entities={entities}
          capabilities={capabilities}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((current) => (current === id ? null : id))}
        />
      ) : (
        <div className="entity-empty" role="note">
          <strong>No named entities in the audited page's structured data.</strong>
          <p>
            An agent arriving here finds no source-backed offer to ground an intent in, so the map
            starts at the actions layer. Publishing the catalogue as JSON-LD entities is the first
            gap to close.
          </p>
        </div>
      )}

      {selected && (
        <p className="trace-status" role="status">
          {focusActionIds ? (
            <>
              Showing the {focusActionIds.size} action{focusActionIds.size === 1 ? "" : "s"}{" "}
              <strong>{selected.name}</strong> justifies.
            </>
          ) : (
            <>
              <strong>{selected.name}</strong> maps to no expected action in this report.
            </>
          )}
          <button type="button" onClick={() => setSelectedId(null)}>Show all</button>
        </p>
      )}

      {report.classification && <ClassificationCard classification={report.classification} onOverride={onOverride} />}
      <ActionJourney
        reportId={report.id}
        capabilities={capabilities}
        classification={report.classification}
        entities={entities}
        focusActionIds={focusActionIds}
      />
    </section>
  );
}

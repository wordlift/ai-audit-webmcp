import { useState } from "react";
import { actionsForEntityType } from "../../domain/evidence/schemaActions.js";
import type { Archetype, ReportRecord } from "../../shared/types/index.js";
import { ActionJourney } from "./ActionJourney";
import { Chapter } from "./Chapter";
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
    <>
      <Chapter
        id="chapter-entities"
        step={2}
        title="Key entities & offers"
        lede={
          entities.length > 0
            ? "What this business offers, read from its own structured data — every card links to its source. Select an entity to trace the actions it justifies."
            : "What this business offers, read from its own structured data."
        }
      >
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
      </Chapter>

      {report.classification && (
        <Chapter
          id="chapter-meaning"
          step={3}
          title="Meaning, source & provenance"
          lede="How the site was read: the content, behavior, and confidence behind every expectation on this map."
        >
          <ClassificationCard classification={report.classification} onOverride={onOverride} />
        </Chapter>
      )}

      <Chapter
        id="chapter-actions"
        step={4}
        title="Governed actions, boundaries & delivery"
        lede="Open any action for its evidence, its boundary, and the contract that closes the gap."
      >
        <ActionJourney
          reportId={report.id}
          capabilities={capabilities}
          classification={report.classification}
          entities={entities}
          focusActionIds={focusActionIds}
        />
      </Chapter>
    </>
  );
}

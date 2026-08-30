import { Bot, CircleHelp, UserRound } from "lucide-react";
import type { CapabilityResult } from "../../shared/types/index.js";

export function ActionNode({
  capability,
  selectedEntityId,
  onSelect,
}: {
  capability: CapabilityResult;
  selectedEntityId: string | null;
  onSelect: (capability: CapabilityResult, trigger: HTMLButtonElement) => void;
}) {
  const selectedEntity = capability.appliesTo.find((entity) => entity.id === selectedEntityId);
  const dimmed = Boolean(selectedEntityId) && !selectedEntity;
  return (
    <button
      type="button"
      className={`action-node state-border-${capability.state} ${dimmed ? "action-node-dimmed" : ""}`}
      onClick={(event) => onSelect(capability, event.currentTarget)}
    >
      <span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span>
      <strong>{capability.label}{selectedEntity ? <> for <em>{selectedEntity.name}</em></> : ""}</strong>
      {capability.appliesTo.length > 0 && (
        <span className="entity-chips" aria-label="Entities this action applies to">
          {capability.appliesTo.slice(0, 3).map((entity) => (
            <span key={entity.id} className={entity.id === selectedEntityId ? "entity-chip-selected" : ""}>
              {entity.types[0]} · {entity.name}
            </span>
          ))}
        </span>
      )}
      <span className="support-row">
        <span className={capability.humanSupport ? "supported" : "unsupported"}><UserRound /> Human {capability.humanSupport ? "yes" : "no"}</span>
        <span className={capability.agentSupport ? "supported" : "unsupported"}><Bot /> Agent {capability.agentSupport ? "yes" : "no"}</span>
      </span>
      <span className="inspect-label"><CircleHelp /> Inspect evidence & contract</span>
    </button>
  );
}

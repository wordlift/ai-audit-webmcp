import { ArrowUpRight, Bot, CircleHelp, UserRound } from "lucide-react";
import type { CapabilityResult } from "../../shared/types/index.js";
import { BOUNDARY_LABELS } from "./ServiceMapProvenance";

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
  const humanEvidence = capability.evidence.filter((item) => item.audience === "human");
  const agentEvidence = capability.evidence.filter((item) => item.audience === "agent");
  return (
    <button
      type="button"
      className={`action-node state-border-${capability.state} ${dimmed ? "action-node-dimmed" : ""}`}
      onClick={(event) => onSelect(capability, event.currentTarget)}
    >
      <span className="action-node-meta">
        <span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span>
        {/* A human decision about responsibility outranks the generic chips. */}
        {capability.boundary && <span className={`boundary-chip boundary-${capability.boundary}`}>{BOUNDARY_LABELS[capability.boundary]}</span>}
        {/* Observed on the site even though the current site type does not expect it. */}
        {!capability.boundary && !capability.expected && <span className="importance-label">Beyond site type</span>}
        {!capability.boundary && capability.expected && capability.importance === 3 && <span className="importance-label">Core action</span>}
      </span>
      <span className="action-node-copy">
        <strong>{capability.label}{selectedEntity ? <> for <em>{selectedEntity.name}</em></> : ""}</strong>
        <small>{capability.description}</small>
      </span>
      {capability.appliesTo.length > 0 && (
        <span className="entity-chips" aria-label="Entities this action applies to">
          {capability.appliesTo.slice(0, 3).map((entity) => (
            <span key={entity.id} className={entity.id === selectedEntityId ? "entity-chip-selected" : ""}>
              {entity.types[0]} · {entity.name}
            </span>
          ))}
          {capability.appliesTo.length > 3 && <span>+{capability.appliesTo.length - 3} more</span>}
        </span>
      )}
      <span className="support-row">
        <span className={capability.humanSupport ? "supported" : "unsupported"}>
          <UserRound /><span><small>For people</small>{capability.humanSupport ? "Observed" : "Not found"}</span>
          {humanEvidence.length > 0 && <em>{humanEvidence.length}</em>}
        </span>
        <span className={capability.agentSupport ? "supported" : capability.state === "unverified" ? "declared" : "unsupported"}>
          <Bot /><span><small>For agents</small>{agentLabel(capability.state)}</span>
          {agentEvidence.length > 0 && <em>{agentEvidence.length}</em>}
        </span>
      </span>
      <span className="action-node-next"><span><ArrowUpRight />{nextStep(capability.state)}</span><span className="inspect-label"><CircleHelp /> Evidence & contract</span></span>
    </button>
  );
}

function agentLabel(state: CapabilityResult["state"]): string {
  if (state === "agent-ready" || state === "sidecar-enabled") return "Verified";
  if (state === "unverified") return "Declared";
  return "Not ready";
}

function nextStep(state: CapabilityResult["state"]): string {
  switch (state) {
    case "agent-ready": return "Maintain verification";
    case "sidecar-enabled": return "Sidecar is active";
    case "unverified": return "Verify this interface";
    case "human-only": return "Expose this flow to agents";
    case "missing": return "Implement the contract";
    default: return "Review this capability";
  }
}

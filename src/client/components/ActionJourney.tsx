import { useState } from "react";
import type { CapabilityResult } from "../../shared/types/index.js";
import { ActionDetailDialog } from "./ActionDetailDialog";
import { ActionNode } from "./ActionNode";

const stages = [
  { id: "discover", label: "Discover", description: "Find the right thing" },
  { id: "understand-decide", label: "Understand & decide", description: "Evaluate with evidence" },
  { id: "act", label: "Act", description: "Move intent forward" },
  { id: "manage", label: "Manage", description: "Track or change state" },
] as const;

export function ActionJourney({
  reportId,
  capabilities,
  selectedEntityId = null,
}: {
  reportId: string;
  capabilities: CapabilityResult[];
  selectedEntityId?: string | null;
}) {
  const [selected, setSelected] = useState<CapabilityResult | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  function select(capability: CapabilityResult, trigger: HTMLButtonElement) {
    setReturnFocus(trigger);
    setSelected(capability);
  }
  function changeOpen(open: boolean) {
    if (open) return;
    setSelected(null);
    window.setTimeout(() => returnFocus?.focus(), 0);
  }
  return (
    <section className="action-map" aria-labelledby="action-map-title">
      <div className="action-map-heading">
        <div><p className="section-kicker">Capability map</p><h2 id="action-map-title">What an agent should be able to do</h2></div>
        <StateLegend />
      </div>
      <div className="action-journey">
        {stages.map((stage, index) => (
          <section className="action-stage" key={stage.id} aria-labelledby={`stage-${stage.id}`}>
            <header><span>{index + 1}</span><div><h3 id={`stage-${stage.id}`}>{stage.label}</h3><p>{stage.description}</p></div></header>
            <div className="action-list">
              {capabilities.filter((capability) => capability.stage === stage.id).map((capability) => (
                <ActionNode
                  key={capability.actionId}
                  capability={capability}
                  selectedEntityId={selectedEntityId}
                  onSelect={select}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <ActionDetailDialog reportId={reportId} capability={selected} onOpenChange={changeOpen} />
    </section>
  );
}

function StateLegend() {
  return <div className="state-legend" aria-label="Capability states">{[
    ["agent-ready", "Agent ready"], ["sidecar-enabled", "Sidecar enabled"], ["unverified", "Unverified"], ["human-only", "Human only"], ["missing", "Missing"],
  ].map(([state, label]) => <span key={state}><i className={`state-dot state-${state}`} />{label}</span>)}</div>;
}

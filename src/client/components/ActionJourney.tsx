import { useState } from "react";
import type { CapabilityResult, ClassificationResult, SiteEntity } from "../../shared/types/index.js";
import { ActionDetailDialog } from "./ActionDetailDialog";
import { ActionNode } from "./ActionNode";

const stages = [
  { id: "discover", label: "Discover", description: "Find the right thing" },
  { id: "understand-decide", label: "Understand & decide", description: "Evaluate with evidence" },
  { id: "act", label: "Act", description: "Move intent forward" },
  { id: "manage", label: "Manage", description: "Track or change state" },
] as const;

const VERIFIED_STATES = new Set(["agent-ready", "sidecar-enabled"]);

export function ActionJourney({ reportId, capabilities, classification, entities = [], focusActionIds = null }: { reportId: string; capabilities: CapabilityResult[]; classification?: ClassificationResult; entities?: SiteEntity[]; focusActionIds?: Set<string> | null }) {
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
        <div><p className="section-kicker">Key actions</p><h3 id="action-map-title">What an agent should be able to do</h3></div>
        <StateLegend />
      </div>
      <div className="action-journey">
        {stages.map((stage, index) => {
          const stageActions = capabilities.filter((capability) => capability.stage === stage.id);
          const verified = stageActions.filter((capability) => VERIFIED_STATES.has(capability.state)).length;
          return (
            <section className="action-stage" key={stage.id} aria-labelledby={`stage-${stage.id}`}>
              <header>
                <span>{index + 1}</span>
                <div><h4 id={`stage-${stage.id}`}>{stage.label}</h4><p>{stage.description}</p></div>
                <span className="stage-count">{verified}/{stageActions.length} verified</span>
              </header>
              <div className="action-list">
                {stageActions.map((capability) => (
                  <ActionNode
                    key={capability.actionId}
                    capability={capability}
                    onSelect={select}
                    emphasis={focusActionIds ? (focusActionIds.has(capability.actionId) ? "linked" : "dimmed") : undefined}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <ActionDetailDialog reportId={reportId} capability={selected} classification={classification} entities={entities} onOpenChange={changeOpen} />
    </section>
  );
}

function StateLegend() {
  return <div className="state-legend" aria-label="Capability states">{[
    ["agent-ready", "Agent ready"], ["sidecar-enabled", "Sidecar enabled"], ["unverified", "Unverified"], ["human-only", "Human only"], ["missing", "Missing"],
  ].map(([state, label]) => <span key={state}><i className={`state-dot state-${state}`} />{label}</span>)}</div>;
}

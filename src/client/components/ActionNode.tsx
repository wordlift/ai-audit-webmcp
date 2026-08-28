import { Bot, CircleHelp, UserRound } from "lucide-react";
import type { CapabilityResult } from "../../shared/types/index.js";

export function ActionNode({ capability, onSelect, emphasis }: { capability: CapabilityResult; onSelect: (capability: CapabilityResult, trigger: HTMLButtonElement) => void; emphasis?: "linked" | "dimmed" }) {
  return (
    <button type="button" className={`action-node state-border-${capability.state}${emphasis ? ` ${emphasis}` : ""}`} onClick={(event) => onSelect(capability, event.currentTarget)}>
      <span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span>
      <strong>{capability.label}</strong>
      <span className="support-row">
        <span className={capability.humanSupport ? "supported" : "unsupported"}><UserRound /> Human {capability.humanSupport ? "yes" : "no"}</span>
        <span className={capability.agentSupport ? "supported" : "unsupported"}><Bot /> Agent {capability.agentSupport ? "yes" : "no"}</span>
      </span>
      <span className="inspect-label"><CircleHelp /> Inspect evidence & contract</span>
    </button>
  );
}

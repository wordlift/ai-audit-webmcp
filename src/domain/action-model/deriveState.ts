import type { CapabilityEvidence, CapabilityResult } from "../../shared/types/index.js";
import type { CompiledAction } from "./compileGraph.js";

export interface DeriveStateOptions {
  expected?: boolean;
  approvedSidecar?: boolean;
}

export function deriveCapability(
  action: CompiledAction,
  evidence: CapabilityEvidence[],
  options: DeriveStateOptions = {},
): CapabilityResult {
  const expected = options.expected ?? true;
  const humanEvidence = evidence.filter((item) => item.audience === "human");
  const agentEvidence = evidence.filter((item) => item.audience === "agent");
  const humanSupport = humanEvidence.some((item) => ["observed", "invoked"].includes(item.verification));
  const invokedAgent = agentEvidence.some((item) => item.verification === "invoked");
  const conflictingAgentEvidence = agentEvidence.some((item) => item.verification === "failed");

  let state: CapabilityResult["state"];
  if (!expected) state = "not-expected";
  else if (options.approvedSidecar && invokedAgent) state = "sidecar-enabled";
  else if (invokedAgent && !conflictingAgentEvidence) state = "agent-ready";
  else if (agentEvidence.length > 0) state = "unverified";
  else if (humanSupport) state = "human-only";
  else state = "missing";

  return {
    actionId: action.id,
    label: action.label,
    description: action.description,
    stage: action.stage,
    intent: action.intent,
    importance: action.importance,
    expected,
    expectationSource: action.expectationSource,
    state,
    humanSupport,
    agentSupport: invokedAgent && !conflictingAgentEvidence,
    evidence: [...evidence].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

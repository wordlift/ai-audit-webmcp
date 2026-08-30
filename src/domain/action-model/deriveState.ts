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

  /**
   * A successful invocation is proof, and a failure elsewhere does not undo it: a site may
   * advertise one broken route and one that works, and an agent that completed the call can
   * complete it. Without a proof any agent evidence already lands on `unverified`, so blocking
   * on a failed check here would only ever cancel something the audit had actually done. The
   * failure stays in the evidence list either way.
   */
  let state: CapabilityResult["state"];
  if (!expected) state = "not-expected";
  else if (options.approvedSidecar && invokedAgent) state = "sidecar-enabled";
  else if (invokedAgent) state = "agent-ready";
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
    agentSupport: invokedAgent,
    appliesTo: [],
    evidence: [...evidence].sort((left, right) => left.id.localeCompare(right.id)),
  };
}

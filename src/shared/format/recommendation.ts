import type { CapabilityResult } from "../types/index.js";

/**
 * Why an action the site declares was left unverified without a call having failed: the audit
 * listed an interface for it and did not call it. Most often the per-endpoint call budget was
 * spent before its turn; sometimes the tool was not marked read-only, or needed an input the audit
 * would have had to invent. None of that says the interface does not work, and the advice that
 * follows is to test it, never to build it.
 */
export interface Untested {
  tools: string[];
  /** True when the only thing that stopped the call was the scan's own budget. */
  budget: boolean;
  /** The audit's own words for why it did not call, when it was not the budget. */
  note?: string;
}

const NOT_CALLED = /^"([^"]+)" is listed by the site's live MCP server, but it was not called(?:: (.+))?$/;

export function untestedInScan(capability: Pick<CapabilityResult, "state" | "evidence">): Untested | null {
  if (capability.state !== "unverified") return null;
  const agent = capability.evidence.filter((item) => item.audience === "agent");
  // A call that was made and failed is a finding of its own, and is told as one.
  if (agent.some((item) => item.verification === "failed")) return null;
  const listed = agent.map((item) => NOT_CALLED.exec(item.claim)).filter((match): match is RegExpExecArray => Boolean(match));
  if (listed.length === 0) return null;
  const overBudget = listed.filter((match) => /call budget/.test(match[2] ?? ""));
  const chosen = overBudget.length > 0 ? overBudget : listed;
  const note = overBudget.length > 0 ? undefined : chosen.find((match) => match[2])?.[2];
  return { tools: [...new Set(chosen.map((match) => match[1]!))], budget: overBudget.length > 0, ...(note ? { note } : {}) };
}

const quoted = (tools: string[]) => tools.map((tool) => `"${tool}"`).join(", ");

/** One next step per state, said from what the audit actually did. */
export function recommendationFor(capability: CapabilityResult): string {
  if (capability.state === "human-only") {
    return `Expose ${capability.label.toLowerCase()} as a typed agent function using the existing human workflow as approved evidence.`;
  }
  if (capability.state === "unverified") {
    const untested = untestedInScan(capability);
    if (untested?.budget) {
      return `Run a verification call. ${quoted(untested.tools)} ${untested.tools.length === 1 ? "is" : "are"} listed by the site's MCP server and ${untested.tools.length === 1 ? "was" : "were"} not called: this scan's call budget was spent first. Nothing needs building to find out whether ${capability.label.toLowerCase()} answers; test this one action, or run the audit again.`;
    }
    if (untested) {
      return `Run a verification call. ${quoted(untested.tools)} ${untested.tools.length === 1 ? "is" : "are"} listed by the site's MCP server and ${untested.tools.length === 1 ? "was" : "were"} not called in this scan${untested.note ? ` (${untested.note})` : ""}. Test ${capability.label.toLowerCase()} before changing anything.`;
    }
    return `Make ${capability.label.toLowerCase()} callable in a controlled environment and record a successful invocation.`;
  }
  return `Implement ${capability.label.toLowerCase()} with the contract inputs, outputs, and governance requirements shown here.`;
}

/**
 * The advice for a gap as a report states it today. A report stored earlier carries the sentence
 * that was written when it was compiled; what the audit did is in its evidence, so the advice is
 * read from the evidence each time rather than from that sentence.
 */
export function currentRecommendation(capability: CapabilityResult): string | null {
  // Only where the stored sentence can contradict the evidence: an action listed and never called.
  if (untestedInScan(capability)) return recommendationFor(capability);
  if (capability.recommendation) return capability.recommendation;
  return capability.state === "agent-ready" || capability.state === "not-expected" ? null : recommendationFor(capability);
}

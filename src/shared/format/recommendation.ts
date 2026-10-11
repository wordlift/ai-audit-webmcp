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
      return `Not tested within this scan's budget: ${quoted(untested.tools)} ${untested.tools.length === 1 ? "is" : "are"} listed by the site's MCP server and ${untested.tools.length === 1 ? "was" : "were"} not called. Nothing needs building to find out: verify ${capability.label.toLowerCase()} with a targeted test of this action, or run the audit again.`;
    }
    if (untested) {
      return `Not tested in this scan: ${quoted(untested.tools)} ${untested.tools.length === 1 ? "is" : "are"} listed by the site's MCP server and ${untested.tools.length === 1 ? "was" : "were"} not called${untested.note ? ` (${untested.note})` : ""}. Verify ${capability.label.toLowerCase()} with a targeted test before changing anything.`;
    }
    return `Make ${capability.label.toLowerCase()} callable in a controlled environment and record a successful invocation.`;
  }
  return `Implement ${capability.label.toLowerCase()} with the contract inputs, outputs, and governance requirements shown here.`;
}

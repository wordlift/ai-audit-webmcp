import { describe, expect, it } from "vitest";
import { failureReason, remedyFor } from "../../src/client/components/ActionDetailDialog";
import type { CapabilityResult } from "../../src/shared/types/index.js";

const failedCall = {
  id: "entry-point-availability.check-CheckAction",
  actionId: "availability.check",
  audience: "agent" as const,
  kind: "api-result" as const,
  sourceUrl: "https://alpina.travel/api/availability",
  claim: "The site's declared CheckAction entry point did not answer when an agent executed it: it answered HTTP 500",
  confidence: 0.9,
  verification: "failed" as const,
  collectedAt: "2026-09-18T05:00:00.000Z",
};

function capability(overrides: Partial<CapabilityResult>): CapabilityResult {
  return { actionId: "availability.check", label: "Check availability", description: "", stage: "act", intent: "transactional", importance: 3, expected: true, expectationSource: ["archetype"], humanSupport: true, agentSupport: false, appliesTo: [], evidence: [], state: "unverified", ...overrides };
}

describe("what needs to change when the site says agents can, and our call did not answer", () => {
  it("says what the call met, why a first try can fail, and offers to try it yourself where a server can reach", () => {
    const remedy = remedyFor(capability({ evidence: [failedCall] }), "r1", null, true);
    expect(remedy.reason).toBe(failedCall.claim);
    expect(remedy.required).toMatch(/A first call can fail for reasons that have nothing to do with the interface/);
    expect(remedy.cta).toEqual({ label: "Try it yourself", test: true });
    expect(failureReason(capability({ evidence: [{ ...failedCall, audience: "human" }] }))).toBeNull();
  });

  it("points at the evidence where nothing can be called from here", () => {
    const remedy = remedyFor(capability({ evidence: [failedCall] }), "r1", null, false);
    expect(remedy.cta).toEqual({ label: "Inspect the failure", inspect: true });
    expect(remedy.required).toMatch(/running the audit again tries once more/);
    expect(remedyFor(capability({}), "r1", null, false).cta).toEqual({ label: "Inspect the declaration", inspect: true });
  });
});

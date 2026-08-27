import type { CapabilityResult, ReadinessScore } from "../../shared/types/index.js";

export function scoreReadiness(capabilities: CapabilityResult[]): ReadinessScore {
  const expected = capabilities.filter((capability) => capability.expected);
  const expectedWeight = expected.reduce((sum, capability) => sum + capability.importance, 0);
  const verified = expected.filter((capability) =>
    capability.state === "agent-ready" || capability.state === "sidecar-enabled",
  );
  const verifiedWeight = verified.reduce((sum, capability) => sum + capability.importance, 0);
  return {
    value: expectedWeight === 0 ? 0 : Math.round((100 * verifiedWeight) / expectedWeight),
    verifiedWeight,
    expectedWeight,
    counts: {
      expected: expected.length,
      ready: verified.length,
      unverified: expected.filter((capability) => capability.state === "unverified").length,
      humanOnly: expected.filter((capability) => capability.state === "human-only").length,
      missing: expected.filter((capability) => capability.state === "missing").length,
    },
  };
}

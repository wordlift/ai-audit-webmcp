import { capabilityResultSchema, entityActionBindingSchema } from "../../src/shared/schemas/report.js";

/**
 * `sidecar-enabled` was a fifth state until September 2026. Reports stored with it are still in
 * Firestore for thirty days and in every screenshot of the hackathon build, so the value must
 * keep parsing — as what it always meant: agent-ready, with WordLift running the interface.
 */
function capability(overrides: Record<string, unknown>) {
  return {
    actionId: "availability.check",
    label: "Check availability",
    description: "Whether a stay is available for given dates.",
    stage: "understand-decide",
    intent: "informational",
    importance: 3,
    expected: true,
    expectationSource: ["archetype"],
    humanSupport: true,
    agentSupport: true,
    appliesTo: [],
    evidence: [],
    ...overrides,
  };
}

describe("a report stored with the retired sidecar-enabled state", () => {
  it("reads as agent-ready, run by the sidecar", () => {
    const parsed = capabilityResultSchema.parse(capability({ state: "sidecar-enabled" }));
    expect(parsed.state).toBe("agent-ready");
    expect(parsed.via).toBe("sidecar");
  });

  it("leaves an action the site itself verified alone", () => {
    const parsed = capabilityResultSchema.parse(capability({ state: "agent-ready", via: "site" }));
    expect(parsed.state).toBe("agent-ready");
    expect(parsed.via).toBe("site");
  });

  it("does not invent provenance for a state that has none", () => {
    const parsed = capabilityResultSchema.parse(capability({ state: "unverified" }));
    expect(parsed.state).toBe("unverified");
    expect(parsed.via).toBeUndefined();
  });

  it("normalises the same value on an entity binding", () => {
    const parsed = entityActionBindingSchema.parse({
      entityId: "https://alpina.travel/#sam-spitze",
      actionId: "availability.check",
      role: "object",
      basis: ["observed-interface"],
      state: "sidecar-enabled",
      evidenceIds: [],
      interfaceIds: [],
      confidence: 0.9,
    });
    expect(parsed.state).toBe("agent-ready");
  });

  it("still refuses a state that never existed", () => {
    expect(() => capabilityResultSchema.parse(capability({ state: "sidecar-pending" }))).toThrow();
  });
});

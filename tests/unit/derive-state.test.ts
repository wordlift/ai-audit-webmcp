import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { deriveCapability } from "../../src/domain/action-model/deriveState.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import type { CapabilityEvidence } from "../../src/shared/types/index.js";

const action = compileActionGraph(loadActionModel(), "other").actions[0];
const collectedAt = "2026-08-27T05:00:00.000Z";
const evidence = (overrides: Partial<CapabilityEvidence>): CapabilityEvidence => ({
  id: "evidence-1",
  actionId: action.id,
  audience: "agent",
  kind: "webmcp",
  sourceUrl: "https://example.com/",
  claim: "A tool was found",
  confidence: 1,
  verification: "declared",
  collectedAt,
  ...overrides,
});

describe("capability state truth table", () => {
  it.each([
    [[], {}, "missing"],
    [[evidence({ audience: "human", kind: "form", verification: "observed" })], {}, "human-only"],
    [[evidence({ verification: "declared" })], {}, "unverified"],
    [[evidence({ verification: "invoked" })], {}, "agent-ready"],
    [[evidence({ verification: "invoked", kind: "tool-result" })], { approvedSidecar: true }, "sidecar-enabled"],
    // A broken route alongside a working one does not undo a call the audit completed.
    [[evidence({ verification: "invoked" }), evidence({ id: "failed", verification: "failed" })], {}, "agent-ready"],
    [[evidence({ verification: "declared" }), evidence({ id: "failed", verification: "failed" })], {}, "unverified"],
    [[], { expected: false }, "not-expected"],
    // Observed evidence outranks the archetype: an unexpected action keeps its evidence-based state.
    [[evidence({ audience: "human", kind: "form", verification: "observed" })], { expected: false }, "human-only"],
    [[evidence({ verification: "declared" })], { expected: false }, "unverified"],
    [[evidence({ verification: "invoked" })], { expected: false }, "agent-ready"],
  ] as const)("derives %s", (items, options, expected) => {
    expect(deriveCapability(action, [...items], options).state).toBe(expected);
  });
});

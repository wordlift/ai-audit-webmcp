import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { currentRecommendation, recommendationFor, untestedInScan } from "../../src/shared/format/recommendation.js";
import type { CapabilityResult } from "../../src/shared/types/index.js";
import { deriveCapability } from "../../src/domain/action-model/deriveState.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { rankPriorities } from "../../src/domain/action-model/rankPriorities.js";

describe("priority ranking", () => {
  it("returns a stable top three using severity, feasibility, and display order", () => {
    const actions = compileActionGraph(loadActionModel(), "commerce-retail").actions;
    const capabilities = actions.map((action, index) => deriveCapability(action, index === 0 ? [{
      id: "human-search",
      actionId: action.id,
      audience: "human",
      kind: "form",
      sourceUrl: "https://shop.example/",
      claim: "Humans can search",
      confidence: 1,
      verification: "observed",
      collectedAt: "2026-08-27T05:00:00.000Z",
    }] : []));
    const first = rankPriorities(capabilities);
    expect(rankPriorities(capabilities)).toEqual(first);
    expect(first).toHaveLength(3);
    expect(first[0].priorityScore).toBeGreaterThanOrEqual(first[1].priorityScore);
  });

  it("says not tested within the scan's budget, and asks for a test, when a listed tool was never called", () => {
    const listed = (note: string): CapabilityResult => ({
      actionId: "availability.check", label: "Check availability", description: "d", stage: "act", intent: "informational", importance: 3, expected: true, expectationSource: ["archetype:travel-hospitality"], humanSupport: true, agentSupport: false, appliesTo: [],
      state: "unverified",
      evidence: [
        { id: "mcp-tool-check_booking_availability", actionId: "availability.check", audience: "agent" as const, kind: "discovery" as const, sourceUrl: "https://alpina.travel/mcp", claim: `"check_booking_availability" is listed by the site's live MCP server, but it was not called${note}`, confidence: 0.9, verification: "declared" as const, collectedAt: "2026-10-11T08:00:00.000Z" },
      ],
    });
    const overBudget = listed(": the per-endpoint call budget was already spent");
    expect(untestedInScan(overBudget)).toEqual({ tools: ["check_booking_availability"], budget: true });
    expect(recommendationFor(overBudget)).toMatch(/^Run a verification call\. "check_booking_availability" is listed by the site's MCP server and was not called: this scan's call budget was spent first\./);
    expect(recommendationFor(overBudget)).not.toMatch(/Make .* callable/);
    // A report compiled before this wording still carries the old sentence; what is read out follows the evidence.
    expect(currentRecommendation({ ...overBudget, recommendation: "Make check availability callable in a controlled environment and record a successful invocation." })).toMatch(/^Run a verification call\./);
    // Not called for another reason is said with that reason, and still asks for a test before anything is changed.
    expect(recommendationFor(listed(": not annotated read-only"))).toContain("\"check_booking_availability\" is listed by the site's MCP server and was not called in this scan (not annotated read-only).");
    // A call that was made and failed is a different finding, and keeps its own advice.
    const failed: CapabilityResult = { ...overBudget, evidence: [...overBudget.evidence, { ...overBudget.evidence[0]!, id: "mcp-call-failed-x", verification: "failed" as const, claim: "\"x\" is declared by the site's live MCP server but the call failed: timeout" }] };
    expect(untestedInScan(failed)).toBeNull();
    expect(recommendationFor(failed)).toMatch(/^Make check availability callable/);
  });
});

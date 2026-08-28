import { describe, expect, it } from "vitest";
import {
  describeSignal,
  explainClassification,
  explainExpectation,
} from "../../src/shared/format/explainExpectation.js";
import type { CapabilityResult, ClassificationResult } from "../../src/shared/types/index.js";

function classificationWith(overrides: Partial<ClassificationResult> = {}): ClassificationResult {
  return {
    primaryArchetype: "travel-hospitality",
    categories: [{ name: "/Travel/Hotels & Accommodations", confidence: 0.97 }],
    rankedArchetypes: [
      { archetype: "travel-hospitality", score: 6.2 },
      { archetype: "commerce-retail", score: 1.1 },
    ],
    confidence: "high",
    margin: 5.1,
    provisional: false,
    model: "google-natural-language-v2",
    collectedAt: "2026-08-28T05:00:00.000Z",
    signals: [
      "agent:webmcp",
      "agent:webmcp-imperative",
      "path:booking",
      "schema:ImageObject",
      "schema:LodgingBusiness",
    ],
    ...overrides,
  };
}

function capabilityWith(overrides: Partial<CapabilityResult> = {}): CapabilityResult {
  return {
    actionId: "availability.check",
    label: "Check availability",
    description: "Check time-sensitive availability.",
    stage: "act",
    intent: "informational",
    importance: 3,
    expected: true,
    expectationSource: ["archetype:travel-hospitality", "category:/Travel/Hotels & Accommodations"],
    state: "unverified",
    humanSupport: true,
    agentSupport: false,
    evidence: [],
    ...overrides,
  };
}

describe("explaining why an action is expected", () => {
  it("grounds the expectation in the archetype, the content, and the behavior", () => {
    const why = explainExpectation(classificationWith(), capabilityWith());

    expect(why.headline).toMatch(/every travel \/ hospitality site .* act stage/i);
    expect(why.grounding).toContain("/Travel/Hotels & Accommodations, 97%");
    expect(why.grounding).toContain("a booking flow");
    expect(why.grounding).toContain("LodgingBusiness structured data");
    // Boilerplate types say a website exists, not what it means.
    expect(why.grounding).not.toContain("ImageObject");
    expect(why.caveat).toBeNull();
  });

  it("says so when the archetype was chosen by hand, and stops arguing from evidence", () => {
    const why = explainExpectation(
      classificationWith({ primaryArchetype: "saas", override: "saas", provisional: false }),
      capabilityWith({ expectationSource: ["override:saas"] }),
    );

    expect(why.headline).toMatch(/set to saas by hand/);
    expect(why.grounding).toBeNull();
  });

  it("carries the provisional warning as a caveat", () => {
    const why = explainExpectation(
      classificationWith({ provisional: true, provisionalReason: "The leading archetypes are too close." }),
      capabilityWith(),
    );

    expect(why.caveat).toBe("The leading archetypes are too close.");
  });

  it("still explains a behavior-only classification", () => {
    const grounding = explainClassification(classificationWith({ categories: [] }));

    expect(grounding).toMatch(/from its behavior/);
    expect(grounding).not.toMatch(/its content/);
  });

  it("returns nothing rather than an empty claim", () => {
    expect(explainClassification(undefined)).toBeNull();
    expect(explainClassification(classificationWith({ categories: [], signals: [] }))).toBeNull();
  });

  it("renders unknown signals verbatim instead of guessing", () => {
    expect(describeSignal("path:booking")).toBe("a booking flow");
    expect(describeSignal("schema:Hotel")).toBe("Hotel structured data");
    expect(describeSignal("something:new")).toBe("something:new");
  });
});

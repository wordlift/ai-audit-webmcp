// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActionJourney } from "../../src/client/components/ActionJourney";
import type { CapabilityResult, ClassificationResult } from "../../src/shared/types/index.js";

const capability: CapabilityResult = {
  actionId: "availability.check",
  label: "Check availability",
  description: "Check time-sensitive availability.",
  stage: "act",
  intent: "informational",
  importance: 3,
  expected: true,
  expectationSource: ["archetype:travel-hospitality"],
  state: "unverified",
  humanSupport: true,
  agentSupport: false,
  evidence: [{
    id: "availability-form",
    actionId: "availability.check",
    audience: "human",
    kind: "form",
    sourceUrl: "https://alpina.travel/",
    claim: "People can check dates",
    confidence: 1,
    verification: "observed",
    collectedAt: "2026-08-27T05:00:00.000Z",
  }],
  recommendation: "Expose a controlled availability function.",
};

const classification: ClassificationResult = {
  primaryArchetype: "travel-hospitality",
  categories: [{ name: "/Travel/Hotels & Accommodations", confidence: 0.97 }],
  rankedArchetypes: [{ archetype: "travel-hospitality", score: 6.2 }],
  confidence: "high",
  margin: 5.1,
  provisional: false,
  model: "google-natural-language-v2",
  collectedAt: "2026-08-27T05:00:00.000Z",
  signals: ["path:booking", "schema:LodgingBusiness"],
};

describe("ActionJourney", () => {
  it("renders four readable stages and returns focus after inspecting evidence", async () => {
    render(
      <ActionJourney
        reportId="4a8a04c0-e247-4bec-a440-d9f3506f9212"
        capabilities={[capability]}
        classification={classification}
      />,
    );
    expect(screen.getByRole("heading", { name: "Discover" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Understand & decide" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Act" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Manage" })).toBeVisible();
    const node = screen.getByRole("button", { name: /check availability/i });
    node.focus();
    fireEvent.click(node);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("People can check dates")).toBeVisible();
    // The meaning layer: why this action belongs on this site's map, from the report alone.
    expect(screen.getByText(/every travel \/ hospitality site is expected to support this at the act stage/i)).toBeVisible();
    expect(screen.getByText(/a booking flow, LodgingBusiness structured data/)).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(node).toHaveFocus());
  });
});

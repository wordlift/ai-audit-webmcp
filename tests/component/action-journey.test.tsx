// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ActionJourney } from "../../src/client/components/ActionJourney";
import type { CapabilityResult } from "../../src/shared/types/index.js";

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
  appliesTo: [{
    id: "https://alpina.travel/#stay",
    name: "AlpiNest",
    types: ["LodgingBusiness"],
  }],
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

describe("ActionJourney", () => {
  it("renders four readable stages and returns focus after inspecting evidence", async () => {
    render(<ActionJourney reportId="4a8a04c0-e247-4bec-a440-d9f3506f9212" capabilities={[capability]} />);
    expect(screen.getByRole("heading", { name: "Discover" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Understand & decide" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Act" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Manage" })).toBeVisible();
    const node = screen.getByRole("button", { name: /check availability/i });
    node.focus();
    fireEvent.click(node);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("People can check dates")).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(node).toHaveFocus());
  });

  it("shows the entity directly on its action and emphasizes a selected binding", () => {
    render(
      <ActionJourney
        reportId="4a8a04c0-e247-4bec-a440-d9f3506f9212"
        capabilities={[capability]}
        selectedEntityId="https://alpina.travel/#stay"
      />,
    );

    const node = screen.getByRole("button", { name: /check availability for alpinest/i });
    expect(node).toHaveTextContent("LodgingBusiness · AlpiNest");
    expect(node).not.toHaveClass("action-node-dimmed");
  });
});

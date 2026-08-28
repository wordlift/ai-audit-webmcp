// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { ServiceMap } from "../../src/client/components/ServiceMap";
import type { CapabilityResult, ReportRecord, SiteEntity } from "../../src/shared/types/index.js";

function capabilityWith(overrides: Partial<CapabilityResult>): CapabilityResult {
  return {
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
    evidence: [],
    ...overrides,
  };
}

const entity: SiteEntity = {
  id: "https://alpina.travel/#samspitze-4",
  type: "Apartment",
  name: "Samspitze 4",
  offer: { price: "644.80", priceCurrency: "EUR" },
  sourceUrl: "https://alpina.travel/",
  method: "json-ld",
  collectedAt: "2026-08-27T05:00:00.000Z",
};

function reportWith(overrides: Partial<ReportRecord>): ReportRecord {
  return {
    id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
    status: "completed",
    phase: "complete",
    mode: "demo",
    requestedUrl: "https://alpina.travel/",
    createdAt: "2026-08-27T05:00:00.000Z",
    expiresAt: "2026-09-27T05:00:00.000Z",
    actionModelVersion: "0.1.0",
    errors: [],
    evidenceTruncated: false,
    classification: {
      primaryArchetype: "travel-hospitality",
      categories: [{ name: "/Travel/Hotels & Accommodations", confidence: 0.97 }],
      rankedArchetypes: [{ archetype: "travel-hospitality", score: 6.2 }],
      confidence: "high",
      margin: 5.1,
      provisional: false,
      model: "google-natural-language-v2",
      collectedAt: "2026-08-27T05:00:00.000Z",
      signals: ["path:booking", "schema:LodgingBusiness"],
    },
    capabilities: [
      capabilityWith({}),
      capabilityWith({ actionId: "site.browse", label: "Browse the site", stage: "discover", state: "human-only" }),
    ],
    entities: [entity],
    ...overrides,
  };
}

const noOverride = async () => undefined;

describe("ServiceMap", () => {
  it("traces a selected entity to the actions it justifies", () => {
    render(<ServiceMap report={reportWith({})} onOverride={noOverride} />);

    fireEvent.click(screen.getByRole("button", { name: /samspitze 4/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/Showing the 1 action/);
    expect(screen.getByRole("status")).toHaveTextContent(/Samspitze 4/);
    expect(screen.getByRole("button", { name: /check availability/i }).className).toContain("linked");
    expect(screen.getByRole("button", { name: /browse the site/i }).className).toContain("dimmed");

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: /check availability/i }).className).not.toContain("linked");
  });

  it("selecting the same entity again clears the trace", () => {
    render(<ServiceMap report={reportWith({})} onOverride={noOverride} />);

    const card = screen.getByRole("button", { name: /samspitze 4/i });
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(card);
    expect(card).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("tells the truth when a site published no entities", () => {
    render(<ServiceMap report={reportWith({ entities: undefined })} onOverride={noOverride} />);

    expect(screen.getByText(/No named entities in the audited page's structured data/)).toBeVisible();
    // The actions layer still renders in full.
    expect(screen.getByRole("heading", { name: "What an agent should be able to do" })).toBeVisible();
  });
});

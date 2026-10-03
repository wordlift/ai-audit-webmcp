// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BoundariesTable, boundaryRows } from "../../src/client/components/BoundariesTable";
import type { CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

function capability(overrides: Partial<CapabilityResult> & Pick<CapabilityResult, "actionId" | "label" | "state">): CapabilityResult {
  return {
    description: `${overrides.label}.`,
    stage: "act",
    intent: "transactional",
    importance: 3,
    expected: true,
    expectationSource: ["archetype"],
    humanSupport: true,
    agentSupport: overrides.state === "agent-ready",
    appliesTo: [],
    evidence: [],
    ...overrides,
  };
}

const report: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "completed",
  phase: "complete",
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  createdAt: "2026-09-07T05:00:00.000Z",
  expiresAt: "2026-10-07T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  capabilities: [
    capability({ actionId: "site.search", label: "Search the site", state: "agent-ready", importance: 2 }),
    capability({
      actionId: "availability.check",
      label: "Check availability",
      state: "unverified",
      boundary: "partner-handoff",
      boundarySource: "human-provided",
      boundaryPartner: { name: "Lungau Lodging", url: "https://lungau-lodging.example/" },
      boundaryRationale: "Partners own the inventory.",
    }),
    capability({ actionId: "checkout.pay", label: "Pay", state: "not-expected", expected: false }),
    capability({ actionId: "items.compare", label: "Compare options", state: "missing", boundary: "not-applicable", boundarySource: "human-provided", expected: true, importance: 1 }),
  ],
};

describe("business boundaries", () => {
  it("lists every action that matters, decided ones first, with owner, partner, rationale and provenance", () => {
    expect(boundaryRows(report).map((row) => row.actionId)).toEqual(["availability.check", "items.compare", "site.search"]);
    render(
      <MemoryRouter>
        <BoundariesTable report={report} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /business boundaries/i })).toBeVisible();
    expect(screen.getByText(/2 of 3 actions decided by a person/i)).toBeVisible();
    const row = screen.getByRole("row", { name: /check availability/i });
    expect(row).toHaveTextContent("Partner handoff");
    expect(row).toHaveTextContent("A partner runs it");
    expect(within(row).getByRole("link", { name: "Lungau Lodging" })).toHaveAttribute("href", "https://lungau-lodging.example/");
    expect(row).toHaveTextContent("Partners own the inventory.");
    expect(row).toHaveTextContent("Human-provided");
    expect(screen.getByRole("row", { name: /search the site/i })).toHaveTextContent("Undecided");
    // An action the site type does not expect and nobody decided about is not a boundary to state.
    expect(screen.queryByRole("row", { name: /^pay/i })).toBeNull();
  });

  it("says so when nothing has been decided, and where to decide", () => {
    render(
      <MemoryRouter>
        <BoundariesTable report={{ ...report, capabilities: report.capabilities!.map((c) => ({ ...c, boundary: undefined, boundarySource: undefined, boundaryPartner: undefined, boundaryRationale: undefined })) }} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no boundary has been decided yet/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /answer the three questions/i })).toHaveAttribute("href", "/reports/4a8a04c0-e247-4bec-a440-d9f3506f9212#own-it");
  });
});

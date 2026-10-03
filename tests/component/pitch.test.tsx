// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PitchCompare, gapsFor } from "../../src/client/routes/PitchRoute";
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

function report(id: string, url: string, score: number, states: Record<string, CapabilityResult["state"]>): ReportRecord {
  return {
    id,
    status: "completed",
    phase: "complete",
    mode: "demo",
    requestedUrl: url,
    createdAt: "2026-09-07T05:00:00.000Z",
    collectedAt: "2026-09-07T05:00:00.000Z",
    expiresAt: "2026-10-07T05:00:00.000Z",
    actionModelVersion: "0.1.0",
    errors: [],
    evidenceTruncated: false,
    classification: { primaryArchetype: "commerce-retail", categories: [], rankedArchetypes: [], confidence: "high", margin: 3, provisional: false, model: "fixture", collectedAt: "2026-09-07T05:00:00.000Z" },
    score: { value: score, verifiedWeight: 0, expectedWeight: 9, counts: { expected: 3, ready: 0, unverified: 0, humanOnly: 0, missing: 0 } },
    capabilities: [
      capability({ actionId: "product.search", label: "Search the catalogue", state: states.search ?? "missing" }),
      capability({ actionId: "product.details", label: "Retrieve details", state: states.details ?? "missing" }),
      capability({ actionId: "checkout.pay", label: "Pay", state: states.pay ?? "missing" }),
    ],
  };
}

const prospect = report("4a8a04c0-e247-4bec-a440-d9f3506f9212", "https://shop.example/", 33, { search: "agent-ready", details: "unverified", pay: "missing" });
const rival = report("5b8a04c0-e247-4bec-a440-d9f3506f9213", "https://publisher.example/", 66, { search: "agent-ready", details: "agent-ready", pay: "human-only" });

describe("the pitch", () => {
  it("puts the prospect against its competitors on the same three actions", () => {
    render(
      <MemoryRouter>
        <PitchCompare reports={[prospect, rival]} now={() => new Date("2026-09-07T08:00:00.000Z").getTime()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /shop\.example against publisher\.example/i })).toBeVisible();
    const cards = within(screen.getByRole("list", { name: /agent readiness by site/i })).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("Prospect");
    expect(cards[0]).toHaveTextContent("33");
    expect(cards[1]).toHaveTextContent("Competitor 1");
    expect(cards[1]).toHaveTextContent("66");

    const table = screen.getByRole("table");
    const details = within(table).getByRole("row", { name: /retrieve details/i });
    expect(details).toHaveTextContent(/Fix this/);
    expect(details).toHaveTextContent(/Works/);
    const pay = within(table).getByRole("row", { name: /^pay/i });
    expect(pay).toHaveTextContent(/Talk to us/);
  });

  it("lists the prospect's gaps as the things to fix, widest first, with the report id on the way to the dashboard", () => {
    render(
      <MemoryRouter>
        <PitchCompare reports={[prospect]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /fix these 2 issues/i })).toBeVisible();
    const gaps = screen.getAllByRole("listitem").filter((item) => item.closest(".pitch-gaps"));
    expect(gaps.map((item) => item.textContent)).toEqual([expect.stringContaining("Pay"), expect.stringContaining("Retrieve details")]);
    expect(screen.getByRole("link", { name: /publish with wordlift/i })).toHaveAttribute("href", expect.stringContaining(prospect.id));
  });

  it("knows when there is nothing to fix", () => {
    expect(gapsFor(report("6c8a04c0-e247-4bec-a440-d9f3506f9214", "https://saas.example/", 100, { search: "agent-ready", details: "agent-ready", pay: "agent-ready" }))).toEqual([]);
  });
});

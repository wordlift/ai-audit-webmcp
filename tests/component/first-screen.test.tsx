// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FirstScreen, actionsThatMatter, openingSentence, readAgo } from "../../src/client/components/FirstScreen";
import type { CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

function capability(overrides: Partial<CapabilityResult> & Pick<CapabilityResult, "actionId" | "label" | "state">): CapabilityResult {
  return {
    description: `${overrides.label} on this site.`,
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
  mode: "live",
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://www.alpina.travel/",
  createdAt: "2026-09-07T05:00:00.000Z",
  collectedAt: "2026-09-07T05:00:00.000Z",
  expiresAt: "2026-10-07T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  classification: {
    primaryArchetype: "travel-hospitality",
    categories: [],
    rankedArchetypes: [],
    confidence: "high",
    margin: 3,
    provisional: false,
    model: "fixture",
    collectedAt: "2026-09-07T05:00:00.000Z",
  },
  score: { value: 62, verifiedWeight: 3, expectedWeight: 9, counts: { expected: 3, ready: 1, unverified: 1, humanOnly: 0, missing: 1 } },
  agentDiscovery: { catalog: "missing", memory: "missing" },
  capabilities: [
    capability({ actionId: "availability.check", label: "Check availability", state: "agent-ready", via: "sidecar" }),
    capability({ actionId: "booking.reserve", label: "Book a stay", state: "unverified" }),
    capability({ actionId: "property.search", label: "Find a property", state: "missing", importance: 2 }),
    capability({ actionId: "newsletter.subscribe", label: "Subscribe", state: "human-only", importance: 1 }),
    capability({ actionId: "checkout.pay", label: "Pay", state: "not-expected", expected: false }),
  ],
};

const NOW = new Date("2026-09-07T08:00:00.000Z").getTime();

function renderScreen(record: ReportRecord = report) {
  return render(
    <MemoryRouter>
      <FirstScreen report={record} now={() => NOW} />
    </MemoryRouter>,
  );
}

describe("the first screen", () => {
  it("opens with one sentence a person can act on", () => {
    renderScreen();
    expect(screen.getByText(/Agents can discover 4 capabilities on this site\. 1 works\. 3 do not yet\./)).toBeVisible();
    expect(screen.getByRole("heading", { name: "alpina.travel" })).toBeVisible();
    expect(screen.getByText("62")).toBeVisible();
  });

  it("speaks three plain words, each for exactly one precise state", () => {
    renderScreen();
    const list = screen.getByRole("list", { name: /the actions that matter/i });
    expect(list).toHaveTextContent("Check availability");
    expect(list).toHaveTextContent("Works");
    expect(list).toHaveTextContent("Run by WordLift");
    expect(list).toHaveTextContent("Book a stay");
    expect(list).toHaveTextContent("Fix this");
    expect(list).toHaveTextContent("Find a property");
    expect(list).toHaveTextContent("Talk to us");
    // The precise vocabulary stays one click below.
    expect(list).not.toHaveTextContent(/agent-ready|unverified|human-only/);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("says when the site was read, and offers to read it again", () => {
    renderScreen();
    expect(screen.getByText(/Read 3 hours ago/)).toBeVisible();
    expect(screen.getByRole("button", { name: /run again/i })).toBeVisible();
  });

  it("tells the owner when agents cannot discover the site", () => {
    renderScreen();
    expect(screen.getByText(/Agents cannot discover this site yet/)).toBeVisible();
  });

  it("points at the deeper read from the top, and not on a deep scan", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: /Read up to 12 pages/ })).toHaveAttribute("href", "#deep-scan");
    renderScreen({ ...report, id: "5b8a04c0-e247-4bec-a440-d9f3506f9213", scanDepth: "deep" });
    expect(screen.getAllByRole("link", { name: /Read up to 12 pages/ })).toHaveLength(1);
  });
});

describe("which actions matter", () => {
  it("ranks the most important first, then the widest gap, and never an action the site type does not expect", () => {
    const three = actionsThatMatter(report.capabilities ?? []);
    expect(three.map((item) => item.actionId)).toEqual(["booking.reserve", "availability.check", "property.search"]);
  });

  it("writes an honest sentence when nothing is expected", () => {
    expect(openingSentence([])).toMatch(/No agent capabilities are expected/);
    expect(openingSentence([capability({ actionId: "a", label: "A", state: "agent-ready" })])).toBe(
      "Agents can discover 1 capability on this site. 1 works. 0 do not yet.",
    );
  });

  it("rounds the reading time the way a person would", () => {
    const at = "2026-09-07T05:00:00.000Z";
    const t = (iso: string) => new Date(iso).getTime();
    expect(readAgo(undefined, NOW)).toBeNull();
    expect(readAgo(at, t("2026-09-07T05:00:30.000Z"))).toBe("Read just now");
    expect(readAgo(at, t("2026-09-07T05:40:00.000Z"))).toBe("Read 40 minutes ago");
    expect(readAgo(at, t("2026-09-07T08:00:00.000Z"))).toBe("Read 3 hours ago");
    expect(readAgo(at, t("2026-09-09T06:00:00.000Z"))).toBe("Read 2 days ago");
  });
});

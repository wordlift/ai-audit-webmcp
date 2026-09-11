// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FirstScreen, actionsThatMatter, foundLine, gapLine, headline, readAgo, readersLine, relationChain, runsOnLine } from "../../src/client/components/FirstScreen";
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

const onWordLift: ReportRecord = {
  ...report,
  publishedWith: { name: "WordLift", evidence: "Entity ids on data.wordlift.io", sourceUrl: "https://www.alpina.travel/" },
};

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
    expect(screen.getByRole("heading", { level: 1, name: "AI agents can do 1 of the 3 things that matter on alpina.travel." })).toBeVisible();
    expect(screen.getByText("Fix the other 2.")).toBeVisible();
    expect(screen.getByText(/Agent readiness/)).toHaveTextContent("Agent readiness 62/100");
    // The other expected action is one click below, and the link says how many there are in all.
    expect(screen.getByRole("link", { name: /All 4 actions a travel \/ hospitality site should offer are in the full audit/ })).toHaveAttribute("href", "#full-audit");
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
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });

  it("says when the site was read, and offers to read it again", () => {
    renderScreen();
    expect(screen.getByText(/Read 3 hours ago/)).toBeVisible();
    expect(screen.getByRole("button", { name: /run again/i })).toBeVisible();
  });

  it("tells the owner when agents cannot discover the site", () => {
    renderScreen();
    expect(screen.getByText(/Agents have no way to find this site's capabilities yet: it publishes no catalog\./)).toBeVisible();
  });

  it("offers the deeper read on the first screen, opening in place, and not on a deep scan", () => {
    renderScreen();
    const strip = screen.getByRole("button", { name: /Read up to 12 pages instead of 4/ });
    expect(strip).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText(/email address/i)).toBeNull();
    fireEvent.click(strip);
    expect(screen.getByLabelText(/email address/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /send me the deep scan/i })).toBeDisabled();
    renderScreen({ ...report, id: "5b8a04c0-e247-4bec-a440-d9f3506f9213", scanDepth: "deep" });
    expect(screen.getAllByRole("button", { name: /Read up to 12 pages/ })).toHaveLength(1);
  });

  it("says what the agent did in a person's words, never in ours", () => {
    renderScreen();
    const list = screen.getByRole("list", { name: /the actions that matter/i });
    expect(list).toHaveTextContent("Your site says agents can do this, but our agent could not complete it.");
    expect(list).toHaveTextContent("Our agent successfully used this. Run by WordLift.");
    expect(list).toHaveTextContent("There is no agent-accessible interface yet.");
    expect(list).not.toHaveTextContent(/invocation|unverified|agent-ready|declared/i);
  });
});

describe("which actions matter", () => {
  it("ranks the most important first, then the widest gap, and never an action the site type does not expect", () => {
    const three = actionsThatMatter(report.capabilities ?? []);
    expect(three.map((item) => item.actionId)).toEqual(["booking.reserve", "availability.check", "property.search"]);
  });

  it("writes the headline and the gap, and stays honest when nothing is expected", () => {
    expect(headline([], "alpina.travel")).toMatch(/No agent capabilities are expected/);
    expect(gapLine([])).toBeNull();
    expect(headline([capability({ actionId: "a", label: "A", state: "agent-ready" })], "shop.example")).toBe("AI agents can do 1 of the 1 thing that matter on shop.example.");
    expect(gapLine([capability({ actionId: "a", label: "A", state: "agent-ready" })])).toBe("Everything that matters works.");
    expect(gapLine([capability({ actionId: "a", label: "A", state: "missing" })])).toBe("Fix it.");
    expect(headline(report.capabilities ?? [], "alpina.travel")).toBe("AI agents can do 1 of the 3 things that matter on alpina.travel.");
    expect(gapLine(report.capabilities ?? [])).toBe("Fix the other 2.");
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

describe("the readers line", () => {
  it("sums crawlers and agents across days and leaves claims and people out", () => {
    expect(readersLine(null)).toBeNull();
    expect(readersLine({ reportId: "x", since: "2026-09-01", days: [], activations: [] })).toBeNull();
    expect(
      readersLine({
        reportId: "x",
        since: "2026-09-01",
        days: [
          { day: "2026-09-05", counts: { "crawler:googlebot": 2, "crawler:claimed-googlebot": 5, human: 9 } },
          { day: "2026-09-06", counts: { "crawler:gptbot": 1, "agent:anthropic": 1 } },
        ],
        activations: [],
      }),
    ).toBe("3 crawlers and 1 agent have read this since it was published.");
  });

  it("names the platform the site's own data declares, beside the archetype, and says what it already delivers next to the score", () => {
    renderScreen(onWordLift);
    const chip = screen.getByRole("link", { name: "Runs on WordLift" });
    expect(chip).toHaveAttribute("href", expect.stringContaining("my.wordlift.io"));
    expect(chip).toHaveAttribute("href", expect.stringContaining(report.id));
    expect(chip).toHaveAttribute("title", expect.stringContaining("Entity ids on data.wordlift.io"));
    // What WordLift already delivers, and what the score measures instead, on the chip's hover: the head stays three lines.
    expect(chip).toHaveAttribute("title", expect.stringContaining("WordLift already makes this business readable to agents"));
    expect(chip).toHaveAttribute("title", expect.stringContaining("The score measures whether agents can act, which is the next step"));
  });

  it("says nothing about a platform when the site's data names none", () => {
    renderScreen();
    expect(screen.queryByText(/Runs on/)).toBeNull();
    expect(document.querySelector(".chip-runs-on")).toBeNull();
  });

  it("counts what the platform published against what only the text holds", () => {
    const entity = (name: string, origin?: "inferred") => ({ id: `https://www.alpina.travel/#${name}`, types: ["Place"], name, alternateNames: [], sourceUrls: [], sameAs: [], offers: [], confidence: 0.9, ...(origin ? { origin } : {}) });
    const withGraph = { ...onWordLift, contextGraph: { entities: [entity("AlpiNest"), entity("Samspitze 4"), entity("Lungau", "inferred")] } } as unknown as ReportRecord;
    expect(runsOnLine(withGraph)).toBe("WordLift already makes this business readable to agents: 2 of the 3 things that matter here are machine-readable. The score measures whether agents can act, which is the next step.");
    expect(runsOnLine(onWordLift)).toBe("WordLift already makes this business readable to agents. The score measures whether agents can act, which is the next step.");
  });

  it("counts what it found in the site's own nouns, before the score, and points at the understanding", () => {
    const entity = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({ id, types: [type], name, alternateNames: [], sourceUrls: ["https://www.alpina.travel/"], sameAs: [], offers: [], confidence: 0.9, ...extra });
    const withGraph = {
      ...report,
      contextGraph: {
        pages: [{ url: "https://www.alpina.travel/", title: "Alpina", role: "entry", headings: [], entityIds: [] }, { url: "https://www.alpina.travel/lungau/", title: "Lungau", role: "detail", headings: [], entityIds: [] }],
        entities: [
          entity("org", "AlpiNest Feriendorf Lungau", "LodgingBusiness"),
          entity("a1", "Samspitze 4", "Apartment", { origin: "inferred" }),
          entity("a2", "Samspitze 5", "Apartment"),
          entity("p1", "Lungau", "Place", { origin: "inferred" }),
          entity("p2", "Mariapfarr", "Place", { origin: "inferred" }),
          entity("who", "Andrea Volpini", "Person"),
          entity("site", "Alpina.travel", "WebSite"),
          entity("old", "Old brochure", "Product", { humanPriority: "demoted" }),
        ],
        lexicalEntries: [],
        interfaces: [],
        bindings: [],
      },
    } as unknown as ReportRecord;
    expect(foundLine(withGraph)).toEqual({ pages: 2, parts: ["1 business", "2 apartments", "2 places", "1 person", "4 things agents should be able to do here"] });
    renderScreen(withGraph);
    expect(screen.getByText(/From 2 pages, WordLift found/)).toHaveTextContent("1 business · 2 apartments · 2 places · 1 person · 4 things agents should be able to do here");
    expect(screen.getByRole("link", { name: "See what we understood" })).toHaveAttribute("href", "#understand");
    // Without a graph there is nothing to count, and nothing is said.
    expect(foundLine(report)).toBeNull();
  });

  it("says the shape of the business in one line from what its markup declares, and nothing when it declares no relation", () => {
    const entity = (id: string, name: string, type: string, extra: Record<string, unknown> = {}) => ({ id, types: [type], name, alternateNames: [], sourceUrls: ["https://www.alpina.travel/"], sameAs: [], offers: [], confidence: 0.9, ...extra });
    const graph = {
      pages: [{ url: "https://www.alpina.travel/", title: "Alpina", role: "entry", headings: [], entityIds: [] }],
      entities: [entity("org", "AlpiNest Feriendorf Lungau", "LodgingBusiness"), entity("apt", "Samspitze 4", "Apartment"), entity("town", "Mariapfarr", "Place"), entity("lungau", "Lungau", "Place", { origin: "inferred" })],
      lexicalEntries: [],
      interfaces: [],
      bindings: [],
    };
    const declared = { ...report, contextGraph: { ...graph, relations: [
      { from: "org", to: "apt", kind: "offers", provenance: "declared", sourceUrl: "https://www.alpina.travel/" },
      { from: "apt", to: "town", kind: "located-in", provenance: "declared", sourceUrl: "https://www.alpina.travel/" },
    ] } } as unknown as ReportRecord;
    expect(relationChain(declared)).toEqual(["AlpiNest Feriendorf Lungau", "offers Samspitze 4", "in Mariapfarr"]);
    renderScreen(declared);
    expect(screen.getByLabelText(/How the business fits together/)).toHaveTextContent("AlpiNest Feriendorf Lungau → offers Samspitze 4 → in Mariapfarr");
    // Only the business's own place when the offering has none.
    const orgPlace = { ...declared, contextGraph: { ...graph, relations: [{ from: "org", to: "town", kind: "located-in", provenance: "declared", sourceUrl: "https://www.alpina.travel/" }] } } as unknown as ReportRecord;
    expect(relationChain(orgPlace)).toEqual(["AlpiNest Feriendorf Lungau", "in Mariapfarr"]);
    expect(relationChain({ ...report, contextGraph: graph } as unknown as ReportRecord)).toBeNull();
  });
});

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  ActivateScreen,
  activationSummary,
  agentsByPlatform,
  carries,
  claimedGoogle,
  crawlersByName,
  googleReads,
  scoreMovement,
} from "../../src/client/routes/ActivateRoute";
import type { ReportVisits } from "../../src/client/api/client";
import type { Publication } from "../../src/shared/types/activate.js";
import type { ReportRecord } from "../../src/shared/types/index.js";

const REPORT_ID = "4a8a04c0-e247-4bec-a440-d9f3506f9212";

const report: ReportRecord = {
  id: REPORT_ID,
  status: "completed",
  phase: "complete",
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  createdAt: "2026-09-07T05:00:00.000Z",
  expiresAt: "2026-10-07T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  score: { value: 74, verifiedWeight: 6, expectedWeight: 9, counts: { expected: 3, ready: 2, unverified: 0, humanOnly: 0, missing: 1 } },
  capabilities: [],
};

const publication: Publication = {
  site: "https://alpina.travel",
  host: "alpina.travel",
  reportId: REPORT_ID,
  reportUrl: `https://audit.example/reports/${REPORT_ID}`,
  publishedAt: "2026-09-07T09:00:00.000Z",
  decided: 3,
  actions: [
    { actionId: "detail.retrieve", label: "Retrieve details", state: "unverified", boundary: "informational-only", publishedAs: "entity", because: "You said you only describe it. The entity is published, no action." },
    { actionId: "site.search", label: "Search the site", state: "agent-ready", boundary: "owned", publishedAs: "action", because: "You own it and an entry point answered.", entryPoint: { url: "https://alpina.travel/mcp", protocol: "mcp", httpMethod: "POST", via: "site" } },
    { actionId: "availability.check", label: "Check availability", state: "agent-ready", boundary: "partner-handoff", publishedAs: "handoff", because: "You said a partner runs it.", provider: { name: "Lungau Lodging" } },
    { actionId: "items.compare", label: "Compare options", state: "missing", boundary: "not-applicable", publishedAs: "nothing", because: "You said this is not yours." },
  ],
  documents: {
    pageJsonLd: `https://audit.example/api/reports/${REPORT_ID}/publish/page.jsonld`,
    skill: `https://audit.example/api/reports/${REPORT_ID}/publish/skill.md`,
    catalog: `https://audit.example/api/reports/${REPORT_ID}/publish/ai-catalog.json`,
  },
  catalogPath: "/.well-known/ai-catalog.json",
  jsonLd: { "@context": "https://schema.org", "@graph": [] },
  skill: "---\nname: alpina.travel Terms of Action\n---\n",
  catalog: { entries: [] },
};

const ledger: ReportVisits = {
  reportId: REPORT_ID,
  since: "2026-09-01T05:00:00.000Z",
  days: [
    { day: "2026-09-05", counts: { "crawler:googlebot": 2, "crawler:gptbot": 2, "crawler:claimed-googlebot": 1, "agent:anthropic": 3, human: 9 } },
    { day: "2026-09-06", counts: { "crawler:googlebot": 1, "agent:anthropic": 1, "agent:openai": 2, human: 4 } },
  ],
  activations: [
    { day: "2026-09-05", tool: "check-availability", surface: "webmcp", outcome: "ok", count: 4 },
    { day: "2026-09-06", tool: "check-availability", surface: "web", outcome: "ok", count: 1 },
    { day: "2026-09-06", tool: "check-availability", surface: "web", outcome: "failed:upstream_timeout", count: 1 },
  ],
  history: [
    { reportId: REPORT_ID, createdAt: "2026-09-07T05:00:00.000Z", score: 74, kind: "audit" },
    { reportId: "5b8a04c0-e247-4bec-a440-d9f3506f9213", createdAt: "2026-09-01T05:00:00.000Z", score: 62, kind: "audit" },
  ],
};

function renderScreen(visits: ReportVisits | null) {
  return render(
    <MemoryRouter>
      <ActivateScreen report={report} publication={publication} visits={visits} />
    </MemoryRouter>,
  );
}

describe("the numbers equal the ledger", () => {
  it("names crawlers, verifies Google, groups agents by platform, and keeps a claimed Googlebot out", () => {
    expect(crawlersByName(ledger)).toEqual([
      { name: "Googlebot", count: 3 },
      { name: "GPTBot", count: 2 },
    ]);
    expect(googleReads(ledger)).toBe(3);
    expect(claimedGoogle(ledger)).toBe(1);
    expect(agentsByPlatform(ledger)).toEqual([
      { name: "Claude (Anthropic)", count: 4 },
      { name: "ChatGPT (OpenAI)", count: 2 },
    ]);
  });

  it("sums activations by tool, with each failure and its reason", () => {
    expect(activationSummary(ledger)).toEqual([
      {
        tool: "check-availability",
        ok: 5,
        failed: 1,
        failures: [{ name: "upstream timeout", count: 1 }],
        surfaces: [
          { name: "webmcp", count: 4 },
          { name: "web", count: 2 },
        ],
      },
    ]);
  });

  it("reads the movement from the oldest reading to the newest, and none from one reading", () => {
    expect(scoreMovement(ledger.history)).toEqual({ from: 62, to: 74, since: "2026-09-01T05:00:00.000Z" });
    expect(scoreMovement(ledger.history!.slice(0, 1))).toBeNull();
    expect(scoreMovement(undefined)).toBeNull();
  });

  it("says in plain words what the page carries", () => {
    expect(publication.actions.map(carries)).toEqual([
      "The entity, no action",
      "The action, with its entry point",
      "The action, with Lungau Lodging as provider",
      "Nothing",
    ]);
  });
});

describe("the Activate screen", () => {
  it("shows the movement, the table, the three documents, and who read it", () => {
    renderScreen(ledger);
    expect(screen.getByRole("heading", { level: 1, name: "Make alpina.travel usable by AI agents" })).toBeVisible();
    expect(screen.getByRole("heading", { name: /wordlift publishes and keeps synchronized/i })).toBeVisible();
    expect(screen.getByText(/of 100 agent-ready since 1 September/)).toHaveTextContent("62 → 74");

    const table = screen.getByRole("table");
    const search = within(table).getByRole("row", { name: /search the site/i });
    expect(search).toHaveTextContent("Ours");
    expect(search).toHaveTextContent("The action, with its entry point");
    // What publishes an entity only, and what publishes nothing, is said once each rather than once per action.
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Search the site");
    expect(rows[1]).toContain("Check availability");
    expect(rows[2]).toContain("Retrieve details");
    expect(rows[2]).toContain("The entity, no action");
    expect(rows[3]).toContain("Compare options");
    expect(rows[3]).toContain("Not relevant");
    expect(rows[3]).toContain("Nothing");

    for (const title of ["On your pages", "For agents", "For registries"]) expect(screen.getByRole("article", { name: title })).toBeVisible();
    // Each document opens in place, formatted, and the raw file stays one click away.
    expect(screen.getAllByRole("button", { name: /read the whole file/i })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /^raw/i })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: /^activate/i })[0]).toHaveAttribute("href", expect.stringContaining(`report=${REPORT_ID}`));
    expect(screen.getAllByRole("link", { name: /^activate/i })[0]).toHaveAttribute("href", expect.stringContaining("intent=activate"));

    const crawlers = screen.getByRole("article", { name: /crawlers/i });
    expect(crawlers).toHaveTextContent("Googlebot3");
    expect(crawlers).toHaveTextContent("GPTBot2");
    expect(crawlers).not.toHaveTextContent(/claimed/i);
    expect(screen.getByRole("article", { name: /google/i })).toHaveTextContent("3 verified Googlebot reads");
    expect(screen.getByRole("article", { name: /google/i })).toHaveTextContent("1 request claimed to be Google and was not.");
    expect(screen.getByRole("article", { name: "Agents" })).toHaveTextContent("Claude (Anthropic)4");
    const activations = screen.getByRole("article", { name: /activations/i });
    expect(activations).toHaveTextContent("5 succeeded, 1 failed");
    expect(activations).toHaveTextContent("1 failure: upstream timeout");
    expect(activations).toHaveTextContent("webmcp 4 · web 2");
  });

  it("says what to expect when nothing has read it yet, never a row of zeros", () => {
    renderScreen({ reportId: REPORT_ID, since: "2026-09-07T05:00:00.000Z", days: [], activations: [], history: ledger.history!.slice(0, 1) });
    expect(screen.getByText(/The next reading shows how it moved/)).toHaveTextContent("74 of 100 agent-ready.");
    expect(screen.getByText("No crawler yet. Expect the first within days of publishing.")).toBeVisible();
    expect(screen.getByText(/Google has not read it yet/)).toBeVisible();
    expect(screen.getByText(/No agent yet\. Agents arrive once a directory lists the site/)).toBeVisible();
    expect(screen.getByText(/No agent has activated a capability yet/)).toBeVisible();
    for (const card of screen.getAllByRole("article")) expect(card).not.toHaveTextContent(/\b0\b/);
  });

  it("explains that there is nothing to activate when no interface answered", () => {
    render(
      <MemoryRouter>
        <ActivateScreen
          report={report}
          publication={{ ...publication, decided: 0, actions: publication.actions.filter((action) => action.publishedAs !== "action") }}
          visits={null}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Nothing to activate yet: no interface has answered\./)).toBeVisible();
    expect(screen.getByText(/The three questions are unanswered/)).toBeVisible();
    expect(screen.getByRole("link", { name: "the three questions" })).toHaveAttribute("href", `/reports/${REPORT_ID}#own-it`);
    expect(screen.getByRole("heading", { name: /is alpina\.travel still agent-ready/i })).toBeVisible();
  });
});

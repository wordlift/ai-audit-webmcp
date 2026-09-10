// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentDiary, agentDiary } from "../../src/client/components/AgentDiary";
import type { CapabilityEvidence, CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

const AT = "2026-09-07T05:00:00.000Z";

function evidence(id: string, claim: string, verification: CapabilityEvidence["verification"], kind: CapabilityEvidence["kind"] = "api-result"): CapabilityEvidence {
  return { id, actionId: "x", audience: "agent", kind, sourceUrl: "https://alpina.travel/", claim, confidence: 1, verification, collectedAt: AT };
}

function capability(actionId: string, label: string, state: CapabilityResult["state"], items: CapabilityEvidence[] = [], importance: 1 | 2 | 3 = 3): CapabilityResult {
  return {
    actionId,
    label,
    description: `${label}.`,
    stage: "act",
    intent: "informational",
    importance,
    expected: true,
    expectationSource: ["archetype"],
    state,
    humanSupport: true,
    agentSupport: state === "agent-ready",
    appliesTo: [],
    evidence: items.map((item) => ({ ...item, actionId })),
  };
}

const report: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "completed",
  phase: "complete",
  mode: "live",
  requestedUrl: "https://alpina.travel/",
  createdAt: AT,
  expiresAt: "2026-10-07T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  capabilities: [
    capability("site.search", "Search the site", "agent-ready", [
      evidence("search-action-executed", 'An agent executed the site\'s declared SearchAction template with "family apartment" and the site returned results for it', "invoked"),
      evidence("mcp-endpoint-https://alpina.travel/mcp", "An agent opened an MCP session here and completed the initialize handshake and listed 2 tools", "invoked", "discovery"),
      evidence("mcp-call-search_products", 'An agent called "search_products" on the site\'s live MCP server with a query and it answered', "invoked", "tool-result"),
    ]),
    capability("availability.check", "Check availability", "unverified", [
      evidence("entry-point-availability.check-CheckAction", "The site's declared CheckAction entry point did not answer when an agent executed it: it answered HTTP 500", "failed"),
      evidence("webmcp-declarative-check_availability", '"check_availability" is annotated on this page as a WebMCP tool, but no call has been verified', "declared", "webmcp"),
    ]),
    capability("checkout.create", "Book a stay", "human-only", [], 3),
    capability("inquiry.submit", "Submit an inquiry", "missing", [], 2),
  ],
};

describe("the agent's diary", () => {
  it("tells what answered first, then what did not, then what it looked for and could not find", () => {
    expect(agentDiary(report).map((line) => `${line.tone}: ${line.text}`)).toEqual([
      "did: Searched the site for “family apartment” and got results.",
      "did: Opened the site's MCP server and found 2 tools an agent can call.",
      "did: Called “search_products” on the site's MCP server and it answered.",
      "failed: Followed the site's declared way to check availability: it did not answer (it answered HTTP 500).",
      "looked: Found a tool declared on the page for agents (“check_availability”); a browser with WebMCP could call it.",
    ]);
    // Beyond five lines, what could not be found is still there for a reader who asks for more; only the
    // three actions that matter are looked for, so the less important inquiry is not.
    expect(agentDiary(report, 8).slice(5).map((line) => line.text)).toEqual(["Looked for a way to book a stay: found one for people, none for agents."]);
  });

  it("never repeats one piece of evidence attached to two actions", () => {
    const shared = evidence("mcp-endpoint-https://alpina.travel/mcp", "An agent opened an MCP session here", "invoked", "discovery");
    const twice: ReportRecord = { ...report, capabilities: [capability("site.search", "Search", "agent-ready", [shared]), capability("site.browse", "Browse", "agent-ready", [shared])] };
    expect(agentDiary(twice).map((line) => line.text)).toEqual(["Opened the site's MCP server and listed its tools."]);
  });

  it("renders as a short list, and not at all when there is nothing to tell", () => {
    render(<AgentDiary report={report} />);
    expect(screen.getByRole("heading", { name: /what our agent managed on your site/i })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    const { container } = render(<AgentDiary report={{ ...report, capabilities: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

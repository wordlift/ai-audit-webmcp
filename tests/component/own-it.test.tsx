// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnIt, decisionsFrom } from "../../src/client/components/OwnIt";
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
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  createdAt: "2026-09-07T05:00:00.000Z",
  expiresAt: "2026-10-07T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  score: { value: 62, verifiedWeight: 3, expectedWeight: 9, counts: { expected: 3, ready: 1, unverified: 1, humanOnly: 0, missing: 1 } },
  capabilities: [
    capability({ actionId: "availability.check", label: "Check availability", state: "agent-ready", via: "sidecar" }),
    capability({ actionId: "checkout.create", label: "Create checkout", state: "unverified" }),
    capability({ actionId: "detail.retrieve", label: "Retrieve details", state: "missing", importance: 2 }),
    capability({ actionId: "newsletter.subscribe", label: "Subscribe", state: "human-only", importance: 1 }),
  ],
};

const CHILD_ID = "5b8a04c0-e247-4bec-a440-d9f3506f9213";

function Probe() {
  return <p>opened {useParams().id}</p>;
}

function renderPanel(record: ReportRecord = report) {
  return render(
    <MemoryRouter initialEntries={["/here"]}>
      <Routes>
        <Route path="/here" element={<OwnIt report={record} />} />
        <Route path="/reports/:id" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("own it, lightly", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("asks one question per action of the three, with the same three answers each", () => {
    renderPanel();
    const groups = screen.getAllByRole("group");
    // The widest gap sorts first among actions of equal importance, as on the first screen.
    expect(groups.map((group) => group.textContent)).toEqual([
      expect.stringContaining("Create checkout"),
      expect.stringContaining("Check availability"),
      expect.stringContaining("Retrieve details"),
    ]);
    for (const group of groups) {
      expect(within(group).getByLabelText("We do")).toBeVisible();
      expect(within(group).getByLabelText("A partner does")).toBeVisible();
      expect(within(group).getByLabelText("We only describe it")).toBeVisible();
    }
    expect(screen.getByRole("button", { name: /save my answers/i })).toBeDisabled();
    // The precise vocabulary stays one click below.
    expect(screen.queryByText(/partner-handoff|informational-only/)).toBeNull();
  });

  it("sends the action decisions alone, and opens the child report", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ ...report, id: CHILD_ID, parentReportId: report.id }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );
    renderPanel();
    const [checkout, availability, details] = screen.getAllByRole("group");
    fireEvent.click(within(availability!).getByLabelText("We do"));
    fireEvent.click(within(checkout!).getByLabelText("A partner does"));
    fireEvent.change(within(checkout!).getByLabelText("Partner name"), { target: { value: "Lungau Lodging" } });
    fireEvent.change(within(checkout!).getByLabelText(/partner website/i), { target: { value: "lungau-lodging.example" } });
    fireEvent.click(within(details!).getByLabelText("We only describe it"));
    fireEvent.click(screen.getByRole("button", { name: /save my answers/i }));

    await waitFor(() => expect(screen.getByText(`opened ${CHILD_ID}`)).toBeVisible());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/reports/${report.id}/refine`);
    expect(calls[0]!.body).toEqual({
      actionDecisions: [
        { actionId: "checkout.create", decision: "confirm", boundary: "partner-handoff", partner: { name: "Lungau Lodging", url: "https://lungau-lodging.example" } },
        { actionId: "availability.check", decision: "confirm", boundary: "owned" },
        { actionId: "detail.retrieve", decision: "confirm", boundary: "informational-only" },
      ],
    });
  });

  it("says what was said on a refined report, in plain words, and offers to change it", () => {
    const refined: ReportRecord = {
      ...report,
      id: CHILD_ID,
      parentReportId: report.id,
      capabilities: report.capabilities!.map((item) =>
        item.actionId === "checkout.create"
          ? { ...item, boundary: "partner-handoff", boundarySource: "human-provided", boundaryPartner: { name: "Lungau Lodging" } }
          : item.actionId === "availability.check"
            ? { ...item, boundary: "owned", boundarySource: "human-provided" }
            : item,
      ),
    };
    renderPanel(refined);
    const said = screen.getByRole("list", { name: /what you said/i });
    const items = within(said).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Create checkoutA partner runs it: Lungau Lodging",
      "Check availabilityOurs",
      "Retrieve detailsNot answered",
    ]);
    expect(screen.queryByRole("group")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /change my answers/i }));
    const [checkout] = screen.getAllByRole("group");
    expect(within(checkout!).getByLabelText("A partner does")).toBeChecked();
    expect(within(checkout!).getByLabelText("Partner name")).toHaveValue("Lungau Lodging");
    expect(screen.getByRole("button", { name: /keep what i said/i })).toBeVisible();
  });

  it("keeps the error on the page when the refinement is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "bad_request", message: "No assertion in the request applies to this report." }), { status: 400, headers: { "content-type": "application/json" } })),
    );
    renderPanel();
    fireEvent.click(within(screen.getAllByRole("group")[0]!).getByLabelText("We do"));
    fireEvent.click(screen.getByRole("button", { name: /save my answers/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/No assertion in the request applies/));
    expect(screen.getByRole("button", { name: /save my answers/i })).toBeEnabled();
  });
});

describe("what the answers amount to", () => {
  it("leaves an unanswered action alone, and names the partner only for a handoff", () => {
    expect(
      decisionsFrom({
        "a.one": { boundary: "owned", partnerName: "Ignored", partnerUrl: "" },
        "a.two": { partnerName: "", partnerUrl: "" },
        "a.three": { boundary: "partner-handoff", partnerName: "  Partner Co ", partnerUrl: "partner.example/book" },
        "a.four": { boundary: "partner-handoff", partnerName: "", partnerUrl: "" },
      }),
    ).toEqual([
      { actionId: "a.one", decision: "confirm", boundary: "owned" },
      { actionId: "a.three", decision: "confirm", boundary: "partner-handoff", partner: { name: "Partner Co", url: "https://partner.example/book" } },
      { actionId: "a.four", decision: "confirm", boundary: "partner-handoff" },
    ]);
  });
});

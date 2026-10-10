// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportRecordSchema } from "../../src/shared/schemas/report.js";
import type { CapabilityResult, ReportRecord } from "../../src/shared/types/index.js";

const api = vi.hoisted(() => ({
  getReport: vi.fn(),
  refineReport: vi.fn(),
  claimEngine: vi.fn(),
}));
vi.mock("../../src/client/api/client", async (original) => ({ ...(await original<typeof import("../../src/client/api/client")>()), ...api }));

import { AuditDoorway } from "../../src/client/surface/AuditDoorway";
import { CapabilityInspector } from "../../src/client/surface/CapabilityInspector";
import { EntityReviewModal } from "../../src/client/surface/EntityReview";
import { FixView } from "../../src/client/surface/FixView";
import { OwnershipModal } from "../../src/client/surface/OwnershipModal";
import { modeFromHash, reportHref } from "../../src/client/surface/nav";
import {
  agentStatus,
  agentsWillRead,
  coreEntities,
  detection,
  entityCounts,
  focusEntities,
  identity,
  listedCapabilities,
  otherDetected,
  ownershipDecision,
  ownershipProblem,
  peopleStatus,
  priorityAssertions,
  stagePriority,
  wikidataOf,
  type OwnershipDraft,
} from "../../src/client/surface/surface";

/**
 * The two reports the design was drawn from, kept as snapshots so a fresh scan changing never
 * invalidates a check: wordlift.io with nothing verified, mixed provenance, linked identities and
 * an unsettled business; alpina.travel with WordLift detected and mixed verification.
 */
const load = (name: string): ReportRecord => reportRecordSchema.parse(JSON.parse(readFileSync(resolve(process.cwd(), `tests/fixtures/reports/${name}.json`), "utf8")));
const wordlift = load("wordlift-zero-ready");
const alpina = load("alpina-mixed");
const capability = (report: ReportRecord, actionId: string): CapabilityResult => report.capabilities!.find((candidate) => candidate.actionId === actionId)!;
const noop = () => undefined;

beforeEach(() => {
  api.getReport.mockReset();
  api.refineReport.mockReset();
  api.claimEngine.mockReset().mockRejectedValue(new Error("no engines here"));
  window.localStorage.clear();
});

describe("what the screens say, read from the report", () => {
  it("gives every report state one word for agents, and keeps unknown unknown", () => {
    expect(agentStatus({ state: "agent-ready" })).toBe("verified");
    expect(agentStatus({ state: "unverified" })).toBe("unverified");
    expect(agentStatus({ state: "human-only" })).toBe("no-interface");
    expect(agentStatus({ state: "missing" })).toBe("not-found");
    expect(agentStatus(null)).toBe("not-checked");
    expect(agentStatus(undefined, true)).toBe("checking");
  });

  it("reads what was seen for people from the human observation, never from the agent status", () => {
    // Verified for agents, and no way for people was observed: the two are independent facts.
    const search = capability(alpina, "site.search");
    expect(search.state).toBe("agent-ready");
    expect(peopleStatus(search)).toBe("not-observed");
    expect(peopleStatus(capability(wordlift, "inquiry.submit"))).toBe("observed");
    expect(peopleStatus(null)).toBe("not-checked");
  });

  it("tells detected, not detected in this scan, and unavailable apart", () => {
    expect(detection(wordlift).state).toBe("detected");
    expect(detection({ ...wordlift, publishedWith: undefined }).state).toBe("not-detected");
    expect(detection({ ...wordlift, publishedWith: undefined, contextGraph: undefined }).state).toBe("unavailable");
    const found = detection(alpina);
    expect(found.state === "detected" && found.publishedIds.every((id) => id.startsWith("https://data.wordlift.io/"))).toBe(true);
  });

  it("never promotes a business only the text suggested: it needs review, and stays out of the core set", () => {
    const who = identity(wordlift);
    expect(who.state).toBe("needs-review");
    const names = coreEntities(wordlift).map((core) => core.entity.name);
    expect(who.state === "needs-review" && who.entity && names.includes(who.entity.name)).toBe(false);
    // A business the site declares is settled and leads.
    const settled = identity(alpina);
    expect(settled.state).toBe("resolved");
    expect(coreEntities(alpina)[0]!.view.role).toBe("business");
    expect(identity({ ...wordlift, contextGraph: { ...wordlift.contextGraph!, entities: [] } }).state).toBe("empty");
  });

  it("counts the whole model once, and the review's focus set is a subset of it", () => {
    const counts = entityCounts(wordlift);
    expect(counts.total).toBe(wordlift.contextGraph!.entities.length);
    expect(counts.declared + counts.inferred).toBe(counts.total);
    expect(focusEntities(wordlift).length).toBeLessThan(counts.total);
  });

  it("links Wikidata only where the entity was returned with the link", () => {
    for (const entity of wordlift.contextGraph!.entities) {
      const link = wikidataOf(entity);
      if (link) expect(entity.sameAs).toContain(link.url);
      else expect(entity.sameAs.some((url) => url.includes("wikidata.org"))).toBe(false);
    }
  });

  it("keeps the expected actions on the table and the other detected ones reachable", () => {
    expect(listedCapabilities(wordlift)).toHaveLength(8);
    expect(otherDetected(wordlift).length).toBeGreaterThan(0);
    expect(listedCapabilities(wordlift).some((entry) => otherDetected(wordlift).includes(entry))).toBe(false);
  });

  it("stages a priority only when it differs from what the report holds; Keep clears the change", () => {
    const entity = wordlift.contextGraph!.entities[0]!;
    const core = stagePriority({}, entity, "core");
    expect(core).toEqual({ [entity.id]: "core" });
    expect(stagePriority(core, entity, "keep")).toEqual({});
    // Choosing what a review already saved is no change, and nothing is sent to undo it.
    expect(stagePriority({}, { ...entity, humanPriority: "primary" }, "core")).toEqual({});
    expect(priorityAssertions({ [entity.id]: "core", "not-in-this-report": "peripheral" }, wordlift)).toEqual({ primaryEntityIds: [entity.id] });
  });

  it("maps the four choices onto the one contract", () => {
    const draft = (patch: Partial<OwnershipDraft>): OwnershipDraft => ({ choice: null, partnerName: "", partnerUrl: "", note: "", ...patch });
    expect(ownershipDecision("inquiry.submit", draft({ choice: "team" }))).toEqual({ actionId: "inquiry.submit", decision: "confirm", boundary: "owned" });
    expect(ownershipDecision("inquiry.submit", draft({ choice: "partner", partnerName: " Lungau Lodging ", partnerUrl: "lodging.example" }))).toEqual({
      actionId: "inquiry.submit",
      decision: "confirm",
      boundary: "partner-handoff",
      partner: { name: "Lungau Lodging", url: "https://lodging.example/" },
    });
    expect(ownershipDecision("inquiry.submit", draft({ choice: "information", note: "We explain it." }))).toEqual({ actionId: "inquiry.submit", decision: "confirm", boundary: "informational-only", rationale: "We explain it." });
    expect(ownershipDecision("inquiry.submit", draft({ choice: "not-relevant" }))).toEqual({ actionId: "inquiry.submit", decision: "reject", boundary: "not-applicable" });
    // No choice is no decision; a partner needs a name; a website is optional but must be one when given.
    expect(ownershipDecision("inquiry.submit", draft({}))).toBeNull();
    expect(ownershipProblem(draft({ choice: "partner" }))).toMatch(/name the partner/i);
    expect(ownershipProblem(draft({ choice: "partner", partnerName: "Lodging", partnerUrl: "not a site" }))).toMatch(/not a web address/i);
    expect(ownershipProblem(draft({ choice: "partner", partnerName: "Lodging" }))).toBeNull();
    // The preview states responsibility, and nothing about whether it works.
    expect(agentsWillRead("Submit an inquiry", draft({ choice: "team" }), "wordlift.io")).toBe("wordlift.io handles “Submit an inquiry” itself.");
    expect(agentsWillRead("Submit an inquiry", draft({}), "wordlift.io")).toBeNull();
  });

  it("keeps the anchors the report always had, and the selection across reports", () => {
    expect(modeFromHash("")).toBe("audit");
    expect(modeFromHash("#step-fix")).toBe("fix");
    expect(modeFromHash("#own-it")).toBe("fix");
    expect(modeFromHash("#full-audit")).toBe("evidence");
    expect(modeFromHash("#audit-evidence")).toBe("evidence");
    expect(reportHref("child", "fix", "?view=capabilities&action=inquiry.submit&utm=x")).toBe("/reports/child?view=capabilities&action=inquiry.submit#step-fix");
  });
});

function doorway(report: ReportRecord, handlers: Partial<Parameters<typeof AuditDoorway>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AuditDoorway report={report} selectedActionId={null} onInspectAction={noop} onInspectDetection={noop} onReviewEntities={noop} {...handlers} />
    </MemoryRouter>,
  );
}

describe("Audit, the doorway", () => {
  it("leads with the host, the sector and the production heading, and never headlines an uncertain organization", () => {
    doorway(wordlift);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("wordlift.io");
    expect(screen.getByText(/Software \/ SaaS/)).toHaveTextContent("5 pages analyzed");
    expect(screen.getByRole("heading", { name: "What we understood about your business" })).toBeVisible();
    expect(screen.queryByText(/Your business, understood/)).toBeNull();
    expect(screen.getByText("Business identity needs review")).toBeVisible();
    expect(screen.getByText(/The scan selected NVIDIA from your page content/)).toBeVisible();
    for (const heading of screen.getAllByRole("heading")) expect(heading).not.toHaveTextContent("NVIDIA");
  });

  it("labels uncertain entries as candidates, with type, provenance, source, details and any returned Wikidata link", () => {
    const onReviewEntities = vi.fn();
    doorway(wordlift, { onReviewEntities });
    const list = screen.getByRole("list", { name: "Candidate core entities" });
    const first = within(list).getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("WordLift");
    expect(first).toHaveTextContent(/Product · inferred/);
    expect(first).toHaveTextContent("Seen on 5 pages");
    // The identity link names its destination and is its own target, apart from the details action.
    const link = within(first).getByRole("link", { name: /WordLift on Wikidata \(Q31998763\), opens wikidata\.org/ });
    expect(link).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q31998763");
    fireEvent.click(within(first).getByRole("button", { name: "Details for WordLift" }));
    expect(onReviewEntities).toHaveBeenCalledWith({ entityId: coreEntities(wordlift)[0]!.entity.id });
    // An entity returned without a link shows none.
    const unlinked = within(list).getAllByRole("listitem").find((item) => item.textContent?.includes("AI-powered SEO"))!;
    expect(within(unlinked).queryByRole("link")).toBeNull();
  });

  it("scopes its counts, draws no relationship that was not returned, and keeps readiness secondary", () => {
    doorway(wordlift);
    const counts = entityCounts(wordlift);
    expect(screen.getByText(`${counts.total} entities found`)).toBeVisible();
    expect(screen.getByText(`${counts.declared} declared`)).toBeVisible();
    expect(screen.getByText(`${counts.inferred} inferred`)).toBeVisible();
    expect(screen.getByText(/No relationships between these entities were returned in this scan/)).toBeVisible();
    expect(screen.getByText("0 / 8 verified")).toBeVisible();
    expect(screen.getByText("Agent readiness 0/100")).toBeVisible();
    expect(screen.getByText("Nothing in this scan is verified as callable by an agent.")).toBeVisible();
    // All four stages, every expected action, each with a worded status.
    for (const stage of ["Discover", "Understand & decide", "Act", "Manage"]) expect(screen.getByRole("heading", { name: stage })).toBeVisible();
    expect(screen.getByRole("button", { name: /Submit an inquiry.*No interface found/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Retrieve details.*Unverified/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Start a trial.*Not found/ })).toBeVisible();
    expect(screen.getByRole("link", { name: /4 other detected actions/ })).toHaveAttribute("href", expect.stringContaining("others=1"));
    expect(screen.getByRole("link", { name: /review the model/i })).toHaveAttribute("href", expect.stringContaining("view=model"));
  });

  it("shows returned relations with their provenance, and a settled business as core", () => {
    doorway(alpina);
    expect(screen.getByRole("list", { name: /core entities/i })).toHaveTextContent("AlpiNest Feriendorf Lungau");
    expect(screen.queryByText("Business identity needs review")).toBeNull();
    expect(screen.getByText(`${alpina.contextGraph!.relations!.length} relationships returned`)).toBeVisible();
    expect(screen.getByText(/3 \/ 10 verified/)).toBeVisible();
  });

  it("says each detection state in its own words, and opens the evidence", () => {
    const onInspectDetection = vi.fn();
    const { unmount } = doorway(wordlift, { onInspectDetection });
    expect(screen.getByRole("heading", { name: "WordLift detected" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /view detection evidence/i }));
    expect(onInspectDetection).toHaveBeenCalled();
    unmount();
    const negative = doorway({ ...wordlift, publishedWith: undefined });
    expect(screen.getByRole("heading", { name: "Not detected in this scan" })).toBeVisible();
    negative.unmount();
    doorway({ ...wordlift, publishedWith: undefined, contextGraph: undefined, capabilities: undefined, score: undefined });
    expect(screen.getByRole("heading", { name: "Detection unavailable" })).toBeVisible();
    // Unknown stays unknown: no zero readiness, no failing map.
    expect(screen.getByText("Capabilities were not checked in this scan.")).toBeVisible();
    expect(screen.queryByText(/0 \/ /)).toBeNull();
    expect(screen.queryByText("Not found")).toBeNull();
  });

  it("explains an empty model by its scope", () => {
    doorway({ ...wordlift, contextGraph: { ...wordlift.contextGraph!, entities: [], relations: [] } });
    expect(screen.getByText(/No entities were found on the 5 pages read/)).toBeVisible();
    expect(screen.queryByRole("button", { name: /review core entities/i })).toBeNull();
  });
});

describe("the entity review", () => {
  const open = (onSaved = vi.fn(), onClose = vi.fn()) => {
    render(
      <MemoryRouter>
        <EntityReviewModal report={wordlift} onClose={onClose} onSaved={onSaved} />
      </MemoryRouter>,
    );
    return { onSaved, onClose };
  };

  it("opens on the saved state with nothing staged, and Save does nothing until something changes", () => {
    open();
    expect(screen.getByText("No changes yet")).toBeVisible();
    expect(screen.getByRole("button", { name: /save review/i })).toBeDisabled();
    for (const group of screen.getAllByRole("radiogroup")) expect(within(group).getByRole("radio", { name: "Keep" })).toBeChecked();
    // Priorities only: nothing here renames an entity or edits its type or the sector.
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("opens exactly as many rows as the browse-all link counts", () => {
    open();
    const total = wordlift.contextGraph!.entities.length;
    expect(screen.getByText(`${focusEntities(wordlift).length} entities in this view`)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: `Browse all ${total} entities` }));
    expect(screen.getByText(`${total} entities in this view`)).toBeVisible();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(total);
  });

  it("shows a selected entity's linked identity and sources without reviewing anything", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "NVIDIA" }));
    const evidence = screen.getByLabelText("Evidence for NVIDIA");
    expect(within(evidence).getByRole("heading", { name: "Why NVIDIA?" })).toBeVisible();
    expect(within(evidence).getByRole("link", { name: /NVIDIA on Wikidata/ })).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q182477");
    expect(within(evidence).getByText("Q182477")).toBeVisible();
    expect(within(evidence).getByText("No relationship was returned for this entity.")).toBeVisible();
    expect(screen.getByText("No changes yet")).toBeVisible();
  });

  it("sends only what was staged, and Keep sends nothing for that entity", async () => {
    const child = { ...wordlift, id: "11111111-1111-4111-8111-111111111111", parentReportId: wordlift.id };
    api.getReport.mockResolvedValue(wordlift);
    api.refineReport.mockResolvedValue(child);
    const { onSaved } = open();
    const rowFor = (name: string) => screen.getByRole("radiogroup", { name: `Priority for ${name}` });
    fireEvent.click(within(rowFor("WordLift")).getByRole("radio", { name: "Core" }));
    fireEvent.click(within(rowFor("NVIDIA")).getByRole("radio", { name: "Peripheral" }));
    fireEvent.click(within(rowFor("AI-powered SEO")).getByRole("radio", { name: "Core" }));
    fireEvent.click(within(rowFor("AI-powered SEO")).getByRole("radio", { name: "Keep" }));
    expect(screen.getByText("2 changes staged")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const id = (name: string) => wordlift.contextGraph!.entities.find((entity) => entity.name === name)!.id;
    // The report is read before the write, and the write carries the current report id.
    expect(api.getReport).toHaveBeenCalledWith(wordlift.id);
    expect(api.refineReport).toHaveBeenCalledTimes(1);
    expect(api.refineReport.mock.calls[0]!.slice(0, 2)).toEqual([wordlift.id, { primaryEntityIds: [id("WordLift")], demotedEntityIds: [id("NVIDIA")] }]);
    expect(onSaved.mock.calls[0]![0]).toBe(child);
    expect(onSaved.mock.calls[0]![1].summary).toBe("1 entity marked core, 1 entity marked peripheral.");
  });

  it("writes nothing on Cancel, and keeps the draft when a save fails", async () => {
    api.getReport.mockResolvedValue(wordlift);
    api.refineReport.mockRejectedValue(new Error("The service is busy."));
    const { onClose, onSaved } = open();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Priority for WordLift" })).getByRole("radio", { name: "Core" }));
    fireEvent.click(screen.getByRole("button", { name: /save review/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is busy. Your changes are still here.");
    expect(within(screen.getByRole("radiogroup", { name: "Priority for WordLift" })).getByRole("radio", { name: "Core" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
    api.refineReport.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(api.refineReport).not.toHaveBeenCalled();
  });
});

describe("Fix, the capability table and its inspector", () => {
  const fix = (report: ReportRecord, props: Partial<Parameters<typeof FixView>[0]> = {}) =>
    render(
      <MemoryRouter>
        <FixView report={report} tab="capabilities" filter="all" showOthers={false} selectedActionId={null} onSelect={noop} onInspectDetection={noop} onSaved={noop} {...props} />
      </MemoryRouter>,
    );

  it("keeps verified, unverified, no interface and not found distinct, with people in their own column", () => {
    fix(alpina);
    const row = (name: RegExp) => screen.getByRole("row", { name });
    expect(row(/search the site/i)).toHaveTextContent("Not observed");
    expect(row(/search the site/i)).toHaveTextContent("Verified");
    expect(row(/check availability/i)).toHaveTextContent("Observed");
    expect(row(/check availability/i)).toHaveTextContent("Unverified");
    expect(row(/submit an inquiry/i)).toHaveTextContent("Not found");
    expect(screen.getByText("3 verified for agents")).toBeVisible();
    expect(screen.getByRole("tab", { name: /capabilities/i })).toHaveTextContent("10");
  });

  it("groups by stage in the model's order, filters without losing rows, and reaches the other detected actions", () => {
    const onSelect = vi.fn();
    const { unmount } = fix(wordlift, { onSelect });
    expect(screen.getAllByRole("rowgroup").slice(1).map((group) => within(group).getAllByRole("row")[0]!.textContent)).toEqual(["Discover", "Understand & decide", "Act", "Manage"]);
    expect(screen.getByRole("row", { name: /compare plans/i })).toHaveTextContent("No interface found");
    fireEvent.click(screen.getByRole("button", { name: "Submit an inquiry" }));
    expect(onSelect).toHaveBeenCalledWith({ action: "inquiry.submit", inspect: null });
    fireEvent.click(screen.getByRole("button", { name: /4 other detected actions/ }));
    expect(onSelect).toHaveBeenCalledWith({ others: "1" });
    unmount();
    fix(wordlift, { showOthers: true, filter: "not-found" });
    expect(screen.getByRole("row", { name: /start a trial/i })).toBeVisible();
    expect(screen.queryByRole("row", { name: /compare plans/i })).toBeNull();
    expect(screen.getByRole("row", { name: /search the site/i })).toBeVisible();
  });

  it("says not checked when no capability map was returned, never a table of failures", () => {
    fix({ ...wordlift, capabilities: undefined, score: undefined });
    expect(screen.getByText(/Not checked: this scan returned no capability map/)).toBeVisible();
    expect(screen.queryByText("Not found")).toBeNull();
  });

  it("opens a row on what is known, scoped to this scan, and asks who handles it before any technical work", () => {
    const onReviewOwnership = vi.fn();
    render(
      <MemoryRouter>
        <CapabilityInspector report={wordlift} capability={capability(wordlift, "trial.start")} onClose={noop} onReviewOwnership={onReviewOwnership} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Start a trial" })).toBeVisible();
    expect(screen.getByText(/Not found in this scan/)).toHaveTextContent("That does not mean the business has no such service.");
    expect(screen.getByText(/say whether this action applies to your business/)).toBeVisible();
    expect(screen.getByText("This defines responsibility. It does not verify execution.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /review ownership/i }));
    expect(onReviewOwnership).toHaveBeenCalled();
    // Technical work is named and linked to the existing runbook, never performed from here.
    expect(screen.getByRole("link", { name: /open the activation runbook/i })).toHaveAttribute("href", `/reports/${wordlift.id}/activate#runbook-title`);
    expect(screen.queryByRole("button", { name: /fix|repair|install|publish/i })).toBeNull();
  });

  it("shows the successful call for a verified action, and keeps ownership review available", () => {
    render(
      <MemoryRouter>
        <CapabilityInspector report={alpina} capability={capability(alpina, "site.search")} onClose={noop} onReviewOwnership={noop} />
      </MemoryRouter>,
    );
    expect(within(screen.getByRole("list", { name: "Successful calls" })).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /review ownership/i })).toBeVisible();
  });
});

describe("action ownership", () => {
  const inquiry = capability(wordlift, "inquiry.submit");
  const landed = (boundary: CapabilityResult["boundary"], conflicts: string[] = []): ReportRecord => ({
    ...wordlift,
    id: "22222222-2222-4222-8222-222222222222",
    parentReportId: wordlift.id,
    capabilities: wordlift.capabilities!.map((entry) => (entry.actionId === "inquiry.submit" && boundary ? { ...entry, boundary, boundarySource: "human-provided" as const } : entry)),
    refinement: { assertions: {}, decisions: 1, conflicts, provenance: "human-provided", appliedAt: "2026-10-10T10:00:00.000Z" },
  });
  const open = (subject = inquiry, onSaved = vi.fn(), onClose = vi.fn()) => {
    render(
      <MemoryRouter>
        <OwnershipModal report={wordlift} capability={subject} onClose={onClose} onSaved={onSaved} />
      </MemoryRouter>,
    );
    return { onSaved, onClose };
  };

  it("starts unselected for an unknown action, and cannot be saved without an explicit choice", () => {
    open();
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByRole("button", { name: /save decision/i })).toBeDisabled();
    expect(screen.getByText("Choose who handles this action to see the line.")).toBeVisible();
    // What was observed is shown beside the choice, each in its own words.
    expect(screen.getByText("People: observed")).toBeVisible();
    expect(screen.getByText("Agent interface: no interface found")).toBeVisible();
  });

  it("opens on the saved boundary when a review already set one", () => {
    open({ ...inquiry, boundary: "partner-handoff", boundarySource: "human-provided", boundaryPartner: { name: "Lungau Lodging" } });
    expect(screen.getByRole("radio", { name: /a partner/i })).toBeChecked();
    expect(screen.getByLabelText("Partner name")).toHaveValue("Lungau Lodging");
    // Unchanged is nothing to save.
    expect(screen.getByRole("button", { name: /save decision/i })).toBeDisabled();
  });

  it("asks for the partner only when a partner is the answer, and requires the name", () => {
    open();
    expect(screen.queryByLabelText("Partner name")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /a partner/i }));
    expect(screen.getByRole("button", { name: /save decision/i })).toBeDisabled();
    expect(screen.getByText("Name the partner that handles this action.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Partner name"), { target: { value: "Lungau Lodging" } });
    expect(screen.getByRole("button", { name: /save decision/i })).toBeEnabled();
    expect(screen.getByText("wordlift.io hands “Submit an inquiry” to Lungau Lodging.")).toBeVisible();
    fireEvent.change(screen.getByLabelText(/partner website/i), { target: { value: "not a site" } });
    expect(screen.getByRole("button", { name: /save decision/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /our team/i }));
    expect(screen.queryByLabelText("Partner name")).toBeNull();
  });

  it("files one decision through the refinement, once, and hands back the reviewed version", async () => {
    const child = landed("owned");
    api.getReport.mockResolvedValue(wordlift);
    let release: (value: ReportRecord) => void = () => undefined;
    api.refineReport.mockReturnValue(new Promise<ReportRecord>((resolve) => { release = resolve; }));
    const { onSaved } = open();
    fireEvent.click(screen.getByRole("radio", { name: /our team/i }));
    fireEvent.click(screen.getByRole("button", { name: /add a note/i }));
    fireEvent.change(screen.getByLabelText(/note/i), { target: { value: "Sales answers these." } });
    const save = screen.getByRole("button", { name: /save decision/i });
    fireEvent.click(save);
    // A second click while the first is in flight sends nothing more.
    await waitFor(() => expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /saving/i }));
    release(child);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.refineReport).toHaveBeenCalledTimes(1);
    expect(api.refineReport.mock.calls[0]!.slice(0, 2)).toEqual([wordlift.id, { actionDecisions: [{ actionId: "inquiry.submit", decision: "confirm", boundary: "owned", rationale: "Sales answers these." }] }]);
    expect(onSaved.mock.calls[0]![0]).toBe(child);
    // Readiness is the evidence's: the reviewed version scores what the parent scored.
    expect(child.score).toEqual(wordlift.score);
  });

  it("keeps every field after a failure and offers Retry", async () => {
    api.getReport.mockResolvedValue(wordlift);
    api.refineReport.mockRejectedValue(new Error("The service is busy."));
    const { onSaved } = open();
    fireEvent.click(screen.getByRole("radio", { name: /a partner/i }));
    fireEvent.change(screen.getByLabelText("Partner name"), { target: { value: "Lungau Lodging" } });
    fireEvent.click(screen.getByRole("button", { name: /save decision/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The service is busy. Nothing was saved; your answer is still here.");
    expect(screen.getByLabelText("Partner name")).toHaveValue("Lungau Lodging");
    expect(screen.getByRole("radio", { name: /a partner/i })).toBeChecked();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("stays in review, with the reason, when the returned version does not carry the decision", async () => {
    api.getReport.mockResolvedValue(wordlift);
    api.refineReport.mockResolvedValue(landed(undefined, ["No action inquiry.submit in this report"]));
    const { onSaved } = open();
    fireEvent.click(screen.getByRole("radio", { name: /not relevant/i }));
    fireEvent.click(screen.getByRole("button", { name: /save decision/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The decision was not applied.No action inquiry.submit in this report");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("asks before throwing a changed form away on Escape, and Cancel discards", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = open();
    fireEvent.click(screen.getByRole("radio", { name: /our team/i }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(confirm).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.refineReport).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

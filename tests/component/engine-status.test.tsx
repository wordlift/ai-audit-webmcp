// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EngineWithStanding } from "../../src/client/api/client";
import { EngineStatus, engineLine, newerReview } from "../../src/client/components/EngineStatus";
import type { ReportRecord } from "../../src/shared/types/index.js";

const report = { id: "4a8a04c0-e247-4bec-a440-d9f3506f9212", createdAt: "2026-09-16T05:00:00.000Z" } as ReportRecord;

function engine(overrides: Partial<EngineWithStanding> = {}): EngineWithStanding {
  return {
    id: "5b8a04c0-e247-4bec-a440-d9f3506f9213",
    host: "alpina.travel",
    status: "claimed",
    owner: { state: "unverified" },
    claimed: true,
    standing: "reviewer",
    latestReportId: report.id,
    decisions: { total: 3, byOwner: 0, entities: 2, actions: 1, terminology: 0 },
    snapshots: [{ reportId: report.id, at: report.createdAt, kind: "audit", entities: [], relations: [], agentReady: [] }],
    updatedAt: report.createdAt,
    ...overrides,
  };
}

describe("where a report stands in its Context Engine", () => {
  it("says draft, claimed or verified, and whose", () => {
    expect(engineLine(engine({ claimed: false, standing: "none", status: "draft" }))).toBe("Draft · not claimed");
    expect(engineLine(engine())).toBe("Kept in this browser · ownership not verified");
    expect(engineLine(engine({ standing: "none" }))).toBe("Claimed by someone · ownership not verified");
    expect(engineLine(engine({ owner: { state: "verified", method: "meta-tag" }, standing: "owner" }))).toBe("Yours · owner verified");
  });

  it("opens the reviewed version when a review landed after this report, and not before", () => {
    const reviewed = "6c8a04c0-e247-4bec-a440-d9f3506f9214";
    const after = engine({ latestReviewedReportId: reviewed, snapshots: [...engine().snapshots, { reportId: reviewed, at: "2026-09-16T05:10:00.000Z", kind: "review", entities: [], relations: [], agentReady: [] }] });
    expect(newerReview(report, after)).toEqual({ reportId: reviewed, at: "2026-09-16T05:10:00.000Z" });
    expect(newerReview({ ...report, createdAt: "2026-09-16T06:00:00.000Z" }, after)).toBeNull();
    expect(newerReview({ ...report, id: reviewed }, after)).toBeNull();

    render(<MemoryRouter><EngineStatus report={report} engine={after} /></MemoryRouter>);
    expect(screen.getByText(/3 decisions kept/)).toBeVisible();
    expect(screen.getByRole("link", { name: /open it/i })).toHaveAttribute("href", `/reports/${reviewed}`);
  });

  it("says when this read carries an earlier review", () => {
    const carried = { ...report, refinement: { assertions: {}, decisions: 2, conflicts: [], provenance: "human-provided", appliedAt: report.createdAt, carried: true } } as ReportRecord;
    render(<MemoryRouter><EngineStatus report={carried} engine={engine()} /></MemoryRouter>);
    expect(screen.getByText(/Your earlier review carried over to this read: 2 decisions applied/)).toBeVisible();
  });

  it("shows nothing without an engine", () => {
    const { container } = render(<MemoryRouter><EngineStatus report={report} engine={null} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

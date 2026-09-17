// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ReportProgress, progressSteps } from "../../src/client/components/ReportProgress";
import type { ReportRecord } from "../../src/shared/types/index.js";

const running: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "running",
  phase: "mapping",
  mode: "live",
  requestedUrl: "https://www.northstar-lending.example/",
  createdAt: "2026-08-28T05:00:00.000Z",
  expiresAt: "2026-09-28T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  foundationAudit: {
    score: 85,
    summary: "Strong technical foundations.",
    findings: [],
    sections: [],
    quickWins: [],
    provider: "wordlift-ai-audit",
  },
  contextGraph: {
    pages: [{ url: "https://www.northstar-lending.example/", title: "Northstar Lending", role: "entry", headings: [], entityIds: [] }],
    entities: [
      {
        id: "https://www.northstar-lending.example/#org",
        types: ["Organization"],
        name: "Northstar Lending",
        alternateNames: [],
        sourceUrls: ["https://www.northstar-lending.example/"],
        sameAs: [],
        offers: [],
        confidence: 0.9,
      },
    ],
    lexicalEntries: [],
    interfaces: [],
    bindings: [],
  },
};

describe("ReportProgress", () => {
  it("shows the Context Engine forming from what has landed while the audit still runs", () => {
    render(<ReportProgress report={running} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Building a Context Engine for northstar-lending.example");
    const steps = screen.getByRole("list", { name: /what the audit has done so far/i });
    expect(steps).toHaveTextContent("Selected 1 representative page");
    expect(steps).toHaveTextContent("Found Northstar Lending");
    expect(steps).toHaveTextContent("Working out what agents should be able to do here");
    expect(screen.getByText("85/100")).toBeVisible();
    expect(screen.getByText(/call what the site declares rather than counting it/)).toBeVisible();
  });

  it("names a connection the markup declares, and marks the call phase once it runs", () => {
    const graph = running.contextGraph!;
    const withRelation = {
      ...running,
      phase: "checking",
      contextGraph: {
        ...graph,
        entities: [...graph.entities, { ...graph.entities[0]!, id: "https://www.northstar-lending.example/#loan", types: ["LoanOrCredit"], name: "Home Loan" }],
        relations: [{ from: "https://www.northstar-lending.example/#org", to: "https://www.northstar-lending.example/#loan", kind: "offers", provenance: "declared", sourceUrl: "https://www.northstar-lending.example/" }],
      },
    } as unknown as ReportRecord;
    render(<ReportProgress report={withRelation} />);
    expect(screen.getByText("Northstar Lending → offers Home Loan")).toBeVisible();
    expect(progressSteps(withRelation).find((step) => step.key === "checking")?.state).toBe("active");
    expect(progressSteps(withRelation).find((step) => step.key === "mapping")?.state).toBe("done");
  });

  it("says how far the reading of the text has got, and waits to work out actions until it is done", () => {
    const halfway = { ...running, textRead: { read: 1, of: 4 } } as ReportRecord;
    expect(progressSteps(halfway).find((step) => step.key === "text")).toMatchObject({ state: "active", label: "Reading the text of the pages · 1 of 4" });
    expect(progressSteps(halfway).find((step) => step.key === "mapping")?.state).toBe("waiting");
    const read = { ...running, textRead: { read: 4, of: 4 } } as ReportRecord;
    expect(progressSteps(read).find((step) => step.key === "text")).toMatchObject({ state: "done", label: "Read the text of 4 pages" });
    expect(progressSteps(read).find((step) => step.key === "mapping")?.state).toBe("active");
  });

  it("shows only the first step when nothing has landed yet", () => {
    render(<ReportProgress report={{ ...running, foundationAudit: undefined, contextGraph: undefined, phase: "understanding" }} />);

    expect(screen.getByText("Selecting representative pages")).toBeVisible();
    expect(screen.queryByText(/Working out/)).toBeNull();
    expect(screen.queryByText("85/100")).toBeNull();
  });
});

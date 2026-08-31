// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ReportProgress } from "../../src/client/components/ReportProgress";
import type { ReportRecord } from "../../src/shared/types/index.js";

const running: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "running",
  phase: "mapping",
  mode: "live",
  requestedUrl: "https://www.freedomdebtrelief.com/",
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
    pages: [{ url: "https://www.freedomdebtrelief.com/", title: "Freedom Debt Relief", role: "entry", headings: [], entityIds: [] }],
    entities: [
      {
        id: "https://www.freedomdebtrelief.com/#org",
        types: ["Organization"],
        name: "Freedom Debt Relief",
        alternateNames: [],
        sourceUrls: ["https://www.freedomdebtrelief.com/"],
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
  it("shows what has landed while the audit still runs", () => {
    render(<ReportProgress report={running} />);

    expect(screen.getByText("freedomdebtrelief.com")).toBeVisible();
    expect(screen.getByText("Mapping expected actions")).toBeVisible();
    expect(screen.getByText("85/100")).toBeVisible();
    expect(screen.getByText("Freedom Debt Relief")).toBeVisible();
    expect(screen.getByText(/declared interfaces are being called/)).toBeVisible();
  });

  it("shows the phases alone when nothing has landed yet", () => {
    render(<ReportProgress report={{ ...running, foundationAudit: undefined, contextGraph: undefined, phase: "understanding" }} />);

    expect(screen.getByText("Understanding the site")).toBeVisible();
    expect(screen.queryByText("85/100")).toBeNull();
  });
});

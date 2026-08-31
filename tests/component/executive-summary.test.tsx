// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ExecutiveSummary } from "../../src/client/components/ExecutiveSummary";
import type { ReportRecord } from "../../src/shared/types/index.js";

const base: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "partial",
  phase: "complete",
  mode: "live",
  requestedUrl: "https://shop.example/",
  createdAt: "2026-08-31T05:00:00.000Z",
  expiresAt: "2026-09-30T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
};

describe("the score cards", () => {
  it("says the foundation score is unavailable when the audit failed — never 0/100", () => {
    render(
      <ExecutiveSummary
        report={{
          ...base,
          score: { value: 0, verifiedWeight: 0, expectedWeight: 24, counts: { expected: 10, ready: 0, unverified: 2, humanOnly: 5, missing: 3 } },
          errors: [{ code: "audit_upstream", phase: "understanding", message: "The foundation audit answered HTTP 500.", retryable: true }],
        }}
      />,
    );

    expect(screen.getByText("Unavailable")).toBeVisible();
    expect(screen.getByText(/foundation audit did not complete/i)).toBeVisible();
    // The measured agent-readiness zero is still a real score.
    expect(screen.getByLabelText("0 out of 100")).toBeInTheDocument();
  });

  it("shows both numbers when both audits produced one", () => {
    render(
      <ExecutiveSummary
        report={{
          ...base,
          status: "completed",
          score: { value: 13, verifiedWeight: 3, expectedWeight: 24, counts: { expected: 10, ready: 1, unverified: 2, humanOnly: 4, missing: 3 } },
          foundationAudit: { score: 94, summary: "Strong knowledge signals.", findings: [], sections: [], quickWins: [], provider: "wordlift" },
        }}
      />,
    );

    expect(screen.getByText("13")).toBeVisible();
    expect(screen.getByText("94")).toBeVisible();
    expect(screen.queryByText("Unavailable")).toBeNull();
  });
});

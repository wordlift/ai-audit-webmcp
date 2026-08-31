// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ExecutiveSummary } from "../../src/client/components/ExecutiveSummary";
import type { ReportRecord } from "../../src/shared/types/index.js";

const report: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "completed",
  phase: "complete",
  mode: "demo",
  requestedUrl: "https://alpina.travel/",
  createdAt: "2026-08-31T05:00:00.000Z",
  expiresAt: "2026-09-30T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
};

describe("the published-with badge", () => {
  it("names the platform the site's structured data names", () => {
    render(
      <ExecutiveSummary
        report={{
          ...report,
          publishedWith: {
            name: "WordLift",
            evidence: "Entity ids are published on data.wordlift.io (AlpiNest Feriendorf Lungau)",
            sourceUrl: "https://alpina.travel/",
          },
        }}
      />,
    );

    expect(screen.getByText("WordLift")).toBeVisible();
    expect(screen.getByText(/Entity ids are published on data\.wordlift\.io/)).toBeVisible();
    expect(screen.getByRole("link", { name: /WordLift dashboard/ })).toHaveAttribute("href", "https://my.wordlift.io");
  });

  it("shows nothing when the site names no platform", () => {
    render(<ExecutiveSummary report={report} />);
    expect(screen.queryByText(/runs/)).toBeNull();
    expect(screen.queryByRole("link", { name: /WordLift dashboard/ })).toBeNull();
  });
});

// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { FoundationAuditDetails } from "../../src/client/components/FoundationAuditDetails";

describe("FoundationAuditDetails", () => {
  it("keeps the flow compact while exposing findings, dimensions, provenance, and the main audit", () => {
    render(<FoundationAuditDetails audit={{
      score: 82,
      summary: "Strong foundations with two gaps.",
      findings: ["Structured data: Good (15)", "Content freshness — Recommendation: Publish modification dates"],
      sections: [{
        id: "content-freshness",
        label: "Content Freshness",
        score: 6,
        status: "Needs Improvement",
        explanation: "Several pages lack visible dates.",
        details: [{ label: "Recommendations · 1", value: "Publish modification dates" }],
      }],
      quickWins: [{ title: "Add visible dates", impact: "High" }],
      provider: "wordlift-ai-audit",
      collectedAt: "2026-08-31T04:00:00.000Z",
      sourceUrl: "https://example.com/",
    }} />);

    expect(screen.getByText("Content freshness — Recommendation: Publish modification dates")).not.toBeVisible();
    fireEvent.click(screen.getByText("Full WordLift audit"));
    expect(screen.getByText("Content freshness — Recommendation: Publish modification dates")).toBeVisible();
    expect(screen.getByText("Publish modification dates")).toBeVisible();
    expect(screen.getByText("Foundation score")).toBeVisible();
    expect(screen.getByRole("link", { name: /audited site/i })).toHaveAttribute("href", "https://example.com/");
    // The way back to the full audit is offered both inside the panel and beside it.
    const backLinks = screen.getAllByRole("link", { name: /audit\.wordlift\.io/i });
    expect(backLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of backLinks) expect(link).toHaveAttribute("href", "https://audit.wordlift.io");
  });
});

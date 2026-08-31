import { stripMarkdown, summaryLead } from "../../src/shared/format/plainText.js";

describe("upstream audit prose", () => {
  it("strips markdown syntax instead of displaying it literally", () => {
    expect(stripMarkdown("**Overall**, publish `llms.txt` and [a sitemap](https://x.example) with an *H1*.")).toBe(
      "Overall, publish llms.txt and a sitemap with an H1.",
    );
    expect(stripMarkdown("## Heading\nImplement an <h1>")).toBe("Heading\nImplement an <h1>");
  });

  it("cuts the hero lead at a sentence boundary and leaves short summaries whole", () => {
    const summary = `${"The site publishes strong knowledge signals. ".repeat(12)}`;
    const lead = summaryLead(summary);
    expect(lead.length).toBeLessThanOrEqual(260);
    expect(lead.endsWith(".")).toBe(true);
    expect(summaryLead("Short and complete.")).toBe("Short and complete.");
  });
});

import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import { serializedReportSize } from "../../src/shared/schemas/report.js";

describe("fixture providers", () => {
  const provider = new FixtureProvider();

  it.each([
    "commerce-retail",
    "publisher-content",
    "travel-hospitality",
    "finance-insurance",
    "saas",
    "other",
  ])("loads the sanitized %s fixture", (fixtureId) => {
    const fixture = provider.get(fixtureId);
    expect(fixture.id).toBe(fixtureId);
    expect(fixture.url).toMatch(/^https:/);
    expect(fixture.pages?.length).toBeGreaterThanOrEqual(3);
    expect(fixture.pages?.flatMap((page) => page.entities).length).toBeGreaterThan(0);
    expect(serializedReportSize(fixture)).toBeLessThan(100_000);
    expect(JSON.stringify(fixture)).not.toMatch(/authorization|cookie|rawHtml/i);
  });

  it("resolves known hosts without accepting arbitrary fixture paths", () => {
    expect(provider.resolve(null, "alpina.travel").id).toBe("travel-hospitality");
    expect(() => provider.get("../../private")).toThrow(/unknown fixture/i);
  });
});

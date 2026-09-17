// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ContextEnginePreview, type ContextEngineSummary } from "../../src/client/components/ContextEnginePreview";

const summary = (counts: Partial<ContextEngineSummary>): ContextEngineSummary =>
  ({ pages: 4, entities: 5, declared: 0, inferred: 5, confirmed: 0, relationships: 0, preview: [], sentence: null, notOurs: [], decisions: null, filedBy: null, view: {} as never, ...counts }) as ContextEngineSummary;

describe("where the knowledge comes from, in one line", () => {
  it("says a site that declares nothing as a finding about the site, not as the tool hedging", () => {
    render(<ContextEnginePreview summary={summary({})} host="wordlift.io" />);
    expect(screen.getByText(/declares none/)).toHaveTextContent("wordlift.io declares none of these in its markup: WordLift read all 5 from its text.");
  });

  it("counts what is declared, read and confirmed when there is a mix", () => {
    render(<ContextEnginePreview summary={summary({ declared: 2, inferred: 4 })} host="alpina.travel" />);
    expect(screen.getByText(/declared by the site/)).toHaveTextContent("2 declared by the site · 4 read from its text.");
  });
});

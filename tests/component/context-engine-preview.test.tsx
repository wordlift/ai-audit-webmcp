// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ContextEnginePreview, cardAssertions, type ContextEngineSummary } from "../../src/client/components/ContextEnginePreview";

const summary = (counts: Partial<ContextEngineSummary>): ContextEngineSummary =>
  ({ pages: 4, entities: 5, declared: 0, inferred: 5, confirmed: 0, relationships: 0, preview: [], sentence: null, notOurs: [], decisions: null, filedBy: null, view: { business: null, offerings: [], places: [] } as never, ...counts }) as ContextEngineSummary;

const card = (id: string, name: string, type: string, provenance: "declared" | "inferred" | "human-confirmed") => ({ id, name, type, role: "offering" as const, provenance, variants: 0 });

describe("where the knowledge comes from, in one line", () => {
  it("says a site that declares nothing as a finding about the site, not as the tool hedging", () => {
    render(<ContextEnginePreview summary={summary({})} host="wordlift.io" />);
    expect(screen.getByText(/declares none/)).toHaveTextContent("wordlift.io declares none of these in its markup: WordLift read all 5 from its text.");
  });

  it("counts what is declared, read and confirmed when there is a mix", () => {
    render(<ContextEnginePreview summary={summary({ declared: 2, inferred: 4 })} host="alpina.travel" />);
    expect(screen.getByText(/declared by the site/)).toHaveTextContent("2 declared by the site · 4 read from its text.");
  });

  it("takes a decision on each card, collects them, and files them together as one review", async () => {
    const business = { ...card("org", "AlpiNest", "LodgingBusiness", "declared"), role: "business" as const };
    const apartment = card("apt", "Samspitze 4", "Apartment", "inferred");
    const event = card("ev", "Mountain days", "Event", "inferred");
    const town = { ...card("town", "Mariapfarr", "Place", "inferred"), role: "place" as const, within: "Lungau" };
    const onSave = vi.fn(async () => undefined);
    render(
      <ContextEnginePreview
        summary={summary({ declared: 1, inferred: 3, preview: [business, apartment], view: { business, offerings: [apartment, event], places: [town] } as never })}
        relations={[{ from: "org", to: "apt", kind: "offers", provenance: "inferred", evidence: "AlpiNest offers Samspitze 4." }]}
        host="alpina.travel"
        onSave={onSave}
      />,
    );
    // Nothing is staged until a card is told something.
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
    fireEvent.click(screen.getByRole("group", { name: "Is Samspitze 4 right?" }).querySelector("button")!);
    // Everything the model holds is one click away, in place, and just as decidable.
    fireEvent.click(screen.getByRole("button", { name: "Show all 4" }));
    expect(screen.getByText("Place in Lungau")).toBeVisible();
    fireEvent.click(screen.getByRole("group", { name: "Is Mountain days right?" }).querySelectorAll("button")[1]!);
    // A connection read from the text is settled on the same save.
    fireEvent.click(within(screen.getByRole("group", { name: "Is it right that AlpiNest offers Samspitze 4?" })).getByRole("button", { name: "Right" }));
    expect(screen.getByRole("status")).toHaveTextContent("3 corrections ready. Saving creates a reviewed version of this report.");
    fireEvent.click(screen.getByRole("button", { name: "Save 3 corrections" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ cards: { apt: "relevant", ev: "not-ours" }, relations: { "org|offers|apt": "confirm" } }));
    expect(cardAssertions({ cards: { apt: "relevant", ev: "not-ours" }, relations: { "org|offers|apt": "confirm" } })).toEqual({
      primaryEntityIds: ["apt"],
      demotedEntityIds: ["ev"],
      relationDecisions: [{ from: "org", kind: "offers", to: "apt", decision: "confirm" }],
    });
  });

  it("offers no decision on a thing already confirmed, and none at all without a way to save", () => {
    const confirmed = card("apt", "Samspitze 4", "Apartment", "human-confirmed");
    const { rerender } = render(<ContextEnginePreview summary={summary({ preview: [confirmed], view: { business: null, offerings: [confirmed], places: [] } as never })} onSave={vi.fn()} />);
    expect(screen.queryByRole("group", { name: /Is Samspitze 4 right/ })).toBeNull();
    const inferred = card("apt", "Samspitze 4", "Apartment", "inferred");
    rerender(<ContextEnginePreview summary={summary({ preview: [inferred], view: { business: null, offerings: [inferred], places: [] } as never })} />);
    expect(screen.queryByRole("group", { name: /Is Samspitze 4 right/ })).toBeNull();
  });

  it("draws an implied line from the business to what it offers when nothing says so, confirmable but never wrong", () => {
    const business = { ...card("org", "37signals", "Organization", "inferred"), role: "business" as const };
    const app = card("bc", "Basecamp", "SoftwareApplication", "inferred");
    const onSave = vi.fn(async () => undefined);
    render(<ContextEnginePreview summary={summary({ preview: [business, app], view: { business, offerings: [app], places: [] } as never })} onSave={onSave} />);
    const legend = screen.getByRole("list", { name: "How it fits together" });
    expect(legend).toHaveTextContent("37signals offers Basecamp · implied by the site's pages");
    const group = screen.getByRole("group", { name: "Is it right that 37signals offers Basecamp?" });
    expect(within(group).queryByRole("button", { name: "Wrong" })).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "Right" }));
    expect(screen.getByRole("status")).toHaveTextContent("1 correction ready");
    expect(cardAssertions({ cards: {}, relations: { "org|offers|bc": "confirm" } })).toEqual({ relationDecisions: [{ from: "org", kind: "offers", to: "bc", decision: "confirm" }] });
  });

  it("shows one card alone without columns, and says why there is nothing else", () => {
    const business = { ...card("org", "Shake Shack", "Organization", "declared"), role: "business" as const };
    render(<ContextEnginePreview summary={summary({ pages: 4, declared: 1, inferred: 0, preview: [business], view: { business, offerings: [], places: [] } as never })} onSave={vi.fn()} />);
    expect(screen.queryByText("The business")).toBeNull();
    expect(screen.getByText(/Only the business was found on these 4 pages/)).toHaveTextContent("nothing it offers is declared there or named in their text. Claiming reads more of the site.");
    expect(screen.queryByRole("list", { name: "How it fits together" })).toBeNull();
  });
});

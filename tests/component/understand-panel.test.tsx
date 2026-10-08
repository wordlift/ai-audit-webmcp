// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { actionsWithoutInterface, publishUrl, sampleJsonLd, talkToUsUrl } from "../../src/client/components/FixPanel";
import { UnderstandPanel, entityTypeLabel, groupEntities, linksFor, relationPhrases, whereFound } from "../../src/client/components/UnderstandPanel";
import type { CapabilityResult, DomainEntity, ReportRecord } from "../../src/shared/types/index.js";

function capability(overrides: Partial<CapabilityResult> & Pick<CapabilityResult, "actionId" | "label" | "state">): CapabilityResult {
  return {
    description: `${overrides.label}.`,
    stage: "act",
    intent: "transactional",
    importance: 3,
    expected: true,
    expectationSource: ["archetype"],
    humanSupport: true,
    agentSupport: overrides.state === "agent-ready",
    appliesTo: [],
    evidence: [],
    ...overrides,
  };
}

const inferred: DomainEntity = {
  id: "https://alpina.travel/#inferred-apartment-samspitze-4",
  types: ["Apartment"],
  name: "Samspitze 4",
  alternateNames: [],
  description: "A family apartment in Lungau.",
  sourceUrls: ["https://alpina.travel/lungau/apartments/samspitze-4-mariapfarr/"],
  sameAs: [],
  offers: [{ price: "128", priceCurrency: "EUR", availability: "InStock" }],
  confidence: 0.6,
  origin: "inferred",
};
const declared: DomainEntity = { ...inferred, id: "https://alpina.travel/#property", types: ["LodgingBusiness"], name: "AlpiNest", offers: [], confidence: 0.95, origin: undefined, sourceUrls: ["https://alpina.travel/"] };
const demoted: DomainEntity = { ...declared, id: "https://alpina.travel/#footer", name: "Footer menu", types: ["SiteNavigationElement"], humanPriority: "demoted" };
const promoted: DomainEntity = { ...inferred, id: "https://alpina.travel/#inferred-place-lungau", name: "Lungau", types: ["Place"], offers: [], humanPriority: "primary", confidence: 0.4, sameAs: ["https://www.wikidata.org/wiki/Q696371"] };

const base: ReportRecord = {
  id: "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  status: "completed",
  phase: "complete",
  mode: "live",
  requestedUrl: "https://alpina.travel/",
  createdAt: "2026-09-07T05:00:00.000Z",
  expiresAt: "2026-10-07T05:00:00.000Z",
  actionModelVersion: "0.1.0",
  errors: [],
  evidenceTruncated: false,
  contextGraph: {
    pages: [{ url: "https://alpina.travel/", title: "Alpina", role: "entry", headings: [], entityIds: [] }],
    entities: [declared, inferred, demoted, promoted],
    lexicalEntries: [
      { id: "term:stays", label: "Alpine stays", aliases: [], kind: "topic", entityIds: [declared.id], sourceUrls: ["https://alpina.travel/"], confidence: 0.8 },
      { id: "term:alpinest", label: "AlpiNest", aliases: [], kind: "entity-name", entityIds: [declared.id], sourceUrls: ["https://alpina.travel/"], confidence: 0.9 },
      // A headline the page uses for everything on it is not a word the site uses for one entity.
      { id: "term:headline", label: "Mountain days. One easy apartment base.", aliases: [], kind: "topic", entityIds: [declared.id, inferred.id, promoted.id], sourceUrls: ["https://alpina.travel/"], confidence: 0.7 },
    ],
    interfaces: [],
    bindings: [],
  },
  capabilities: [
    capability({ actionId: "availability.check", label: "Check availability", state: "agent-ready", appliesTo: [{ id: declared.id, name: declared.name, types: declared.types }] }),
    capability({ actionId: "booking.reserve", label: "Book a stay", state: "human-only" }),
    capability({ actionId: "property.search", label: "Find a property", state: "missing" }),
    capability({ actionId: "checkout.pay", label: "Pay", state: "missing", expected: false }),
  ],
};

describe("what an agent understands", () => {
  it("leads with the fix, lists only what exists in the text in the same card as the first screen, and says the declared ones in one line", () => {
    render(<UnderstandPanel report={base} />);
    expect(screen.getByRole("heading", { name: /fix what agents cannot understand/i })).toBeVisible();
    expect(screen.getByText(/Agents found 3 important things on these pages\./)).toHaveTextContent("1 is declared by the site, so agents already read it. 2 exist only in the text.");

    // The owner's primary entity leads, whatever its confidence; each card carries the detail the fix needs.
    const textOnly = screen.getByRole("list", { name: "Only in the text" });
    const cards = within(textOnly).getAllByRole("listitem");
    expect(cards.map((card) => within(card).getByText(/^(Lungau|Samspitze 4)$/).textContent)).toEqual(["Lungau", "Samspitze 4"]);
    expect(cards[0]).toHaveTextContent("Confirmed");
    expect(cards[0]).toHaveTextContent("Read on /lungau/apartments/samspitze-4-mariapfarr");
    expect(cards[0]).toHaveTextContent("Wikidata Q696371");
    expect(cards[1]).toHaveTextContent("Inferred from text");
    // No decision is taken here: that is the first screen's job, once.
    expect(within(textOnly).queryByRole("group")).toBeNull();
    // What the site declares is said once, not listed again.
    expect(screen.getByText(/Declared by the site:/).closest("p")).toHaveTextContent("Declared by the site: AlpiNest.");
    // A demoted entity is nowhere.
    expect(screen.queryByText("Footer menu")).toBeNull();
  });

  it("publishes the text-only ones with one button carrying the report id, and keeps the markup behind a fold", () => {
    render(<UnderstandPanel report={base} />);
    const link = screen.getByRole("link", { name: /build the live context engine with wordlift/i });
    expect(link).toHaveAttribute("href", "https://my.wordlift.io/?source=ai-audit&report=4a8a04c0-e247-4bec-a440-d9f3506f9212&intent=build-context");

    const fold = screen.getByText(/see the markup for one of them/i).closest("details")!;
    expect(fold).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText(/see the markup for one of them/i));
    expect(fold).toHaveAttribute("open");
    const sample = JSON.parse(screen.getByText(/"@context"/).textContent ?? "{}");
    // The richest text-only entity is the sample: the one with offers.
    expect(sample).toMatchObject({ "@context": "https://schema.org", "@type": "Apartment", name: "Samspitze 4" });
    expect(sample.offers[0]).toEqual({ "@type": "Offer", price: "128", priceCurrency: "EUR", availability: "https://schema.org/InStock" });
  });

  it("knows what the map links to an entity: its actions and the site's words for it", () => {
    render(<UnderstandPanel report={base} />);
    const links = linksFor(declared, base);
    expect(links.actions.map((action) => action.label)).toEqual(["Check availability"]);
    expect(links.terms).toEqual(["Alpine stays"]);
    // The entity's own name is not a word the site uses for it, and neither is the page's headline.
    expect(links.terms).not.toContain("AlpiNest");
    expect(links.terms.join(" ")).not.toContain("Mountain days");
    expect(screen.getByRole("link", { name: /open the full map/i })).toHaveAttribute("href", "#full-audit");
    expect(linksFor(inferred, base)).toEqual({ actions: [], terms: [], wikidata: null });
    // A Wikidata link the extractor was sure of is shown, and only when it exists.
    expect(screen.getByRole("link", { name: "Wikidata Q696371" })).toHaveAttribute("href", "https://www.wikidata.org/wiki/Q696371");
    expect(screen.queryByText(/suggested/i)).toBeNull();
  });

  it("says so when everything is already published, and offers nothing to publish", () => {
    render(<UnderstandPanel report={{ ...base, contextGraph: { ...base.contextGraph!, entities: [declared] } }} />);
    expect(screen.getByRole("heading", { name: /agents understand your business/i })).toBeVisible();
    expect(screen.getByText(/Agents found 1 important thing on these pages\./)).toHaveTextContent("All of it is declared by the site.");
    expect(screen.queryByRole("list", { name: "Only in the text" })).toBeNull();
    expect(screen.queryByRole("link", { name: /publish/i })).toBeNull();
  });

  it("stays away when nothing was read", () => {
    const { container } = render(<UnderstandPanel report={{ ...base, contextGraph: { ...base.contextGraph!, entities: [] } }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the words", () => {
  it("turns a schema.org type into words and a URL into a place", () => {
    expect(entityTypeLabel("LodgingBusiness")).toBe("Lodging business");
    expect(entityTypeLabel("https://schema.org/FAQPage")).toBe("Faq page");
    expect(entityTypeLabel("Product")).toBe("Product");
    expect(entityTypeLabel(undefined)).toBe("Thing");
    expect(whereFound(declared)).toBe("home page");
    expect(whereFound(inferred)).toBe("/lungau/apartments/samspitze-4-mariapfarr");
    expect(whereFound({ ...declared, sourceUrls: [] })).toBe("");
  });

  it("groups by what agents can read, leaving demoted entities out", () => {
    const groups = groupEntities([declared, inferred, demoted, promoted]);
    expect(groups.published.map((entity) => entity.name)).toEqual(["AlpiNest"]);
    expect(groups.textOnly.map((entity) => entity.name)).toEqual(["Lungau", "Samspitze 4"]);
  });
});

describe("the Fix helpers the pitch and Activate share", () => {
  it("knows which actions no agent can reach, renders one entity as its markup, and points the dashboard at the report", () => {
    expect(actionsWithoutInterface(base.capabilities!).map((capability) => capability.actionId)).toEqual(["booking.reserve", "property.search"]);
    expect(sampleJsonLd(declared)).toMatchObject({ "@context": "https://schema.org", "@type": "LodgingBusiness", "@id": "https://alpina.travel/#property" });
    expect(publishUrl("abc")).toBe("https://my.wordlift.io/?source=ai-audit&report=abc");
    expect(publishUrl("abc", { action: "availability.check", intent: "agent-ready" })).toBe("https://my.wordlift.io/?source=ai-audit&report=abc&action=availability.check&intent=agent-ready");
    expect(talkToUsUrl("abc", "checkout.create")).toBe("https://wordlift.io/book-a-demo/?source=ai-audit&report=abc&action=checkout.create");
  });

  it("says what the site's markup relates an entity to, in a few words on its row", () => {
    const related = {
      ...base,
      contextGraph: {
        ...base.contextGraph!,
        relations: [
          { from: declared.id, to: inferred.id, kind: "offers" as const, provenance: "declared" as const, sourceUrl: "https://alpina.travel/" },
          { from: inferred.id, to: promoted.id, kind: "located-in" as const, provenance: "declared" as const, sourceUrl: "https://alpina.travel/" },
        ],
      },
    };
    render(<UnderstandPanel report={related} />);
    expect(relationPhrases(declared, related)).toEqual(["offers Samspitze 4"]);
    const card = screen.getByText("Samspitze 4").closest("li")!;
    expect(within(card).getByText("offered by AlpiNest · in Lungau")).toHaveClass("engine-entity-relations");
  });
});

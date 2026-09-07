// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { FixPanel, actionsWithoutInterface, publishUrl, sampleJsonLd } from "../../src/client/components/FixPanel";
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

const declared: DomainEntity = { ...inferred, id: "https://alpina.travel/#property", types: ["LodgingBusiness"], name: "AlpiNest", offers: [], confidence: 0.95, origin: undefined };

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
  contextGraph: { pages: [{ url: "https://alpina.travel/", title: "Alpina", role: "entry", headings: [], entityIds: [] }], entities: [declared, inferred], lexicalEntries: [], interfaces: [], bindings: [] },
  capabilities: [
    capability({ actionId: "availability.check", label: "Check availability", state: "agent-ready" }),
    capability({ actionId: "booking.reserve", label: "Book a stay", state: "human-only" }),
    capability({ actionId: "property.search", label: "Find a property", state: "missing" }),
    capability({ actionId: "checkout.pay", label: "Pay", state: "missing", expected: false }),
  ],
};

describe("the Fix panel", () => {
  it("shows the difference between declared and inferred, one sample, and one button carrying the report id", () => {
    render(<FixPanel report={base} />);

    expect(screen.getByRole("heading", { name: /the markup your site should have/i })).toBeVisible();
    expect(screen.getByText(/entity appears on your pages and is not published/)).toBeVisible();
    expect(screen.getByText(/2 actions have no interface an agent can call/)).toBeVisible();

    const sample = JSON.parse(screen.getByText(/"@context"/).textContent ?? "{}");
    expect(sample).toMatchObject({ "@context": "https://schema.org", "@type": "Apartment", name: "Samspitze 4" });
    expect(sample.offers[0]).toEqual({ "@type": "Offer", price: "128", priceCurrency: "EUR", availability: "https://schema.org/InStock" });

    const link = screen.getByRole("link", { name: /publish with wordlift/i });
    expect(link).toHaveAttribute("href", "https://my.wordlift.io/?source=ai-audit&report=4a8a04c0-e247-4bec-a440-d9f3506f9212");
  });

  it("stays away when there is nothing to fix", () => {
    const { container } = render(
      <FixPanel
        report={{
          ...base,
          contextGraph: { ...base.contextGraph!, entities: [declared] },
          capabilities: [capability({ actionId: "availability.check", label: "Check availability", state: "agent-ready" })],
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("counts only expected actions that no agent can reach", () => {
    expect(actionsWithoutInterface(base.capabilities ?? []).map((item) => item.actionId)).toEqual(["booking.reserve", "property.search"]);
  });

  it("renders a sample that is JSON-LD an agent would read", () => {
    const sample = sampleJsonLd(inferred);
    expect(sample["@id"]).toBe(inferred.id);
    expect(sample.url).toBe(inferred.sourceUrls[0]);
    expect(publishUrl("abc")).toBe("https://my.wordlift.io/?source=ai-audit&report=abc");
  });
});

// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { KeyEntities } from "../../src/client/components/KeyEntities";
import type { CapabilityResult, SiteEntity } from "../../src/shared/types/index.js";

const entity: SiteEntity = {
  id: "https://alpina.travel/#samspitze-4",
  type: "Apartment",
  name: "Samspitze 4",
  description: "Alpine holiday apartment for up to 6 guests.",
  offer: { price: "644.80", priceCurrency: "EUR", availability: "InStock" },
  sourceUrl: "https://alpina.travel/",
  method: "json-ld",
  collectedAt: "2026-08-27T05:00:00.000Z",
};

const capability = {
  actionId: "detail.retrieve",
  label: "Retrieve details",
  description: "Retrieve full details of one item.",
  stage: "understand-decide",
  intent: "informational",
  importance: 2,
  expected: true,
  expectationSource: ["archetype:travel-hospitality"],
  state: "unverified",
  humanSupport: true,
  agentSupport: false,
  evidence: [],
} as CapabilityResult;

describe("KeyEntities", () => {
  it("shows the entity, its offer, its source, and the actions it justifies", () => {
    render(<KeyEntities entities={[entity]} capabilities={[capability]} />);

    expect(screen.getByText("Samspitze 4")).toBeVisible();
    expect(screen.getByText("Apartment")).toBeVisible();
    expect(screen.getByText("From 644.80 EUR · in stock")).toBeVisible();
    expect(screen.getByText("Retrieve details")).toBeVisible();
    const source = screen.getByRole("link", { name: /json-ld · 2026-08-27/ });
    expect(source).toHaveAttribute("href", "https://alpina.travel/");
  });

  it("renders nothing when the site published no entities", () => {
    const { container } = render(<KeyEntities entities={[]} capabilities={[capability]} />);
    expect(container.firstChild).toBeNull();
  });
});

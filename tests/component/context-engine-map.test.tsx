// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextEngineMap, heroEntityId } from "../../src/client/components/ContextEngineMap";
import type { CapabilityResult, ClassificationResult, ContextGraph } from "../../src/shared/types/index.js";

const binding = (entityId: string, actionId: string): ContextGraph["bindings"][number] => ({
  entityId,
  actionId,
  role: "object",
  basis: ["archetype"],
  state: "unverified",
  evidenceIds: [],
  interfaceIds: [],
  confidence: 0.8,
});

const context: ContextGraph = {
  pages: [{
    url: "https://example.com/",
    title: "Example",
    role: "entry",
    headings: ["Example"],
    entityIds: ["https://example.com/#organization"],
  }],
  entities: [
    {
      id: "https://example.com/#website",
      types: ["WebSite"],
      name: "Example site",
      alternateNames: [],
      sourceUrls: ["https://example.com/"],
      sameAs: [],
      offers: [],
      confidence: 0.9,
    },
    {
      id: "https://example.com/#organization",
      types: ["Organization"],
      name: "Example organization",
      alternateNames: [],
      sourceUrls: ["https://example.com/"],
      sameAs: [],
      offers: [],
      confidence: 0.9,
    },
  ],
  lexicalEntries: [
    { id: "cat-1", label: "Other", aliases: [], kind: "category", entityIds: [], sourceUrls: [], confidence: 0.5 },
    { id: "cat-2", label: "Other", aliases: [], kind: "category", entityIds: [], sourceUrls: [], confidence: 0.4 },
    { id: "cat-3", label: "Shopping", aliases: [], kind: "category", entityIds: [], sourceUrls: [], confidence: 0.9 },
    { id: "name-1", label: "Example organization", aliases: [], kind: "entity-name", entityIds: ["https://example.com/#organization"], sourceUrls: [], confidence: 0.9 },
    { id: "topic-1", label: "A topic", aliases: [], kind: "topic", entityIds: [], sourceUrls: [], confidence: 0.6 },
    { id: "topic-2", label: "Another topic", aliases: [], kind: "topic", entityIds: [], sourceUrls: [], confidence: 0.6 },
    { id: "topic-3", label: "Third topic", aliases: [], kind: "topic", entityIds: [], sourceUrls: [], confidence: 0.6 },
  ],
  interfaces: [],
  bindings: [
    binding("https://example.com/#organization", "site.search"),
    binding("https://example.com/#organization", "detail.retrieve"),
    binding("https://example.com/#website", "site.search"),
  ],
};

const capability = (actionId: string, label: string, state: CapabilityResult["state"]): CapabilityResult => ({
  actionId,
  label,
  description: label,
  stage: "discover",
  intent: "informational",
  importance: 3,
  expected: true,
  expectationSource: ["archetype:other"],
  state,
  humanSupport: true,
  agentSupport: false,
  appliesTo: [],
  evidence: [],
});

const capabilities = [
  capability("site.search", "Search the site", "agent-ready"),
  capability("detail.retrieve", "Retrieve details", "unverified"),
];

const classification: ClassificationResult = {
  primaryArchetype: "other",
  categories: [],
  rankedArchetypes: [{ archetype: "other", score: 1 }],
  confidence: "medium",
  margin: 1,
  provisional: false,
  model: "fixture",
  collectedAt: "2026-08-31T00:00:00.000Z",
};

function renderMap(selectedEntityId: string | null = null, onSelectEntity = vi.fn()) {
  return render(
    <ContextEngineMap
      context={context}
      classification={classification}
      capabilities={capabilities}
      selectedEntityId={selectedEntityId}
      onSelectEntity={onSelectEntity}
    />,
  );
}

describe("ContextEngineMap", () => {
  it("establishes evidence provenance before presenting key entities", () => {
    renderMap();

    const provenance = screen.getByRole("heading", { name: "Pages used to understand this site" }).closest("section");
    const entities = screen.getByRole("heading", { name: "Entities & offers" }).closest("article");

    expect(provenance).not.toBeNull();
    expect(entities).not.toBeNull();
    expect(provenance!.compareDocumentPosition(entities!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /entry example/i })).toHaveAttribute("href", "https://example.com/");
  });

  it("draws one edge per entity–action binding and lights the selected entity's circuit", () => {
    const { container } = renderMap("https://example.com/#organization");

    const paths = container.querySelectorAll(".context-edge");
    expect(paths).toHaveLength(3);
    expect(container.querySelectorAll(".context-edge-lit")).toHaveLength(2);
    expect(container.querySelectorAll(".context-edge-dim")).toHaveLength(1);
  });

  it("dims what is not connected instead of removing it", () => {
    renderMap("https://example.com/#website");

    // The website entity binds only to search; retrieval stays on the map, dimmed.
    expect(screen.getByText("Retrieve details").closest(".context-action")).toHaveClass("map-dimmed");
    expect(screen.getByText("Search the site").closest(".context-action")).not.toHaveClass("map-dimmed");
    expect(screen.getByText("Example organization").closest(".entity-card")).toHaveClass("map-dimmed");
  });

  it("summarizes the action layer's readiness at a glance", () => {
    renderMap();
    expect(screen.getByText("1 ready")).toBeVisible();
    expect(screen.getByText("1 unverified")).toBeVisible();
  });

  it("deduplicates the vocabulary and folds the long tail", () => {
    renderMap();

    // Two "Other" categories collapse into one chip; five show, the rest fold.
    expect(screen.getAllByText("Other")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "+1 more" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "+1 more" }));
    expect(screen.getByText("Third topic")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeVisible();
  });

  it("narrows the vocabulary to the selected entity's own language", () => {
    renderMap("https://example.com/#organization");

    expect(screen.getByText(/language that connects Example organization/)).toBeVisible();
    expect(screen.getAllByText("Example organization").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("A topic")).toBeNull();
  });
});

describe("heroEntityId", () => {
  it("prefers the concrete entity with the most bound actions over the website shell", () => {
    expect(heroEntityId(context)).toBe("https://example.com/#organization");
  });

  it("returns nothing when no entity is bound to an action", () => {
    expect(heroEntityId({ ...context, bindings: [] })).toBeNull();
  });
});

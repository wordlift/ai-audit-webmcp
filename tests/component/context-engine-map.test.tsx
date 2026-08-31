// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextEngineMap } from "../../src/client/components/ContextEngineMap";
import type { ClassificationResult, ContextGraph } from "../../src/shared/types/index.js";

const context: ContextGraph = {
  pages: [{
    url: "https://example.com/",
    title: "Example",
    role: "entry",
    headings: ["Example"],
    entityIds: ["https://example.com/#organization"],
  }],
  entities: [{
    id: "https://example.com/#organization",
    types: ["Organization"],
    name: "Example organization",
    alternateNames: [],
    sourceUrls: ["https://example.com/"],
    sameAs: [],
    offers: [],
    confidence: 0.9,
  }],
  lexicalEntries: [],
  interfaces: [],
  bindings: [],
};

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

describe("ContextEngineMap", () => {
  it("establishes evidence provenance before presenting key entities", () => {
    render(
      <ContextEngineMap
        context={context}
        classification={classification}
        capabilities={[]}
        selectedEntityId={null}
        onSelectEntity={vi.fn()}
      />,
    );

    const provenance = screen.getByRole("heading", { name: "Pages used to understand this site" }).closest("section");
    const entities = screen.getByRole("heading", { name: "Entities & offers" }).closest("article");

    expect(provenance).not.toBeNull();
    expect(entities).not.toBeNull();
    expect(provenance!.compareDocumentPosition(entities!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: /entry example/i })).toHaveAttribute("href", "https://example.com/");
  });
});

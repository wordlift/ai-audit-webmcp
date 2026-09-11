// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocDialog, jsonTokens, markdownBlocks, type PublishedDoc } from "../../src/client/components/DocDialog";

const jsonDoc: PublishedDoc = {
  kind: "Business data",
  title: "On your pages",
  note: "JSON-LD for the site's pages.",
  text: JSON.stringify({ "@context": "https://schema.org", "@type": "LodgingBusiness", name: "AlpiNest", rating: 4.8, open: true, parent: null }, null, 2),
  href: "https://audit.example/api/reports/r1/publish/page.jsonld",
  format: "json",
};

const skillDoc: PublishedDoc = {
  kind: "Agent instructions",
  title: "For agents",
  note: "The Terms of Action as a file an agent loads before acting.",
  text: ["# alpina.travel: Terms of Action", "", "## Entities", "", "- AlpiNest (LodgingBusiness) — \`https://alpina.travel/#org\`, primary", "- Samspitze 4 (Apartment)", "", "## Actions", "", "### Check availability (\`availability.check\`)", "", "Who runs it: **We do**. See [the report](https://audit.example/reports/r1)."].join("\n"),
  href: "https://audit.example/api/reports/r1/publish/skill.md",
  format: "markdown",
};

describe("one published document, read in full", () => {
  it("colours JSON by token: keys apart from strings, numbers and literals", () => {
    const kinds = jsonTokens(jsonDoc.text).filter((token) => token.kind !== "space" && token.kind !== "punct");
    expect(kinds.filter((token) => token.kind === "key").map((token) => token.text)).toEqual(['"@context"', '"@type"', '"name"', '"rating"', '"open"', '"parent"']);
    expect(kinds.filter((token) => token.kind === "string").map((token) => token.text)).toEqual(['"https://schema.org"', '"LodgingBusiness"', '"AlpiNest"']);
    expect(kinds.filter((token) => token.kind === "number").map((token) => token.text)).toEqual(["4.8"]);
    expect(kinds.filter((token) => token.kind === "literal").map((token) => token.text)).toEqual(["true", "null"]);
    // Every character survives the tokenising: the text is the text.
    expect(jsonTokens(jsonDoc.text).map((token) => token.text).join("")).toBe(jsonDoc.text);
  });

  it("shows a front matter as the file's metadata, key by key, and never as prose", () => {
    const blocks = markdownBlocks("---\nname: alpina.travel Terms of Action\nversion: 1\n---\n# Title\n\nA line.");
    expect(blocks[0]).toEqual({ type: "meta", entries: [["name", "alpina.travel Terms of Action"], ["version", "1"]] });
    expect(blocks[1]).toEqual({ type: "heading", level: 1, text: "Title" });
    expect(blocks[2]).toEqual({ type: "paragraph", text: "A line." });
  });

  it("reads the generated markdown as headings, lists and paragraphs", () => {
    const blocks = markdownBlocks(skillDoc.text);
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "alpina.travel: Terms of Action" });
    expect(blocks[1]).toEqual({ type: "heading", level: 2, text: "Entities" });
    expect(blocks[2]).toMatchObject({ type: "list" });
    expect((blocks[2] as { items: string[] }).items).toHaveLength(2);
    expect(blocks.at(-1)).toMatchObject({ type: "paragraph" });
  });

  it("opens the document formatted, with the whole file to copy and the raw file one click away", () => {
    render(<DocDialog doc={skillDoc} onOpenChange={() => undefined} />);
    expect(screen.getByRole("heading", { name: "For agents" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Entities" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Check availability/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "the report" })).toHaveAttribute("href", "https://audit.example/reports/r1");
    expect(screen.getByText("We do").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: /Open the raw file/ })).toHaveAttribute("href", skillDoc.href);
    expect(screen.getByText(/lines ·/)).toBeInTheDocument();
  });

  it("copies the whole file, not the glimpse", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DocDialog doc={jsonDoc} onOpenChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Copy the whole file/ }));
    expect(writeText).toHaveBeenCalledWith(jsonDoc.text);
    expect(document.querySelectorAll(".tok-key").length).toBe(6);
  });

  it("renders nothing when no document is open", () => {
    render(<DocDialog doc={null} onOpenChange={() => undefined} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

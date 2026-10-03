import { REMOTE_TOOLS } from "../../src/server/mcp/tools.js";

/** What a directory reviewer sees. Any change to it is a change to a published promise. */
const published = REMOTE_TOOLS.map((tool) => tool.definition);

describe("published MCP tool definitions", () => {
  it("publishes exactly the five public review tools", () => {
    expect(published.map((tool) => tool.name)).toEqual([
      "audit-website",
      "get-audit-report",
      "inspect-terms-of-action",
      "explain-capability",
      "explain-foundation-audit",
    ]);
  });

  it("never calls a report-creating tool read-only", () => {
    const tool = published.find((candidate) => candidate.name === "audit-website");
    expect(tool?.annotations.readOnlyHint, "audit-website creates a report").toBe(false);
    expect(tool?.annotations.destructiveHint, "audit-website destroys nothing").toBe(false);
    expect(tool?.annotations.idempotentHint, "audit-website creates a new report each call").toBe(false);
  });

  it("marks the reads read-only and says which of them leave the service", () => {
    const reads = published.filter((tool) => tool.annotations.readOnlyHint);
    expect(reads.map((tool) => tool.name).sort()).toEqual([
      "explain-capability",
      "explain-foundation-audit",
      "get-audit-report",
      "inspect-terms-of-action",
    ]);
    for (const tool of reads) expect(tool.annotations.openWorldHint).toBe(false);
    expect(published.find((tool) => tool.name === "audit-website")?.annotations.openWorldHint).toBe(true);
  });

  it("declares an output schema for every structured public result", () => {
    for (const tool of published) {
      expect(tool.outputSchema, `${tool.name} returns structuredContent and needs outputSchema`).toBeDefined();
      expect(tool.outputSchema.type, `${tool.name} output must be an object`).toBe("object");
    }
  });

  it("does not expose the human-refinement bearer flow remotely", () => {
    expect(published.some((tool) => tool.name === "refine-terms-of-action")).toBe(false);
    expect(JSON.stringify(published)).not.toMatch(/claimToken/i);
  });

  it("keeps every result marked as carrying untrusted website content", () => {
    for (const tool of published) expect(tool.annotations.untrustedContentHint).toBe(true);
  });

  it("gives every tool the label a person sees, distinct from the name a model calls", () => {
    const titles = published.map((tool) => tool.title);
    for (const [index, title] of titles.entries()) {
      expect(title, `${published[index].name} needs a title`).toMatch(/^[A-Z].{3,60}$/);
      expect(title).not.toBe(published[index].name);
    }
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("answers the three questions a directory review asks of every tool", () => {
    for (const tool of published) {
      for (const annotation of ["readOnlyHint", "destructiveHint", "openWorldHint"]) {
        expect(typeof tool.annotations[annotation], `${tool.name} must state ${annotation}`).toBe("boolean");
      }
    }
  });

  it("carries no audited-site content in its static metadata", () => {
    const text = JSON.stringify(published).toLowerCase();
    for (const leak of ["alpina", "http://", "<script", "cookie"]) expect(text).not.toContain(leak);
  });
});

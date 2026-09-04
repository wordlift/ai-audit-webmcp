import { REMOTE_TOOLS } from "../../src/server/mcp/tools.js";

/** What a directory reviewer sees. Any change to it is a change to a published promise. */
const published = REMOTE_TOOLS.map((tool) => tool.definition);

describe("published MCP tool definitions", () => {
  it("publishes exactly this contract", () => {
    expect(published).toMatchSnapshot();
  });

  it("never calls a report-creating tool read-only", () => {
    for (const name of ["audit-website", "refine-terms-of-action"]) {
      const tool = published.find((candidate) => candidate.name === name);
      expect(tool?.annotations.readOnlyHint, `${name} creates a report`).toBe(false);
      expect(tool?.annotations.destructiveHint, `${name} destroys nothing`).toBe(false);
      expect(tool?.annotations.idempotentHint, `${name} creates a new report each call`).toBe(false);
    }
  });

  it("marks the reads read-only and says which of them leave the service", () => {
    const reads = published.filter((tool) => tool.annotations.readOnlyHint);
    expect(reads.map((tool) => tool.name).sort()).toEqual([
      "explain-capability",
      "explain-foundation-audit",
      "get-audit-report",
      "inspect-terms-of-action",
    ]);
    // Reads answer from the stored report; only an audit goes out to a stranger's website.
    for (const tool of reads) expect(tool.annotations.openWorldHint).toBe(false);
    expect(published.find((tool) => tool.name === "audit-website")?.annotations.openWorldHint).toBe(true);
  });

  it("keeps every result marked as carrying untrusted website content", () => {
    for (const tool of published) expect(tool.annotations.untrustedContentHint).toBe(true);
  });

  it("carries no audited-site content in its static metadata", () => {
    const text = JSON.stringify(published).toLowerCase();
    for (const leak of ["alpina", "http://", "<script", "cookie"]) expect(text).not.toContain(leak);
  });
});

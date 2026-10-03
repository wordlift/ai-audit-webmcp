import { parseHTML } from "linkedom";
import {
  catalogHints,
  interfacesNamedIn,
  isServerCardEntry,
  isSkillEntry,
  parseCatalogEntries,
  sameOriginEntries,
  serverCardEndpoints,
} from "../../src/server/adapters/scrape/agentCatalog.js";

const base = new URL("https://alpina.travel/");

describe("reading a site's agent catalog", () => {
  it("reads the entries in either spelling of the draft", () => {
    const google = JSON.stringify({
      specVersion: "1.0",
      host: { displayName: "Alpina", identifier: "alpina.travel" },
      entries: [
        { identifier: "urn:ai:alpina.travel:booking:availability", type: "application/mcp-server-card+json", url: "https://alpina.travel/.well-known/mcp/server-card.json" },
        { identifier: "urn:ai:alpina.travel:terms-of-action", type: "application/ai-skill+md", url: "https://alpina.travel/.well-known/agent-skills/terms-of-action.md" },
      ],
    });
    const spec = JSON.stringify({
      entries: [{ identifier: "urn:air:alpina.travel:booking:availability", type: "application/mcp-server-card+json", url: "https://alpina.travel/.well-known/mcp/server-card.json" }],
    });

    expect(parseCatalogEntries(google)).toHaveLength(2);
    expect(parseCatalogEntries(spec)).toHaveLength(1);
    expect(parseCatalogEntries(google).filter(isServerCardEntry)).toHaveLength(1);
    expect(parseCatalogEntries(google).filter(isSkillEntry)).toHaveLength(1);
  });

  it("drops what an agent could not follow", () => {
    const body = JSON.stringify({
      entries: [null, "text", { url: "https://alpina.travel/x" }, { type: "application/mcp-server-card+json", url: "ftp://alpina.travel/card" }, { type: " Application/AI-Skill+MD " }],
    });
    const entries = parseCatalogEntries(body);
    expect(entries).toEqual([
      { type: "application/mcp-server-card+json" },
      { type: "application/ai-skill+md" },
    ]);
    expect(parseCatalogEntries("<html>")).toEqual([]);
    expect(parseCatalogEntries(JSON.stringify({ entries: "nope" }))).toEqual([]);
  });

  it("follows only artifacts on the site's own origin", () => {
    const entries = parseCatalogEntries(
      JSON.stringify({
        entries: [
          { type: "application/mcp-server-card+json", url: "https://alpina.travel/.well-known/mcp/server-card.json" },
          { type: "application/mcp-server-card+json", url: "https://evil.example/.well-known/mcp/server-card.json" },
        ],
      }),
    );
    expect(sameOriginEntries(entries, base).map((entry) => entry.url)).toEqual(["https://alpina.travel/.well-known/mcp/server-card.json"]);
  });
});

describe("where a site says its catalog is", () => {
  it("reads a link tag and a robots directive, on the site's origin only", () => {
    const { document } = parseHTML(
      '<html><head><link rel="ai-catalog" href="/agents/catalog.json"><link rel="ai-catalog" href="https://other.example/c.json"></head><body></body></html>',
    );
    const robots = "User-agent: *\nAllow: /\nAgentmap: https://alpina.travel/.well-known/ai-catalog.json\nagentmap: https://cdn.example/x.json\n";
    expect(catalogHints(document, robots, base)).toEqual([
      "https://alpina.travel/agents/catalog.json",
      "https://alpina.travel/.well-known/ai-catalog.json",
    ]);
  });

  it("is quiet when nothing hints", () => {
    expect(catalogHints(null, "User-agent: *\nAllow: /\n", base)).toEqual([]);
  });
});

describe("the interfaces a skill names", () => {
  it("finds MCP endpoints on the site's origin and ignores everything else", () => {
    const skill = [
      "# Acting on alpina.travel",
      "Check availability by calling https://alpina.travel/mcp (Streamable HTTP).",
      "Our docs live at https://alpina.travel/docs/booking, and payments go to https://pay.example/mcp.",
      "Legacy: https://alpina.travel/api/mcp-legacy/sse.",
    ].join("\n");
    expect(interfacesNamedIn(skill, base)).toEqual(["https://alpina.travel/mcp", "https://alpina.travel/api/mcp-legacy/sse"]);
  });
});

describe("the transports a server card names", () => {
  it("lists streamable HTTP before SSE and skips what is not a URL", () => {
    const card = JSON.stringify({
      transports: [
        { type: "sse", endpoint: "https://alpina.travel/mcp/sse" },
        { type: "streamable-http", endpoint: "https://alpina.travel/mcp" },
        { type: "stdio", endpoint: "node server.js" },
      ],
    });
    expect(serverCardEndpoints(card)).toEqual(["https://alpina.travel/mcp", "https://alpina.travel/mcp/sse"]);
    expect(serverCardEndpoints("not json")).toEqual([]);
  });
});

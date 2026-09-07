import type { DiscoveryDocument, McpEndpointProbe, SiteSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";
import { detectSiteEvidence } from "../../src/domain/evidence/detectSiteEvidence.js";

const NOW = "2026-09-07T10:00:00.000Z";

function snapshotWith(overrides: Partial<SiteSnapshot>): SiteSnapshot {
  return {
    requestedUrl: "https://alpina.travel/",
    canonicalUrl: "https://alpina.travel/",
    title: "Alpina",
    description: "",
    pages: [],
    text: "",
    headings: [],
    linkPaths: [],
    linkLabels: [],
    forms: [],
    jsonLdTypes: [],
    discovery: [],
    pageTools: [],
    mcpEndpoints: [],
    softNotFound: false,
    truncated: false,
    ...overrides,
  };
}

function documentWith(overrides: Partial<DiscoveryDocument> & Pick<DiscoveryDocument, "kind" | "url">): DiscoveryDocument {
  return { status: "valid", found: true, declaredNames: [], ...overrides };
}

function failedProbe(overrides: Partial<McpEndpointProbe>): McpEndpointProbe {
  return {
    url: "https://alpina.travel/mcp",
    transport: "streamable-http",
    sessionOpened: false,
    initialized: false,
    serverName: "",
    protocolVersion: "",
    tools: [],
    error: "HTTP 404",
    ...overrides,
  };
}

describe("whether agents can discover a site", () => {
  it("reads a catalog at the well-known path as a declaration, in either spelling", () => {
    for (const kind of ["ai-catalog", "ard"] as const) {
      const url = `https://alpina.travel/.well-known/${kind === "ard" ? "ard.json" : "ai-catalog.json"}`;
      const detection = detectSiteEvidence(snapshotWith({ discovery: [documentWith({ kind, url })] }), NOW);

      expect(detection.signals).toContain(`agent:${kind}`);
      const declared = detection.evidence.find((item) => item.id === `discovery-${kind}`);
      expect(declared?.verification).toBe("declared");
      expect(detection.agentDiscovery).toEqual({ catalog: "found", catalogUrl: url, memory: "missing" });
    }
  });

  it("says agents cannot discover a site that publishes nothing", () => {
    const detection = detectSiteEvidence(snapshotWith({}), NOW);
    expect(detection.agentDiscovery).toEqual({ catalog: "missing", memory: "missing" });
  });

  it("refuses to accuse a site that answers every path with its page", () => {
    const detection = detectSiteEvidence(snapshotWith({ softNotFound: true }), NOW);
    expect(detection.agentDiscovery?.catalog).toBe("unknown");
    expect(detection.agentDiscovery?.memory).toBe("unknown");
  });

  it("finds the site's memory through the skill the catalog names, or at the conventional path", () => {
    const viaCatalog = detectSiteEvidence(
      snapshotWith({
        discovery: [
          documentWith({
            kind: "ai-catalog",
            url: "https://alpina.travel/.well-known/ai-catalog.json",
            entries: [{ type: "application/ai-skill+md", url: "https://alpina.travel/.well-known/agent-skills/terms-of-action.md" }],
          }),
        ],
      }),
      NOW,
    );
    expect(viaCatalog.agentDiscovery?.memory).toBe("found");
    expect(viaCatalog.agentDiscovery?.memoryUrl).toBe("https://alpina.travel/.well-known/agent-skills/terms-of-action.md");

    const viaPath = detectSiteEvidence(
      snapshotWith({ discovery: [documentWith({ kind: "skill", url: "https://alpina.travel/skill.md" })] }),
      NOW,
    );
    expect(viaPath.agentDiscovery).toEqual({ catalog: "missing", memory: "found", memoryUrl: "https://alpina.travel/skill.md" });
  });
});

describe("what a site's instructions and catalog promise", () => {
  it("turns a skill naming an endpoint the audit could not call into a finding", () => {
    const detection = detectSiteEvidence(snapshotWith({ mcpEndpoints: [failedProbe({ source: "skill" })] }), NOW);
    const finding = detection.evidence.find((item) => item.id.startsWith("mcp-endpoint-failed"));

    expect(finding?.verification).toBe("failed");
    expect(finding?.claim).toContain("instructions for agents");
    expect(finding?.claim).toContain("the memory promises what the site does not do");
  });

  it("names the catalog when the catalog made the claim", () => {
    const detection = detectSiteEvidence(snapshotWith({ mcpEndpoints: [failedProbe({ source: "catalog" })] }), NOW);
    const finding = detection.evidence.find((item) => item.id.startsWith("mcp-endpoint-failed"));
    expect(finding?.claim).toContain("agent catalog names this MCP endpoint");
  });

  it("still says nothing about a bare link that never spoke MCP", () => {
    const detection = detectSiteEvidence(snapshotWith({ mcpEndpoints: [failedProbe({ source: "link" })] }), NOW);
    expect(detection.evidence.some((item) => item.id.startsWith("mcp-endpoint-failed"))).toBe(false);
  });

  it("never raises an action past unverified on a declaration alone", () => {
    const detection = detectSiteEvidence(
      snapshotWith({
        discovery: [
          documentWith({
            kind: "ai-catalog",
            url: "https://alpina.travel/.well-known/ai-catalog.json",
            entries: [{ type: "application/mcp-server-card+json", url: "https://alpina.travel/.well-known/mcp/server-card.json" }],
          }),
        ],
      }),
      NOW,
    );
    expect(detection.evidence.every((item) => item.verification !== "invoked")).toBe(true);
  });
});

import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { detectSiteEvidence } from "../../src/domain/evidence/detectSiteEvidence.js";
import type {
  McpEndpointProbe,
  McpToolProbe,
  PageAgentTool,
  SiteSnapshot,
} from "../../src/server/adapters/scrape/ScrapeProvider.js";
import { collectDeclarativeTools, extractImperativeTools } from "../../src/server/adapters/scrape/webmcpTools.js";

const COLLECTED_AT = "2026-08-27T05:00:00.000Z";

/** The declarative annotation as alpina.travel actually ships it. */
const DECLARATIVE_HTML = `<!doctype html><html><body>
<form class="availability-form" data-availability-form
      toolname="prepare_samspitze_availability_check"
      tooldescription="Prepare and run a visible live availability and EUR price check for Samspitze 4.">
  <input type="date" name="checkIn" toolparamdescription="Arrival date for the stay." required>
  <input type="date" name="checkOut" toolparamdescription="Departure date for the stay." required>
  <input type="number" name="adults" toolparamdescription="Number of adult guests, from 1 to 6." required>
  <button type="submit">Check price</button>
</form></body></html>`;

/** A registration bundle after minification, where string literals become template literals. */
const IMPERATIVE_SCRIPT = [
  "var n=[{name:`check_samspitze_availability`,title:`Check Samspitze 4 availability`,",
  "description:`Check live Samspitze 4 availability and pricing. This is read-only.`,",
  "inputSchema:{type:`object`,properties:{checkIn:{type:`string`}}},execute:async()=>1},",
  "{name:`search_lungau`,description:`Search the published knowledge graph.`,",
  "inputSchema:{type:`object`},execute:async()=>2}];",
  "typeof navigator<`u`&&navigator.modelContext.registerTool(n[0]);",
].join("");

function snapshotWith(overrides: Partial<SiteSnapshot>): SiteSnapshot {
  return {
    requestedUrl: "https://alpina.travel/",
    canonicalUrl: "https://alpina.travel/",
    title: "Lungau Holidays",
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

function called(name: string): McpToolProbe {
  return { name, called: true, ok: true, arguments: '{"query":"Lungau"}' };
}

function listed(name: string): McpToolProbe {
  return { name, called: false, ok: false, note: "not annotated read-only" };
}

function probeWith(overrides: Partial<McpEndpointProbe>): McpEndpointProbe {
  return {
    url: "https://alpina.travel/mcp/sse",
    transport: "sse",
    sessionOpened: true,
    initialized: true,
    serverName: "alpina-travel",
    protocolVersion: "2025-06-18",
    tools: [],
    ...overrides,
  };
}

describe("declarative WebMCP", () => {
  it("reads a tool annotated on a form, with its documented parameters", () => {
    const { document } = parseHTML(DECLARATIVE_HTML);
    const tools = collectDeclarativeTools(document as unknown as Document, "https://alpina.travel/");

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("prepare_samspitze_availability_check");
    expect(tools[0].origin).toBe("declarative");
    expect(tools[0].description).toMatch(/live availability and EUR price check/);
    expect(tools[0].parameters.map((parameter) => parameter.name)).toEqual(["checkIn", "checkOut", "adults"]);
  });

  it("ignores a form that carries no tool annotation", () => {
    const { document } = parseHTML(`<form><input type="date" name="checkIn"></form>`);
    expect(collectDeclarativeTools(document as unknown as Document, "https://example.com/")).toEqual([]);
  });
});

describe("imperative WebMCP", () => {
  it("reads tools out of a minified registration bundle", () => {
    const tools = extractImperativeTools(IMPERATIVE_SCRIPT, "https://alpina.travel/_astro/BaseLayout.js");
    expect(tools.map((tool) => tool.name)).toEqual(["check_samspitze_availability", "search_lungau"]);
    expect(tools[0].origin).toBe("imperative");
    expect(tools[0].description).toMatch(/read-only/);
  });

  it("reads nothing from a bundle that never touches the WebMCP surface", () => {
    const script = "var a=[{name:`checkout`,inputSchema:{},execute(){}}];export default a;";
    expect(extractImperativeTools(script, "https://example.com/app.js")).toEqual([]);
  });

  it("ignores object literals that only happen to have a name", () => {
    const script = "navigator.modelContext.registerTool(t);var user={name:`ada`,role:`admin`};";
    expect(extractImperativeTools(script, "https://example.com/app.js")).toEqual([]);
  });
});

describe("site evidence from page tools", () => {
  const pageTools: PageAgentTool[] = [
    {
      name: "check_samspitze_availability",
      description: "Check live availability.",
      origin: "imperative",
      sourceUrl: "https://alpina.travel/_astro/BaseLayout.js",
      parameters: [],
    },
    {
      name: "prepare_samspitze_availability_check",
      description: "Prepare a live availability check.",
      origin: "declarative",
      sourceUrl: "https://alpina.travel/",
      parameters: [{ name: "checkIn", description: "Arrival date." }],
    },
  ];

  it("reports a WebMCP availability tool as declared agent support, never as verified", () => {
    const { evidence, signals } = detectSiteEvidence(snapshotWith({ pageTools }), COLLECTED_AT);
    const availability = evidence.filter((item) => item.actionId === "availability.check");

    expect(availability).toHaveLength(2);
    expect(availability.every((item) => item.audience === "agent")).toBe(true);
    expect(availability.every((item) => item.kind === "webmcp")).toBe(true);
    expect(availability.every((item) => item.verification === "declared")).toBe(true);
    expect(signals).toEqual(
      expect.arrayContaining(["agent:webmcp", "agent:webmcp-declarative", "agent:webmcp-imperative"]),
    );
  });

  it("keeps the human form finding separate from the agent tool on the same form", () => {
    const snapshot = snapshotWith({
      pageTools,
      forms: [
        {
          name: "availability",
          method: "post",
          action: "/booking",
          inputNames: ["checkin", "checkout", "adults"],
          hasDateInput: true,
          hasSearchInput: false,
        },
      ],
    });

    const availability = detectSiteEvidence(snapshot, COLLECTED_AT).evidence.filter(
      (item) => item.actionId === "availability.check",
    );
    expect(availability.filter((item) => item.audience === "human")).toHaveLength(1);
    expect(availability.filter((item) => item.audience === "agent")).toHaveLength(2);
  });
});

describe("site evidence from a linked MCP endpoint", () => {
  it("records a completed handshake as invoked and its tool list as declared", () => {
    const snapshot = snapshotWith({
      mcpEndpoints: [probeWith({ tools: [called("check_samspitze_availability"), listed("search_lungau")] })],
    });
    const { evidence, signals } = detectSiteEvidence(snapshot, COLLECTED_AT);

    const handshake = evidence.find((item) => item.id.startsWith("mcp-endpoint-"));
    expect(handshake?.verification).toBe("invoked");
    expect(handshake?.claim).toMatch(/completed the initialize handshake with "alpina-travel"/);

    const invoked = evidence.find((item) => item.id === "mcp-call-check_samspitze_availability");
    expect(invoked?.actionId).toBe("availability.check");
    expect(invoked?.verification).toBe("invoked");
    expect(invoked?.claim).toMatch(/called "check_samspitze_availability".*returned a result/);

    const notCalled = evidence.find((item) => item.id === "mcp-tool-search_lungau");
    expect(notCalled?.verification).toBe("declared");
    expect(notCalled?.claim).toMatch(/not called: not annotated read-only/);
    expect(signals).toContain("agent:mcp-endpoint");
  });

  it("records a linked endpoint that never handshakes as a broken declaration", () => {
    const snapshot = snapshotWith({
      mcpEndpoints: [probeWith({ initialized: false, sessionOpened: false, error: "endpoint answered 404" })],
    });
    const evidence = detectSiteEvidence(snapshot, COLLECTED_AT).evidence;
    const failure = evidence.find((item) => item.id.startsWith("mcp-endpoint-failed-"));

    expect(failure?.verification).toBe("failed");
    expect(failure?.claim).toMatch(/did not complete a handshake: endpoint answered 404/);
    expect(evidence.some((item) => item.verification === "invoked")).toBe(false);
  });
});

describe("UCP discovery", () => {
  it("maps published commerce capabilities to declared agent evidence", () => {
    const snapshot = snapshotWith({
      discovery: [
        {
          kind: "ucp",
          url: "https://alpina.travel/.well-known/ucp",
          status: "valid",
          found: true,
          declaredNames: ["dev.ucp.shopping.checkout", "dev.ucp.shopping.fulfillment"],
        },
      ],
    });
    const { evidence, signals } = detectSiteEvidence(snapshot, COLLECTED_AT);

    const declared = evidence.filter((item) => item.audience === "agent");
    expect(declared.map((item) => item.actionId)).toEqual(
      expect.arrayContaining(["checkout.create", "transaction.status"]),
    );
    expect(declared.every((item) => item.verification === "declared")).toBe(true);
    expect(signals).toContain("agent:ucp");
  });
});

describe("a site that answers unknown paths with its own page", () => {
  it("reports the soft 404 once instead of accusing each probed path of being broken", () => {
    const snapshot = snapshotWith({
      softNotFound: true,
      discovery: [
        { kind: "skill", url: "https://alpina.travel/skill.md", status: "missing", found: false, declaredNames: [] },
        {
          kind: "webmcp-tools",
          url: "https://alpina.travel/.well-known/webmcp/tools.json",
          status: "missing",
          found: false,
          declaredNames: [],
        },
      ],
    });
    const evidence = detectSiteEvidence(snapshot, COLLECTED_AT).evidence;

    expect(evidence.filter((item) => item.verification === "failed")).toEqual([]);
    expect(evidence.find((item) => item.id === "soft-not-found")?.claim).toMatch(/answers unknown paths/);
  });

  it("does not let the soft 404 cancel an MCP handshake that actually worked", () => {
    const snapshot = snapshotWith({
      softNotFound: true,
      mcpEndpoints: [probeWith({ transport: "streamable-http", tools: [called("check_booking_availability")] })],
    });
    const browse = detectSiteEvidence(snapshot, COLLECTED_AT).evidence.filter(
      (item) => item.actionId === "site.browse" && item.audience === "agent",
    );

    expect(browse.some((item) => item.verification === "invoked")).toBe(true);
    expect(browse.some((item) => item.verification === "failed")).toBe(false);
  });
});

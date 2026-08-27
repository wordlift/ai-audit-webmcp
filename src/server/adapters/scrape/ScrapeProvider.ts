export interface SiteForm {
  name: string;
  method: string;
  action: string;
  inputNames: string[];
  hasDateInput: boolean;
  hasSearchInput: boolean;
}

export interface DiscoveryDocument {
  kind:
    | "robots"
    | "llms"
    | "skill"
    | "mcp"
    | "openapi"
    | "agent-skills"
    | "ucp"
    | "webmcp-tools"
    | "mcp-server-card"
    | "agent-card"
    | "api-catalog";
  url: string;
  /**
   * `valid` means the document exists and parses as the format it claims. Many sites answer every
   * unknown path with their HTML shell, so a 200 alone is not evidence of an agent interface.
   */
  status: "missing" | "valid" | "invalid";
  found: boolean;
  /** Tool or operation names declared by the document, when it lists any. */
  declaredNames: string[];
}

export interface AgentToolParameter {
  name: string;
  description: string;
}

/**
 * A WebMCP tool the page itself offers. WebMCP has no discovery document: tools are declared on
 * elements with `toolname`/`tooldescription`, or registered at runtime through
 * `navigator.modelContext.registerTool`. Probing `/.well-known/` for them can only ever miss.
 */
export interface PageAgentTool {
  name: string;
  description: string;
  /** `declarative` = HTML tool attributes; `imperative` = a registerTool call in page script. */
  origin: "declarative" | "imperative";
  /** The document or script the declaration was read from. */
  sourceUrl: string;
  parameters: AgentToolParameter[];
}

/**
 * The result of talking to an MCP endpoint the page links to. `initialized` means the handshake
 * completed, which is a real round trip; `tools` are the names the server listed, which is a
 * declaration — listing a tool is not the same as calling it.
 */
export interface McpEndpointProbe {
  url: string;
  transport: "sse" | "streamable-http";
  sessionOpened: boolean;
  initialized: boolean;
  serverName: string;
  protocolVersion: string;
  tools: string[];
  error?: string;
}

/**
 * The bounded, sanitized view of a public page that the rest of the pipeline is allowed to see.
 * Raw HTML never leaves the collector.
 */
export interface SiteSnapshot {
  requestedUrl: string;
  canonicalUrl: string;
  title: string;
  description: string;
  /** Readable text for classification only; never stored in a report. */
  text: string;
  headings: string[];
  linkPaths: string[];
  linkLabels: string[];
  forms: SiteForm[];
  jsonLdTypes: string[];
  discovery: DiscoveryDocument[];
  /** WebMCP tools the page declares on elements or registers in script. */
  pageTools: PageAgentTool[];
  /** MCP endpoints linked from the page or declared on its server card, and what they answered. */
  mcpEndpoints: McpEndpointProbe[];
  /**
   * True when the site answers unknown paths with its HTML page and a 200. On such a site the
   * absence of a document proves nothing, so a probe that comes back as HTML is not a broken
   * declaration — the soft 404 itself is the finding.
   */
  softNotFound: boolean;
  truncated: boolean;
}

export interface ScrapeProvider {
  readonly name: string;
  collect(url: URL): Promise<SiteSnapshot>;
}

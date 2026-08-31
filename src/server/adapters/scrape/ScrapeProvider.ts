export interface SiteForm {
  name: string;
  method: string;
  action: string;
  inputNames: string[];
  hasDateInput: boolean;
  hasSearchInput: boolean;
}

export interface ExtractedOffer {
  id?: string;
  name?: string;
  price?: string | number;
  priceCurrency?: string;
  availability?: string;
  url?: string;
}

/** A domain entity extracted from JSON-LD, with page provenance retained. */
export interface ExtractedEntity {
  id: string;
  types: string[];
  name: string;
  alternateNames: string[];
  description?: string;
  sourceUrl: string;
  sameAs: string[];
  offers: ExtractedOffer[];
}

export interface SitePageSnapshot {
  url: string;
  title: string;
  description: string;
  role: "entry" | "detail" | "offer" | "policy" | "contact" | "other";
  text: string;
  headings: string[];
  linkPaths: string[];
  linkLabels: string[];
  forms: SiteForm[];
  jsonLdTypes: string[];
  entities: ExtractedEntity[];
  pageTools: PageAgentTool[];
  truncated: boolean;
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
 * One tool a live MCP server listed, and what happened when the audit tried it. A tool is only
 * called when the server annotates it read-only and non-destructive, its name carries no
 * transactional verb, and every required argument could be filled without inventing an identifier.
 */
export interface McpToolProbe {
  name: string;
  /** False when the tool was listed but deliberately not called. */
  called: boolean;
  /** True only when a call returned a non-error result. */
  ok: boolean;
  /** The arguments actually sent, kept so a reader can judge the invocation. */
  arguments?: string;
  /** Why the tool was skipped, or how the call failed. */
  note?: string;
}

/**
 * The site's declared schema.org SearchAction template, executed once. `confirmed` means the
 * results page acknowledged the query; a blind 200 confirms nothing and accuses nothing.
 */
export interface SearchActionProbe {
  template: string;
  url: string;
  query: string;
  status: number;
  confirmed: boolean;
  note?: string;
}

/**
 * The result of talking to an MCP endpoint the page links to. `initialized` means the handshake
 * completed, which is a real round trip; a listed tool is a declaration until it is called.
 */
export interface McpEndpointProbe {
  url: string;
  transport: "sse" | "streamable-http";
  sessionOpened: boolean;
  initialized: boolean;
  serverName: string;
  protocolVersion: string;
  tools: McpToolProbe[];
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
  /** Up to four representative pages, selected by role rather than link order. */
  pages: SitePageSnapshot[];
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
  /** The declared SearchAction template and what happened when an agent executed it. */
  searchAction?: SearchActionProbe;
  /** A WordLift fingerprint the entry page itself carries (plugin path, SDK host, dataset URI). */
  wordlift?: { marker: string; sourceUrl: string };
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

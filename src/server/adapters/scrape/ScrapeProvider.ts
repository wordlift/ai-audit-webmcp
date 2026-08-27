export interface SiteForm {
  name: string;
  method: string;
  action: string;
  inputNames: string[];
  hasDateInput: boolean;
  hasSearchInput: boolean;
}

export interface DiscoveryDocument {
  kind: "robots" | "llms" | "skill" | "mcp" | "webmcp-tools" | "openapi" | "agent-skills";
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
  truncated: boolean;
}

export interface ScrapeProvider {
  readonly name: string;
  collect(url: URL): Promise<SiteSnapshot>;
}

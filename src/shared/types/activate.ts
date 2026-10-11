import type { ActionBoundary, CapabilityResult } from "./index.js";

/**
 * Activate, as the client reads it: what a report publishes, and how the site's readiness has read
 * over time. The compiler lives in `src/domain/publish`; these are the shapes it hands over.
 */
export type PublishedAs = "action" | "handoff" | "entity" | "nothing";
export type EntryProtocol = "http" | "mcp" | "webmcp" | "sidecar";

export interface PublishedEntryPoint {
  url: string;
  urlTemplate?: string;
  protocol: EntryProtocol;
  httpMethod: "GET" | "POST";
  via: "site" | "sidecar";
  /** The tool an MCP server exposes for this action, when the audit called one by name. */
  tool?: string;
}

export interface PublishedAction {
  actionId: string;
  label: string;
  state: CapabilityResult["state"];
  boundary: ActionBoundary | null;
  publishedAs: PublishedAs;
  /** Why, in a sentence the Activate screen shows. */
  because: string;
  entryPoint?: PublishedEntryPoint;
  /** Other interfaces the audit's agent also called for this action, beside the one above. */
  alsoVerified?: PublishedEntryPoint[];
  /** The page on the site where a person does this, when the audit observed one. Never an entry point. */
  humanUrl?: string;
  provider?: { name: string; url?: string };
}

export interface Publication {
  site: string;
  host: string;
  reportId: string;
  reportUrl: string;
  publishedAt: string;
  /** How many human decisions the report carries; zero publishes what the audit verified, no less. */
  decided: number;
  actions: PublishedAction[];
  documents: { pageJsonLd: string; skill: string; catalog: string; llms: string; runbook: string; siteCatalog: string };
  /** Where a site serves the catalog: the one spelling this service writes. */
  catalogPath: string;
  jsonLd: Record<string, unknown>;
  skill: string;
  catalog: { entries: unknown[]; [key: string]: unknown };
  /** llms.txt: the model as the markdown index language models read at a site's root. */
  llms: string;
  /** What an agent does to put the documents on the site, step by step, and how it proves they are there. */
  runbook: string;
  /** Where each document lives once it is on the site. */
  sitePaths: { catalog: string; skill: string; llms: string };
}

/** One readiness reading of a site: a report with a score, and what kind of report it was. */
export interface ScoreReading {
  reportId: string;
  createdAt: string;
  score: number;
  kind: "audit" | "refinement" | "reused";
}

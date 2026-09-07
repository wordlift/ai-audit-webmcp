import type { ExtractedEntity } from "../scrape/ScrapeProvider.js";

/**
 * The markup a page should have, inferred from what the page says. This is Fix's first input: a
 * second source of entities beside the ones a page declares, labelled as inferred, never moving
 * readiness. The provider behind it is a stand-in today — Gemini 2.5 Flash through the Gemini
 * API — and WordLift's own model replaces it behind this interface without touching the audit.
 */
export interface MarkupPageInput {
  url: string;
  title: string;
  description: string;
  headings: string[];
  /** The page's readable text, already bounded by the collector. Raw HTML never reaches here. */
  text: string;
}

export interface MarkupUsage {
  inputTokens: number;
  outputTokens: number;
  /** What the call cost at the provider's list price, for the estimate the team is waiting on. */
  estimatedUsd: number;
}

export interface MarkupOutcome {
  entities: ExtractedEntity[];
  /** What the validator objected to and dropped: the base a SHACL pass slots into later. */
  issues: string[];
  usage: MarkupUsage;
  model: string;
}

export interface MarkupTotals {
  pages: number;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export interface MarkupProvider {
  readonly name: string;
  readonly model: string;
  generate(page: MarkupPageInput): Promise<MarkupOutcome>;
  /** Running totals since the process started, for /api/health and the cost estimate. */
  totals(): MarkupTotals;
}

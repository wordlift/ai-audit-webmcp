import type { CapabilityResult, ClassificationResult } from "../types/index.js";

/**
 * Turns the stored classification and a compiled action into plain-language reasoning. The report
 * UI and the WebMCP tools both read from here, so a person in the report and an agent in a chat
 * hear the same explanation of why an action belongs on this site's map.
 */

const STAGE_LABELS: Record<CapabilityResult["stage"], string> = {
  discover: "discover",
  "understand-decide": "understand & decide",
  act: "act",
  manage: "manage",
};

/** Structured-data types that say a website exists, not what it means. */
const GENERIC_SCHEMA_SIGNALS = new Set([
  "ImageObject",
  "WebSite",
  "Organization",
  "BreadcrumbList",
  "DataCatalog",
  "SearchAction",
]);

const SIGNAL_PHRASES: Array<{ pattern: RegExp; phrase: (value: string) => string }> = [
  { pattern: /^path:booking$/, phrase: () => "a booking flow" },
  { pattern: /^path:cart$/, phrase: () => "a cart" },
  { pattern: /^path:checkout$/, phrase: () => "a checkout flow" },
  { pattern: /^path:pricing$/, phrase: () => "a pricing page" },
  { pattern: /^path:quote$/, phrase: () => "a quote request page" },
  { pattern: /^schema:(.+)$/, phrase: (value) => `${value} structured data` },
  { pattern: /^agent:webmcp$/, phrase: () => "WebMCP tools registered in the page" },
  { pattern: /^agent:mcp-endpoint$/, phrase: () => "a live MCP endpoint" },
  { pattern: /^agent:llms-txt$/, phrase: () => "a published llms.txt" },
  { pattern: /^agent:ucp$/, phrase: () => "a UCP declaration" },
  { pattern: /^agent:openapi$/, phrase: () => "an OpenAPI document" },
  { pattern: /^agent:agent-card$/, phrase: () => "an agent card" },
  { pattern: /^agent:agent-skills$/, phrase: () => "an agent-skills index" },
  { pattern: /^agent:mcp-server-card$/, phrase: () => "an MCP server card" },
  { pattern: /^agent:mcp-json$/, phrase: () => "an MCP discovery document" },
  { pattern: /^agent:api-catalog$/, phrase: () => "an API catalogue" },
  { pattern: /^agent:skill-md$/, phrase: () => "a published skill.md" },
  { pattern: /^agent:well-known-tools-json$/, phrase: () => "a well-known WebMCP tools document" },
];

/** Signals worth showing a reader at all: variants and framework noise stay out of chip lists. */
export function presentableSignals(signals: string[]): string[] {
  return signals.filter((signal) => !/^agent:webmcp-|^framework:/.test(signal));
}

/** One behavior signal in words a non-technical reader can use. */
export function describeSignal(signal: string): string {
  for (const { pattern, phrase } of SIGNAL_PHRASES) {
    const match = pattern.exec(signal);
    if (match) return phrase(match[1] ?? "");
  }
  return signal;
}

/** The signals worth citing: concrete behavior first, boilerplate and duplicates dropped. */
function groundingSignals(signals: string[]): string[] {
  const meaningful = signals.filter((signal) => {
    if (signal.startsWith("framework:")) return false;
    if (/^agent:webmcp-/.test(signal)) return false;
    const schema = /^schema:(.+)$/.exec(signal);
    return !(schema && GENERIC_SCHEMA_SIGNALS.has(schema[1]));
  });
  const rank = (signal: string) => (signal.startsWith("path:") ? 0 : signal.startsWith("schema:") ? 1 : 2);
  return [...meaningful].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right)).slice(0, 3);
}

/** How the site was read: the content and behavior that grounded the archetype. */
export function explainClassification(classification: ClassificationResult | undefined): string | null {
  if (!classification) return null;
  const archetype = classification.primaryArchetype.replaceAll("-", " / ");
  const categories = classification.categories
    .slice(0, 2)
    .map((category) => `${category.name}, ${Math.round(category.confidence * 100)}%`);
  const signals = groundingSignals(classification.signals ?? []).map(describeSignal);
  if (categories.length === 0 && signals.length === 0) return null;

  const content = categories.length > 0 ? `its content (${categories.join("; ")})` : null;
  const behavior = signals.length > 0 ? `its behavior (${signals.join(", ")})` : null;
  return `The site reads as ${archetype} from ${[content, behavior].filter(Boolean).join(" and ")}.`;
}

export interface ExpectationExplanation {
  /** Why the action belongs on this site's map. */
  headline: string;
  /** How the site was read, when the archetype was inferred rather than chosen. */
  grounding: string | null;
  /** A provisional classification changes how much to trust the map. */
  caveat: string | null;
}

export function explainExpectation(
  classification: ClassificationResult | undefined,
  capability: CapabilityResult,
): ExpectationExplanation {
  const override = capability.expectationSource.find((source) => source.startsWith("override:"))?.slice(9);
  const inferred = capability.expectationSource.find((source) => source.startsWith("archetype:"))?.slice(10);
  const archetype = (override ?? inferred ?? classification?.primaryArchetype ?? "other").replaceAll("-", " / ");
  const stage = STAGE_LABELS[capability.stage];

  if (!capability.expected) {
    return { headline: `Not part of the expected map for a ${archetype} site.`, grounding: null, caveat: null };
  }

  return {
    headline: override
      ? `Expected because the site type was set to ${archetype} by hand; every ${archetype} site is expected to support this at the ${stage} stage.`
      : `Every ${archetype} site is expected to support this at the ${stage} stage of the journey.`,
    grounding: override ? null : explainClassification(classification),
    caveat: classification?.provisional
      ? classification.provisionalReason ?? "The classification is provisional; confirm the site type before acting on the map."
      : null,
  };
}

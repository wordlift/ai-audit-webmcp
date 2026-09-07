import { entityJsonLd } from "../../shared/format/entityJsonLd.js";
import type { CapabilityResult, DomainEntity } from "../../shared/types/index.js";

/**
 * Fix, the parts the Understand panel and the pitch share: which actions have no interface, one
 * entity as the JSON-LD its page should carry, and where the dashboard picks the report up. The
 * full set of markup is generated on the account side, where it is also kept in sync.
 */
const DASHBOARD_URL = "https://my.wordlift.io/";

/** Actions the site expects that no agent can reach: nothing declared, or people only. */
export function actionsWithoutInterface(capabilities: CapabilityResult[]): CapabilityResult[] {
  return capabilities.filter((capability) => capability.expected && (capability.state === "human-only" || capability.state === "missing"));
}

/** One inferred entity as the JSON-LD its page should carry, with the context Activate's page carries too. */
export function sampleJsonLd(entity: DomainEntity): Record<string, unknown> {
  return { "@context": "https://schema.org", ...entityJsonLd(entity) };
}

/** Where the dashboard picks the report up: the id travels, nothing else. */
export function publishUrl(reportId: string): string {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set("source", "ai-audit");
  url.searchParams.set("report", reportId);
  return url.toString();
}

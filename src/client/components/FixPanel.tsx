import { entityJsonLd } from "../../shared/format/entityJsonLd.js";
import type { CapabilityResult, DomainEntity } from "../../shared/types/index.js";

/**
 * Fix, the parts the screens share: which actions have no interface, one entity as the JSON-LD
 * its page should carry, and where each door leads. Fixing and activating go to the WordLift
 * dashboard, which routes them between product and project; talking to us goes to the team.
 * The report id travels with every door, and the action and the intent when there is one.
 */
const DASHBOARD_URL = "https://my.wordlift.io/";
const TALK_TO_US_URL = "https://wordlift.io/book%20a%20demo/";

/**
 * Why someone arrives at the dashboard: to claim the Context Engine, build it into the live graph,
 * monitor it, activate it, make one action agent-ready, keep one that works, or fix what is missing.
 */
export type FixIntent = "fix" | "claim-context" | "build-context" | "monitor" | "activate" | "agent-ready" | "keep";

/** Actions the site expects that no agent can reach: nothing declared, or people only. */
export function actionsWithoutInterface(capabilities: CapabilityResult[]): CapabilityResult[] {
  return capabilities.filter((capability) => capability.expected && (capability.state === "human-only" || capability.state === "missing"));
}

/** One inferred entity as the JSON-LD its page should carry, with the context Activate's page carries too. */
export function sampleJsonLd(entity: DomainEntity): Record<string, unknown> {
  return { "@context": "https://schema.org", ...entityJsonLd(entity) };
}

/**
 * Where the dashboard picks the report up: the report id travels, the site's Context Engine when it
 * has one, and the action and intent when there are, so the dashboard knows why someone arrived.
 */
export function publishUrl(reportId: string, options: { action?: string; intent?: FixIntent; engine?: string | null } = {}): string {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set("source", "ai-audit");
  url.searchParams.set("report", reportId);
  if (options.engine) url.searchParams.set("engine", options.engine);
  if (options.action) url.searchParams.set("action", options.action);
  if (options.intent) url.searchParams.set("intent", options.intent);
  return url.toString();
}

/** Where a gap the product cannot close by itself goes: the team, with the report and the action named. */
export function talkToUsUrl(reportId: string, action?: string): string {
  const url = new URL(TALK_TO_US_URL);
  url.searchParams.set("source", "ai-audit");
  url.searchParams.set("report", reportId);
  if (action) url.searchParams.set("action", action);
  return url.toString();
}

import { businessModel } from "../../shared/format/businessModel.js";
import type { ContextEngine } from "../../shared/schemas/contextEngine.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { decisionCount } from "./contextEngine.js";

/**
 * What a sales team needs to know about a lead, as counts and states: the shape of the business
 * and the size of each opportunity, never the business's own content. Everything here is derived
 * from a report and its engine, and nothing names a person.
 */
export const LEAD_SIGNAL_NAMES = [
  "archetype",
  "runs_on_wordlift",
  "entities",
  "declared",
  "inferred",
  "confirmed",
  "relationships",
  "expected_actions",
  "agent_ready",
  "top_gaps",
  "engine_status",
  "reviewed",
  "claimed",
  "owner_verified",
  "intents",
] as const;

export type LeadSignalName = (typeof LEAD_SIGNAL_NAMES)[number];
export type LeadSignals = Record<LeadSignalName, string>;

const GAP_ORDER: Record<string, number> = { missing: 0, "human-only": 1, unverified: 2 };

export function leadSignals(report: ReportRecord, engine: ContextEngine | null): LeadSignals {
  const model = businessModel(report, "");
  const expected = (report.capabilities ?? []).filter((capability) => capability.expected && capability.state !== "not-expected");
  const gaps = expected
    .filter((capability) => capability.state in GAP_ORDER)
    .sort((left, right) => right.importance - left.importance || GAP_ORDER[left.state]! - GAP_ORDER[right.state]!)
    .slice(0, 3)
    .map((capability) => capability.actionId);
  return {
    archetype: report.classification?.primaryArchetype ?? "other",
    runs_on_wordlift: report.publishedWith ? "yes" : "no",
    entities: String(model.counts.entities),
    declared: String(model.counts.declared),
    inferred: String(model.counts.inferred),
    confirmed: String(model.counts.humanConfirmed),
    relationships: String(model.relationships.length),
    expected_actions: String(expected.length),
    agent_ready: String(expected.filter((capability) => capability.state === "agent-ready").length),
    top_gaps: gaps.join(";"),
    engine_status: engine?.status ?? "none",
    reviewed: engine && decisionCount(engine.decisions) > 0 ? "yes" : report.refinement ? "yes" : "no",
    claimed: engine?.claim ? "yes" : "no",
    owner_verified: engine?.owner.state === "verified" ? "yes" : "no",
    intents: [...new Set((engine?.intents ?? []).map((entry) => entry.intent))].join(";"),
  };
}

/** The same signals as lines a person reads at the end of the summary. */
export function leadSignalsText(signals: LeadSignals): string {
  return ["Signals:", ...LEAD_SIGNAL_NAMES.map((name) => `${name}: ${signals[name] || "-"}`)].join("\n");
}

/** `archetype=wl_archetype,claimed=wl_claimed`: which signals a HubSpot form has properties for. Unknown names are dropped. */
export function parseSignalFields(value: string | undefined): Partial<Record<LeadSignalName, string>> {
  const fields: Partial<Record<LeadSignalName, string>> = {};
  for (const pair of (value ?? "").split(",")) {
    const [name, property] = pair.split("=").map((part) => part?.trim());
    if (name && property && (LEAD_SIGNAL_NAMES as readonly string[]).includes(name) && /^[a-z0-9_]{1,80}$/i.test(property)) {
      fields[name as LeadSignalName] = property;
    }
  }
  return fields;
}

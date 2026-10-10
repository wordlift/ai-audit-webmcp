import { entityProvenance, type EntityProvenance } from "../../shared/format/businessModel.js";
import { modelView, type ViewEntity } from "../../shared/format/modelView.js";
import type { ActionBoundary, CapabilityResult, DomainEntity, HumanAssertion, ReportRecord } from "../../shared/types/index.js";

/**
 * What the Audit, Fix and Activate screens say, derived from the report and nothing else. Every
 * label here maps onto exactly one fact the report already holds: a site-declared entity, an
 * inferred one, a human review, a linked identity and a verified callable action stay different
 * words. Nothing in this file scores, ranks or decides; it reads what was returned.
 */

export function hostOf(report: Pick<ReportRecord, "canonicalUrl" | "requestedUrl">): string {
  const url = report.canonicalUrl ?? report.requestedUrl;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------- Capability status ----------

/** What an agent can do with one action, in the words the table uses. One word per report state. */
export type AgentStatus = "verified" | "unverified" | "no-interface" | "not-found" | "not-expected" | "not-checked" | "checking";

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  verified: "Verified",
  unverified: "Unverified",
  "no-interface": "No interface found",
  "not-found": "Not found",
  "not-expected": "Not expected",
  "not-checked": "Not checked",
  checking: "Checking",
};

/** Unknown stays unknown: a capability that was never returned is not checked, never missing. */
export function agentStatus(capability: Pick<CapabilityResult, "state"> | null | undefined, loading = false): AgentStatus {
  if (!capability) return loading ? "checking" : "not-checked";
  switch (capability.state) {
    case "agent-ready":
      return "verified";
    case "unverified":
      return "unverified";
    case "human-only":
      return "no-interface";
    case "missing":
      return "not-found";
    default:
      return "not-expected";
  }
}

/** What was seen for people. Read from the human-interface observation, never from the agent status. */
export type PeopleStatus = "observed" | "not-observed" | "not-checked";

export const PEOPLE_STATUS_LABEL: Record<PeopleStatus, string> = {
  observed: "Observed",
  "not-observed": "Not observed",
  "not-checked": "Not checked",
};

export function peopleStatus(capability: Pick<CapabilityResult, "humanSupport"> | null | undefined): PeopleStatus {
  if (!capability || typeof capability.humanSupport !== "boolean") return "not-checked";
  return capability.humanSupport ? "observed" : "not-observed";
}

export const STAGES = [
  { id: "discover", label: "Discover", hint: "Find the right thing" },
  { id: "understand-decide", label: "Understand & decide", hint: "Evaluate with evidence" },
  { id: "act", label: "Act", hint: "Move intent forward" },
  { id: "manage", label: "Manage", hint: "Track or change state" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

const reviewed = (capability: CapabilityResult) => capability.boundarySource === "human-provided" && Boolean(capability.boundary);

/**
 * The actions the table lists: everything this kind of site is expected to offer, in the order the
 * capability model returned them, and anything a person already decided about, so a decision never
 * disappears from the place it was made.
 */
export function listedCapabilities(report: ReportRecord): CapabilityResult[] {
  return (report.capabilities ?? []).filter((capability) => capability.expected || reviewed(capability));
}

/** Seen on the site beyond what this kind of site is expected to offer; reachable, never hidden. */
export function otherDetected(report: ReportRecord): CapabilityResult[] {
  return (report.capabilities ?? []).filter(
    (capability) => !capability.expected && !reviewed(capability) && (capability.humanSupport || capability.agentSupport || capability.evidence.length > 0),
  );
}

export function verifiedCount(capabilities: CapabilityResult[]): number {
  return capabilities.filter((capability) => capability.state === "agent-ready").length;
}

export type CapabilityFilter = "all" | "verified" | "unverified" | "no-interface" | "not-found" | "undecided";

export const FILTER_LABEL: Record<CapabilityFilter, string> = {
  all: "All actions",
  undecided: "Needs a decision",
  verified: "Verified",
  unverified: "Unverified",
  "no-interface": "No interface found",
  "not-found": "Not found",
};

export function matchesFilter(capability: CapabilityResult, filter: CapabilityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "undecided") return !reviewed(capability);
  return agentStatus(capability) === filter;
}

export function isFilter(value: string | null): value is CapabilityFilter {
  return value !== null && value in FILTER_LABEL;
}

/** Why one action stands where it does, in a sentence scoped to this scan. */
export function whatWeKnow(capability: CapabilityResult): string {
  const label = capability.label.charAt(0).toLowerCase() + capability.label.slice(1);
  const people = capability.humanSupport ? `People can ${label} on the pages checked.` : `No way for people to ${label} was observed on the pages checked.`;
  switch (capability.state) {
    case "agent-ready":
      return `${people} An agent called the interface and it answered${capability.via === "sidecar" ? ", through the interface WordLift runs" : ""}.`;
    case "unverified": {
      const failed = capability.evidence.find((item) => item.audience === "agent" && item.verification === "failed");
      const declared = capability.evidence.find((item) => item.audience === "agent" && item.verification === "declared");
      if (failed) return `${people} The site declares an interface for agents, and the audit's call to it did not succeed: ${failed.claim.replace(/\.?$/, ".")}`;
      if (declared) return `${people} The site declares something agents could use (${declared.claim.replace(/\.?$/, "")}), and no call to it was completed in this scan, so it is not verified.`;
      return `${people} Something agents could use is declared, and no call to it was completed in this scan, so it is not verified.`;
    }
    case "human-only":
      return `${people} No agent-accessible interface was found in this scan.`;
    case "missing":
      return `Not found in this scan: neither a way for people nor an interface for agents was observed on the pages checked. That does not mean the business has no such service.`;
    default:
      return `${people} This kind of site is not expected to offer it.`;
  }
}

// ---------- Responsibility ----------

export type OwnershipChoice = "team" | "partner" | "information" | "not-relevant";

export const OWNERSHIP_CHOICES: ReadonlyArray<{
  id: OwnershipChoice;
  label: string;
  means: string;
  decision: "confirm" | "reject";
  boundary: ActionBoundary;
}> = [
  { id: "team", label: "Our team", means: "We receive and handle this directly.", decision: "confirm", boundary: "owned" },
  { id: "partner", label: "A partner", means: "We pass this to another organization.", decision: "confirm", boundary: "partner-handoff" },
  { id: "information", label: "Information only", means: "We describe the process; we do not carry it out for an agent.", decision: "confirm", boundary: "informational-only" },
  { id: "not-relevant", label: "Not relevant", means: "This action does not apply to our business.", decision: "reject", boundary: "not-applicable" },
];

export const RESPONSIBILITY_LABEL: Record<ActionBoundary, string> = {
  owned: "Our team",
  "partner-handoff": "A partner",
  "informational-only": "Information only",
  "not-applicable": "Not relevant",
};

/** The saved responsibility, only when a person decided it. An unknown action has none. */
export function savedChoice(capability: CapabilityResult): OwnershipChoice | null {
  if (!reviewed(capability)) return null;
  return OWNERSHIP_CHOICES.find((choice) => choice.boundary === capability.boundary)?.id ?? null;
}

export interface OwnershipDraft {
  choice: OwnershipChoice | null;
  partnerName: string;
  partnerUrl: string;
  note: string;
}

export function initialOwnershipDraft(capability: CapabilityResult): OwnershipDraft {
  const choice = savedChoice(capability);
  return {
    choice,
    partnerName: choice === "partner" ? capability.boundaryPartner?.name ?? "" : "",
    partnerUrl: choice === "partner" ? capability.boundaryPartner?.url ?? "" : "",
    note: choice ? capability.boundaryRationale ?? "" : "",
  };
}

/** A partner's site the way a person types it; null when it cannot be a web address. */
export function normalizedPartnerUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** What stops a save, in the person's words; null when the form can be sent. */
export function ownershipProblem(draft: OwnershipDraft): string | null {
  if (!draft.choice) return "Choose who handles this action.";
  if (draft.choice === "partner") {
    if (!draft.partnerName.trim()) return "Name the partner that handles this action.";
    if (draft.partnerUrl.trim() && !normalizedPartnerUrl(draft.partnerUrl)) return "That partner website is not a web address. Leave it empty or correct it.";
  }
  return null;
}

/** One actionDecisions entry from the person's current choice: the existing contract, nothing added. */
export function ownershipDecision(actionId: string, draft: OwnershipDraft): NonNullable<HumanAssertion["actionDecisions"]>[number] | null {
  const choice = OWNERSHIP_CHOICES.find((entry) => entry.id === draft.choice);
  if (!choice || ownershipProblem(draft)) return null;
  const rationale = draft.note.trim().slice(0, 500);
  const url = normalizedPartnerUrl(draft.partnerUrl);
  return {
    actionId,
    decision: choice.decision,
    boundary: choice.boundary,
    ...(rationale ? { rationale } : {}),
    ...(choice.id === "partner" ? { partner: { name: draft.partnerName.trim().slice(0, 120), ...(url ? { url } : {}) } } : {}),
  };
}

/** The line agents will read about who handles an action. It states responsibility and nothing about whether it works. */
export function agentsWillRead(label: string, draft: Pick<OwnershipDraft, "choice" | "partnerName">, host: string): string | null {
  const action = `“${label}”`;
  switch (draft.choice) {
    case "team":
      return `${host} handles ${action} itself.`;
    case "partner":
      return draft.partnerName.trim() ? `${host} hands ${action} to ${draft.partnerName.trim()}.` : `${host} hands ${action} to a partner.`;
    case "information":
      return `${host} describes ${action}; it does not carry it out for an agent.`;
    case "not-relevant":
      return `${action} does not apply to ${host}.`;
    default:
      return null;
  }
}

export function sameOwnershipDraft(left: OwnershipDraft, right: OwnershipDraft): boolean {
  return left.choice === right.choice && left.partnerName.trim() === right.partnerName.trim() && left.partnerUrl.trim() === right.partnerUrl.trim() && left.note.trim() === right.note.trim();
}

// ---------- WordLift detection ----------

export type Detection =
  | { state: "detected"; evidence: string; sourceUrl: string; publishedIds: string[] }
  | { state: "not-detected" }
  | { state: "unavailable" };

export const DETECTION_LABEL: Record<Detection["state"], string> = {
  detected: "WordLift detected",
  "not-detected": "Not detected in this scan",
  unavailable: "Detection unavailable",
};

/**
 * Whether the site's own pages name WordLift as their publishing platform. Detected is the report's
 * finding; not detected is a scan that read the pages and found none; with no pages read there is
 * nothing to say either way. None of this is an account connection or proof of ownership.
 */
export function detection(report: ReportRecord): Detection {
  if (report.publishedWith) {
    const publishedIds = (report.contextGraph?.entities ?? []).map((entity) => entity.id).filter((id) => /^https?:\/\/data\.wordlift\.io\//.test(id)).slice(0, 5);
    return { state: "detected", evidence: report.publishedWith.evidence, sourceUrl: report.publishedWith.sourceUrl, publishedIds };
  }
  return (report.contextGraph?.pages.length ?? 0) > 0 ? { state: "not-detected" } : { state: "unavailable" };
}

// ---------- Entities ----------

export const PROVENANCE_LABEL: Record<EntityProvenance, string> = {
  declared: "Declared",
  inferred: "Inferred",
  "human-confirmed": "Confirmed",
};

export const PROVENANCE_LONG: Record<EntityProvenance, string> = {
  declared: "Declared by the site",
  inferred: "Inferred from text",
  "human-confirmed": "Confirmed in a review",
};

/** "SoftwareApplication" → "Software application": the returned type in words a person reads. */
export function typeWords(type: string | undefined): string {
  if (!type) return "Thing";
  const words = type.replace(/^https?:\/\/schema\.org\//, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

const WIKIDATA = /^https?:\/\/(?:www\.)?wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i;

/** The Wikidata identity an entity was returned with. Never guessed from a name. */
export function wikidataOf(entity: Pick<DomainEntity, "sameAs">): { url: string; qid: string } | null {
  for (const url of entity.sameAs) {
    const match = WIKIDATA.exec(url);
    if (match) return { url, qid: match[1]!.toUpperCase() };
  }
  return null;
}

function pageLabel(report: ReportRecord, url: string): string {
  const page = report.contextGraph?.pages.find((candidate) => candidate.url === url);
  if (page?.role === "entry") return "the home page";
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/" || parsed.pathname === "") return "the home page";
    // The page's own name for itself, before the site's suffix: "Pricing - AI-Powered SEO • WordLift".
    const own = page?.title.split(/\s+[-–—|•·]\s+/)[0]?.trim();
    if (own && own.length <= 48) return own;
    return decodeURIComponent(parsed.pathname).replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** "Seen on 5 pages", "Seen on the home page", "Seen on Pricing": where an entity was read. */
export function seenOn(entity: Pick<DomainEntity, "sourceUrls">, report: ReportRecord): string {
  if (entity.sourceUrls.length > 1) return `Seen on ${entity.sourceUrls.length} pages`;
  const first = entity.sourceUrls[0];
  return first ? `Seen on ${pageLabel(report, first)}` : "Source not returned";
}

export function sourceLinks(entity: Pick<DomainEntity, "sourceUrls">, report: ReportRecord): Array<{ url: string; label: string }> {
  return entity.sourceUrls.map((url) => {
    const label = pageLabel(report, url);
    return { url, label: label === "the home page" ? "Home page" : label };
  });
}

export interface EntityCounts {
  /** Every entity the report holds, whatever its priority. */
  total: number;
  declared: number;
  inferred: number;
  /** Marked core in a review. */
  core: number;
  /** Marked peripheral in a review; still found on the site. */
  peripheral: number;
}

export function entityCounts(report: ReportRecord): EntityCounts {
  const entities = report.contextGraph?.entities ?? [];
  return {
    total: entities.length,
    declared: entities.filter((entity) => entity.origin !== "inferred").length,
    inferred: entities.filter((entity) => entity.origin === "inferred").length,
    core: entities.filter((entity) => entity.humanPriority === "primary").length,
    peripheral: entities.filter((entity) => entity.humanPriority === "demoted").length,
  };
}

export type IdentityState =
  | { state: "resolved"; entity: ViewEntity }
  | { state: "needs-review"; entity: ViewEntity | null; why: string }
  | { state: "empty" };

/**
 * Whether the report settled who the business is. A business the site declares, or one a review
 * marked core, is settled. One the text alone suggested is a candidate, and a model with no
 * business at all has none: both need a review, and neither is shown as a confident headline.
 */
export function identity(report: ReportRecord): IdentityState {
  const entities = report.contextGraph?.entities ?? [];
  if (entities.length === 0) return { state: "empty" };
  const business = modelView(report).business;
  if (!business) return { state: "needs-review", entity: null, why: "The scan found no organization it could name as the business behind these pages." };
  if (business.provenance !== "inferred") return { state: "resolved", entity: business };
  return { state: "needs-review", entity: business, why: `The scan selected ${business.name} from your page content.` };
}

export interface CoreEntity {
  view: ViewEntity;
  entity: DomainEntity;
  wikidata: { url: string; qid: string } | null;
  seen: string;
}

function toCore(view: ViewEntity, report: ReportRecord): CoreEntity | null {
  const entity = report.contextGraph?.entities.find((candidate) => candidate.id === view.id);
  if (!entity) return null;
  return { view: { ...view, provenance: entityProvenance(entity) }, entity, wikidata: wikidataOf(entity), seen: seenOn(entity, report) };
}

/**
 * The compact set the doorway shows, from the model's own order: the business when the report
 * settled it, then what it offers and where. A business that still needs review is left to the
 * review line beside the set; nothing is ranked again here.
 */
export function coreEntities(report: ReportRecord, max = 4): CoreEntity[] {
  const view = modelView(report);
  const who = identity(report);
  const unsettled = who.state === "needs-review" ? who.entity?.id : undefined;
  const ordered = [...view.preview, ...view.offerings, ...view.places];
  const seen = new Set<string>();
  const out: CoreEntity[] = [];
  for (const candidate of ordered) {
    if (candidate.id === unsettled || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const core = toCore(candidate, report);
    if (core) out.push(core);
    if (out.length >= max) break;
  }
  return out;
}

/** The entities the review opens on: the doorway's set, the business candidate, and every entity a review already placed. */
export function focusEntities(report: ReportRecord): DomainEntity[] {
  const entities = report.contextGraph?.entities ?? [];
  // In the order the doorway reads: its set, then the business candidate, then what a review placed.
  const ids = coreEntities(report).map((core) => core.entity.id);
  const who = identity(report);
  if (who.state !== "empty" && who.entity) ids.push(who.entity.id);
  for (const entity of entities) if (entity.humanPriority) ids.push(entity.id);
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  return [...new Set(ids)].map((id) => byId.get(id)).filter((entity): entity is DomainEntity => Boolean(entity));
}

// ---------- Entity priorities ----------

export type Priority = "core" | "keep" | "peripheral";

/** The priority the report holds for an entity: what a review saved, or none. */
export function savedPriority(entity: Pick<DomainEntity, "humanPriority">): Priority {
  return entity.humanPriority === "primary" ? "core" : entity.humanPriority === "demoted" ? "peripheral" : "keep";
}

export type PriorityDraft = Record<string, "core" | "peripheral">;

/**
 * Stage one choice. Keep means the report's current priority, so it clears the local change; so does
 * choosing what is already saved. Nothing here can undo a saved decision by inventing an operation.
 */
export function stagePriority(draft: PriorityDraft, entity: Pick<DomainEntity, "id" | "humanPriority">, choice: Priority): PriorityDraft {
  const next = { ...draft };
  if (choice === "keep" || choice === savedPriority(entity)) delete next[entity.id];
  else next[entity.id] = choice;
  return next;
}

export function shownPriority(draft: PriorityDraft, entity: Pick<DomainEntity, "id" | "humanPriority">): Priority {
  return draft[entity.id] ?? savedPriority(entity);
}

/** Only what the person explicitly staged, for entities the report holds. */
export function priorityAssertions(draft: PriorityDraft, report: ReportRecord): Pick<HumanAssertion, "primaryEntityIds" | "demotedEntityIds"> {
  const known = new Set((report.contextGraph?.entities ?? []).map((entity) => entity.id));
  const ids = (choice: "core" | "peripheral") => Object.entries(draft).filter(([id, value]) => value === choice && known.has(id)).map(([id]) => id);
  const primaryEntityIds = ids("core");
  const demotedEntityIds = ids("peripheral");
  return {
    ...(primaryEntityIds.length > 0 ? { primaryEntityIds } : {}),
    ...(demotedEntityIds.length > 0 ? { demotedEntityIds } : {}),
  };
}

// ---------- After a save ----------

/** What a save hands the reviewed version it opens: what was sent, said back once. */
export interface SavedNotice {
  kind: "entities" | "ownership" | "vocabulary" | "model";
  summary: string;
  actionId?: string;
}

export const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

// ---------- Sector ----------

const SECTOR_WORDS: Record<string, { label: string; noun: string }> = {
  saas: { label: "Software / SaaS", noun: "SaaS" },
  "commerce / retail": { label: "Commerce / Retail", noun: "commerce" },
  "travel / hospitality": { label: "Travel / Hospitality", noun: "travel" },
  "publisher / content": { label: "Publisher / Content", noun: "publisher" },
  "finance / insurance": { label: "Finance / Insurance", noun: "finance" },
  general: { label: "General", noun: "" },
};

/** The current archetype in readable language. Read-only here: the sector is never edited on these screens. */
export function sector(kind: string): { label: string; noun: string } {
  const known = SECTOR_WORDS[kind];
  if (known) return known;
  const label = kind.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  return { label, noun: kind };
}

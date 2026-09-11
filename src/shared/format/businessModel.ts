import type { CapabilityResult, DomainEntity, ReportRecord } from "../types/index.js";

/**
 * The business as the audit modelled it from a few pages, for an agent that asks: what does this
 * business offer, which things matter, which are only inferred, and what can an agent do here today.
 * Every line keeps the distinction the report keeps: declared in the site's own markup, inferred
 * from its text, confirmed by the owner, or verified by calling. Nothing here is authoritative
 * enterprise data; it is the audit's first evidence-backed model, and it says so.
 */
export type EntityRole = "business" | "offering" | "place" | "person" | "content";
export type EntityProvenance = "declared" | "inferred" | "human-confirmed";

export interface ModelledAction {
  actionId: string;
  label: string;
  state: string;
  /** True only when the audit's agent invoked the interface: never from markup, never from a human's word. */
  agentReady: boolean;
}

export interface ModelledEntity {
  id: string;
  name: string;
  type: string;
  role: EntityRole;
  provenance: EntityProvenance;
  confidence: number;
  priority: "primary" | "secondary" | "demoted";
  description?: string;
  sameAs: string[];
  sources: string[];
  answersFor: ModelledAction[];
  terms: string[];
}

export interface BusinessModelResult {
  reportId: string;
  reportUrl: string;
  site: { host: string; archetype: string; runsOn?: string };
  pagesRead: number;
  counts: { entities: number; declared: number; inferred: number; humanConfirmed: number; capabilities: number; agentReady: number };
  business: ModelledEntity | null;
  entities: ModelledEntity[];
  capabilities: Array<ModelledAction & { expected: boolean; appliesTo: string[] }>;
  terminology: Array<{ term: string; meaning?: string; entityIds: string[]; source: "human-provided" | "machine-inferred" }>;
  boundaries: string;
}

const BUSINESS_TYPES = new Set(["Organization", "LocalBusiness", "LodgingBusiness", "Hotel", "Resort", "Store", "Restaurant", "Brand", "Corporation", "TravelAgency", "OnlineStore", "NewsMediaOrganization", "Airline", "Bank", "InsuranceAgency", "FinancialService", "MedicalOrganization", "EducationalOrganization", "SportsTeam"]);
const PLACE_TYPES = new Set(["Place", "City", "Country", "AdministrativeArea", "TouristAttraction", "TouristDestination", "Landform", "Mountain", "BodyOfWater", "LakeBodyOfWater", "SkiResort"]);
const CONTENT_TYPES = new Set(["WebSite", "WebPage", "Article", "BlogPosting", "NewsArticle", "CreativeWork", "Book", "Movie", "MusicRecording", "VideoObject", "Podcast"]);

const MAX_ENTITIES = 40;
const MAX_TERMS_PER_ENTITY = 5;

export const MODEL_BOUNDARIES =
  "Declared entities come from the site's own markup. Inferred entities were read from its text by the audit's extractor: they are candidates, never evidence, and never move readiness. Human-confirmed means the owner said so on the report. An action is agent-ready only when the audit's agent invoked its interface. This model was built from the pages the audit read, not from the whole business.";

export function entityRole(entity: DomainEntity): EntityRole {
  if (entity.types.some((type) => BUSINESS_TYPES.has(type))) return "business";
  if (entity.types.includes("Person")) return "person";
  if (entity.types.some((type) => PLACE_TYPES.has(type))) return "place";
  if (entity.types.some((type) => CONTENT_TYPES.has(type))) return "content";
  return "offering";
}

export function entityProvenance(entity: DomainEntity): EntityProvenance {
  if (entity.humanPriority === "primary") return "human-confirmed";
  return entity.origin === "inferred" ? "inferred" : "declared";
}

function modelledAction(capability: CapabilityResult): ModelledAction {
  return { actionId: capability.actionId, label: capability.label, state: capability.state, agentReady: capability.state === "agent-ready" };
}

export function modelEntity(entity: DomainEntity, report: ReportRecord): ModelledEntity {
  const answersFor = (report.capabilities ?? [])
    .filter((capability) => capability.expected && capability.appliesTo.some((subject) => subject.id === entity.id))
    .sort((left, right) => right.importance - left.importance)
    .map(modelledAction);
  const terms = (report.contextGraph?.lexicalEntries ?? [])
    .filter((term) => term.kind !== "entity-name" && term.entityIds.includes(entity.id) && term.label.toLowerCase() !== entity.name.toLowerCase())
    .slice(0, MAX_TERMS_PER_ENTITY)
    .map((term) => term.label);
  return {
    id: entity.id,
    name: entity.name,
    type: entity.types[0] ?? "Thing",
    role: entityRole(entity),
    provenance: entityProvenance(entity),
    confidence: entity.confidence,
    priority: entity.humanPriority === "primary" ? "primary" : entity.humanPriority === "demoted" ? "demoted" : "secondary",
    ...(entity.description ? { description: entity.description } : {}),
    sameAs: entity.sameAs,
    sources: entity.sourceUrls,
    answersFor,
    terms,
  };
}

const ROLE_ORDER: Record<EntityRole, number> = { business: 0, offering: 1, place: 2, person: 3, content: 4 };
const PROVENANCE_ORDER: Record<EntityProvenance, number> = { "human-confirmed": 0, declared: 1, inferred: 2 };

/** The business, its offerings, its places and its people, the ones that matter first. */
export function businessModel(report: ReportRecord, reportUrl: string): BusinessModelResult {
  const all = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted").map((entity) => modelEntity(entity, report));
  const ordered = [...all].sort(
    (left, right) =>
      ROLE_ORDER[left.role] - ROLE_ORDER[right.role] ||
      PROVENANCE_ORDER[left.provenance] - PROVENANCE_ORDER[right.provenance] ||
      right.answersFor.length - left.answersFor.length ||
      right.confidence - left.confidence ||
      left.name.localeCompare(right.name),
  );
  const business = ordered.find((entity) => entity.role === "business") ?? null;
  const capabilities = (report.capabilities ?? []).map((capability) => ({ ...modelledAction(capability), expected: capability.expected, appliesTo: capability.appliesTo.map((subject) => subject.id) }));
  return {
    reportId: report.id,
    reportUrl,
    site: {
      host: hostOf(report.canonicalUrl ?? report.requestedUrl),
      archetype: report.classification?.businessRole ?? report.classification?.primaryArchetype ?? "other",
      ...(report.publishedWith ? { runsOn: report.publishedWith.name } : {}),
    },
    pagesRead: report.contextGraph?.pages.length ?? 0,
    counts: {
      entities: all.length,
      declared: all.filter((entity) => entity.provenance === "declared").length,
      inferred: all.filter((entity) => entity.provenance === "inferred").length,
      humanConfirmed: all.filter((entity) => entity.provenance === "human-confirmed").length,
      capabilities: capabilities.filter((capability) => capability.expected).length,
      agentReady: capabilities.filter((capability) => capability.expected && capability.agentReady).length,
    },
    business,
    entities: ordered.slice(0, MAX_ENTITIES),
    capabilities,
    terminology: (report.contextGraph?.lexicalEntries ?? [])
      .filter((entry) => entry.kind !== "entity-name")
      .slice(0, 20)
      .map((entry) => ({ term: entry.label, ...(entry.meaning ? { meaning: entry.meaning } : {}), entityIds: entry.entityIds, source: entry.provenance ?? "machine-inferred" })),
    boundaries: MODEL_BOUNDARIES,
  };
}

const STATE_WORDS: Record<string, string> = { "agent-ready": "works", unverified: "fix this", "human-only": "fix this", missing: "talk to us", "not-expected": "not expected" };

function entityLine(entity: ModelledEntity): string {
  const link = entity.sameAs.find((url) => /wikidata\.org/i.test(url));
  const answers = entity.answersFor.length > 0 ? `; answers for ${entity.answersFor.map((action) => `${action.label} [${STATE_WORDS[action.state] ?? action.state}]`).join(", ")}` : "";
  const terms = entity.terms.length > 0 ? `; the site's words: ${entity.terms.map((term) => `"${term}"`).join(", ")}` : "";
  return `- ${entity.name} (${entity.type}, ${entity.provenance}${entity.priority === "primary" ? ", primary" : ""}${link ? `, same as ${link}` : ""})${answers}${terms}`;
}

const ROLE_HEADINGS: Record<EntityRole, string> = { business: "The business", offering: "What it offers", place: "Where", person: "Who", content: "Content" };

/** The model as prose an agent reads once. */
export function businessModelText(model: BusinessModelResult): string {
  const lines: string[] = [];
  lines.push(`Business model of ${model.site.host}, read from ${model.pagesRead} ${model.pagesRead === 1 ? "page" : "pages"} (${model.site.archetype})${model.site.runsOn ? `. The site runs on ${model.site.runsOn}` : ""}.`);
  lines.push(`${model.counts.entities} entities: ${model.counts.declared} declared in the site's markup, ${model.counts.inferred} inferred from its text, ${model.counts.humanConfirmed} confirmed by the owner. ${model.counts.capabilities} expected actions, ${model.counts.agentReady} agent-ready.`);
  for (const role of ["business", "offering", "place", "person", "content"] as EntityRole[]) {
    const group = model.entities.filter((entity) => entity.role === role);
    if (group.length === 0) continue;
    lines.push("", `${ROLE_HEADINGS[role]}:`, ...group.map(entityLine));
  }
  const expected = model.capabilities.filter((capability) => capability.expected);
  const works = expected.filter((capability) => capability.agentReady).map((capability) => capability.label);
  const fix = expected.filter((capability) => capability.state === "unverified" || capability.state === "human-only").map((capability) => capability.label);
  const talk = expected.filter((capability) => capability.state === "missing").map((capability) => capability.label);
  lines.push("", `Actions an agent can perform today: ${works.length > 0 ? works.join(", ") : "none"}.`);
  if (fix.length > 0) lines.push(`Actions people can do here that agents cannot yet: ${fix.join(", ")}.`);
  if (talk.length > 0) lines.push(`Actions this business should support with no interface at all: ${talk.join(", ")}.`);
  if (model.terminology.length > 0) lines.push("", `The site's own vocabulary: ${model.terminology.slice(0, 12).map((term) => (term.meaning ? `"${term.term}" (${term.meaning})` : `"${term.term}"`)).join(", ")}.`);
  lines.push("", model.boundaries, `Full report: ${model.reportUrl}`);
  return lines.join("\n");
}

export interface EntityDetailResult extends ModelledEntity {
  reportId: string;
  reportUrl: string;
  alternateNames: string[];
  offers: DomainEntity["offers"];
  pages: Array<{ url: string; title: string }>;
  /** What was seen for each action the entity answers for, as the report holds it: claims, never conclusions. */
  evidence: Array<{ actionId: string; claim: string; verification: string; sourceUrl: string }>;
  boundaries: string;
}

/** One entity in full: by id, or by the name a person or an agent would use. */
export function findEntity(report: ReportRecord, lookup: { entityId?: string; name?: string }): DomainEntity | null {
  const entities = report.contextGraph?.entities ?? [];
  if (lookup.entityId) return entities.find((entity) => entity.id === lookup.entityId) ?? null;
  const wanted = lookup.name?.trim().toLowerCase();
  if (!wanted) return null;
  return (
    entities.find((entity) => entity.name.toLowerCase() === wanted) ??
    entities.find((entity) => entity.alternateNames.some((alias) => alias.toLowerCase() === wanted)) ??
    entities.find((entity) => entity.name.toLowerCase().includes(wanted)) ??
    null
  );
}

export function entityDetail(entity: DomainEntity, report: ReportRecord, reportUrl: string): EntityDetailResult {
  const modelled = modelEntity(entity, report);
  const evidence = (report.capabilities ?? [])
    .filter((capability) => capability.appliesTo.some((subject) => subject.id === entity.id))
    .flatMap((capability) => capability.evidence.slice(0, 4).map((item) => ({ actionId: capability.actionId, claim: item.claim, verification: item.verification, sourceUrl: item.sourceUrl })))
    .slice(0, 24);
  return {
    ...modelled,
    reportId: report.id,
    reportUrl,
    alternateNames: entity.alternateNames,
    offers: entity.offers,
    pages: (report.contextGraph?.pages ?? []).filter((page) => page.entityIds.includes(entity.id)).map((page) => ({ url: page.url, title: page.title })),
    evidence,
    boundaries: MODEL_BOUNDARIES,
  };
}

export function entityDetailText(detail: EntityDetailResult): string {
  const lines: string[] = [];
  lines.push(`${detail.name} (${detail.type}), ${detail.provenance}${detail.priority === "primary" ? ", primary for the owner" : ""}, confidence ${Math.round(detail.confidence * 100)}%.`);
  if (detail.description) lines.push(detail.description);
  if (detail.alternateNames.length > 0) lines.push(`Also called: ${detail.alternateNames.join(", ")}.`);
  if (detail.sameAs.length > 0) lines.push(`Same as: ${detail.sameAs.join(", ")}.`);
  if (detail.offers.length > 0) lines.push(`Offers: ${detail.offers.map((offer) => [offer.name, offer.price !== undefined ? `${offer.price} ${offer.priceCurrency ?? ""}`.trim() : null, offer.availability].filter(Boolean).join(", ")).join("; ")}.`);
  lines.push(`Seen on: ${detail.pages.length > 0 ? detail.pages.map((page) => page.url).join(", ") : detail.sources.join(", ")}.`);
  if (detail.answersFor.length > 0) lines.push(`Answers for: ${detail.answersFor.map((action) => `${action.label} [${STATE_WORDS[action.state] ?? action.state}]`).join(", ")}.`);
  if (detail.terms.length > 0) lines.push(`The site's words for it: ${detail.terms.map((term) => `"${term}"`).join(", ")}.`);
  if (detail.evidence.length > 0) lines.push("", "Evidence:", ...detail.evidence.map((item) => `- ${item.actionId}: ${item.claim} (${item.verification}, ${item.sourceUrl})`));
  lines.push("", detail.boundaries, `Full report: ${detail.reportUrl}`);
  return lines.join("\n");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

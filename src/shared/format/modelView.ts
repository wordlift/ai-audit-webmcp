import type { DomainEntity, EntityRelation, ReportRecord } from "../types/index.js";
import { entityProvenance, entityRole, type EntityProvenance, type EntityRole } from "./businessModel.js";

/**
 * The model as a stranger should meet it in thirty seconds: the business, what it offers, where.
 * The report keeps everything it read; this view only chooses what the first screen says, and says
 * it once. Variants of one product are one product. The website's own publisher, named after the
 * domain, is not a second business. Platforms a page merely mentions are not what this business
 * offers. What the text says is connected, and what the markup declares, is shown first.
 */
export interface ViewEntity {
  id: string;
  name: string;
  type: string;
  role: EntityRole;
  provenance: EntityProvenance;
  /** How many more variants of this product the site lists, folded into it. */
  variants: number;
}

export interface ModelView {
  business: ViewEntity | null;
  offerings: ViewEntity[];
  places: ViewEntity[];
  /** What the first screen shows, in order: the business, up to three offerings, up to two places. */
  preview: ViewEntity[];
  counts: {
    pages: number;
    businesses: number;
    offerings: Array<{ label: string; count: number }>;
    places: number;
    people: number;
    relationships: number;
    declared: number;
    inferred: number;
    confirmed: number;
  };
  /** One sentence of what the business is, from the model's own facts, or null when it holds too little. */
  sentence: string | null;
}

/** Brands a page names in passing far more often than it sells them; never an offering of a site that is not theirs. */
const PLATFORMS = new Set([
  "google", "google maps", "google search", "gemini", "youtube", "gmail", "android", "chrome",
  "microsoft", "bing", "azure", "openai", "chatgpt", "gpt", "claude", "anthropic", "perplexity",
  "amazon", "aws", "apple", "iphone", "meta", "facebook", "instagram", "whatsapp", "linkedin", "tiktok", "x", "twitter",
  "shopify", "wordpress", "wix", "squarespace", "stripe", "paypal", "visa", "mastercard", "klarna",
  "booking.com", "expedia", "airbnb", "tripadvisor", "trustpilot", "open api", "openapi", "api", "knowledge graph", "seo", "ai",
]);

/** What a generic organization is, said by the kind of site it runs. */
const ARCHETYPE_NOUNS: Record<string, string> = {
  saas: "software company",
  "commerce-retail": "shop",
  "travel-hospitality": "travel business",
  "publisher-content": "publisher",
  "finance-insurance": "financial services company",
};
const GENERIC_BUSINESS_TYPES = new Set(["Organization", "Corporation", "LocalBusiness"]);

/**
 * A collection a shop or a site files things under ("Men's Shoes", "New Arrivals", "Apparel &
 * Accessories") rather than a thing it offers: two things joined, or a short run of words ending in a
 * plural, with no number and no brand-like capital inside a word.
 */
export function looksLikeCategory(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (/\s(&|and)\s/i.test(name)) return true;
  if (/\d/.test(name) || words.length > 3) return false;
  if (words.some((word) => /[a-z][A-Z]/.test(word) || /^[A-Z]{2,}$/.test(word))) return false;
  return /[a-z]{3,}s$/.test(words[words.length - 1] ?? "");
}

/** Where a variant's own words begin: "Men's Runner NZ Slip On - Mushroom (Mushroom Sole) - Size 10". */
const VARIANT_SEPARATOR = /\s+[-–—|/]\s+|\s*,\s*size\b|\s+\((?:size|colou?r)\b/i;

const normalized = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim();

export function hostName(report: ReportRecord): string {
  try {
    return new URL(report.requestedUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** "alpina.travel" and "Alpina.travel" and "alpina travel" name the website, not a business apart from it. */
function namesTheSite(entity: DomainEntity, host: string): boolean {
  if (!host) return false;
  const name = normalized(entity.name);
  const bare = host.split(".").slice(0, -1).join(".");
  return name === host || name === host.replace(/\./g, " ") || (entity.types.includes("WebSite") && name.startsWith(bare));
}

function isPlatform(entity: DomainEntity, host: string): boolean {
  const name = normalized(entity.name);
  // A platform's own site offers the platform.
  return PLATFORMS.has(name) && !host.startsWith(name.replace(/\s+/g, ""));
}

function view(entity: DomainEntity, variants = 0, type?: string): ViewEntity {
  return { id: entity.id, name: entity.name, type: type ?? entity.types[0] ?? "Thing", role: entityRole(entity), provenance: entityProvenance(entity), variants };
}

const PROVENANCE_RANK: Record<EntityProvenance, number> = { "human-confirmed": 0, declared: 1, inferred: 2 };

export function modelView(report: ReportRecord): ModelView {
  const host = hostName(report);
  const graph = report.contextGraph;
  const all = (graph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted");
  const relations = (graph?.relations ?? []).filter((relation) => all.some((entity) => entity.id === relation.from) && all.some((entity) => entity.id === relation.to));
  const connected = new Set(relations.flatMap((relation) => [relation.from, relation.to]));
  const primary = (entity: DomainEntity) => entity.humanPriority === "primary";
  // A place inside another reads before the place that holds it: Mariapfarr, then Lungau, then the Alps.
  const depth = (entity: DomainEntity) => {
    let hops = 0;
    let at = entity.id;
    const seen = new Set([at]);
    for (;;) {
      const up = relations.find((relation) => relation.from === at && relation.kind === "located-in" && !seen.has(relation.to));
      if (!up || hops > 5) return hops;
      hops += 1;
      seen.add(up.to);
      at = up.to;
    }
  };
  // What the site puts in its titles and headings is what it is about: a name there outranks one named in passing.
  const pages = graph?.pages ?? [];
  const salience = (entity: DomainEntity) => {
    const name = normalized(entity.name);
    if (name.length < 3) return 0;
    return pages.reduce((score, page) => score + (normalized(page.title ?? "").includes(name) ? 2 : 0) + (page.headings ?? []).filter((heading) => normalized(heading).includes(name)).length, 0);
  };
  const rank = (left: DomainEntity, right: DomainEntity, weight: (entity: DomainEntity) => number = () => 0) =>
    Number(primary(right)) - Number(primary(left)) ||
    Number(connected.has(right.id)) - Number(connected.has(left.id)) ||
    PROVENANCE_RANK[entityProvenance(left)] - PROVENANCE_RANK[entityProvenance(right)] ||
    weight(right) - weight(left) ||
    right.sourceUrls.length - left.sourceUrls.length ||
    right.confidence - left.confidence ||
    left.name.length - right.name.length;

  // The business: the one that is not just the website's name, unless nothing else is.
  const businesses = all.filter((entity) => entityRole(entity) === "business");
  // One name, one business: an Organization and a Brand called Allbirds are Allbirds.
  const businessName = (entity: DomainEntity) => normalized(entity.name).replace(/[\s,.]+(inc|llc|ltd|limited|gmbh|srl|s r l|spa|s p a|ag|sa|bv|corp|corporation|co)\.?$/, "").trim();
  const distinct = businesses
    .filter((entity) => !namesTheSite(entity, host))
    .filter((entity, index, list) => list.findIndex((other) => businessName(other) === businessName(entity)) === index);
  // Beside a business the site declares, a brand only the text names is a line it sells ("Runner NZ"), not a second business.
  const settledBusiness = distinct.some((entity) => entityProvenance(entity) !== "inferred");
  const productLines = settledBusiness ? distinct.filter((entity) => entityProvenance(entity) === "inferred" && entity.types.includes("Brand")) : [];
  const ownBusinesses = distinct.filter((entity) => !productLines.includes(entity));
  const businessPool = (ownBusinesses.length > 0 ? ownBusinesses : businesses).sort((left, right) => rank(left, right));

  // Among names the model is equally sure of, one that carries the business's own name ("WordLift Agent")
  // or names a thing in more than one word ("Data Connect") is more likely what it sells than a bare
  // category ("Eyewear").
  const ownName = businessPool[0] ? businessName(businessPool[0]) : "";
  const specificity = (entity: DomainEntity) => {
    const name = normalized(entity.name);
    return (ownName && name.includes(ownName) ? 2 : 0) + (name.split(" ").length > 1 ? 1 : 0);
  };

  // Offerings, one per product: variants fold into the shortest name they share a base with.
  const offeringPool = [...all.filter((entity) => entityRole(entity) === "offering" && !isPlatform(entity, host)), ...productLines];
  // An inferred event is usually a headline ("Mountain days"), an inferred offer a banner ("Final Sale"):
  // each stays out unless something connects it or someone confirmed it.
  const offeringCandidates = offeringPool.filter((entity) => {
    if (entityProvenance(entity) !== "inferred" || connected.has(entity.id)) return true;
    if (entity.types.includes("Event") || entity.types.includes("Offer")) return false;
    // A collection the text names is where things are filed, not one of the things.
    return !looksLikeCategory(entity.name);
  });
  const groups = new Map<string, DomainEntity[]>();
  for (const entity of offeringCandidates) {
    const base = normalized(entity.name.split(VARIANT_SEPARATOR)[0] ?? entity.name);
    groups.set(base, [...(groups.get(base) ?? []), entity]);
  }
  // An inferred name inside a declared one ("Runner NZ Slip On" in "Men's Runner NZ Slip On") is the declared thing read again.
  const settledNames = offeringCandidates.filter((entity) => entityProvenance(entity) !== "inferred").map((entity) => normalized(entity.name));
  for (const [base, members] of [...groups.entries()]) {
    if (members.every((entity) => entityProvenance(entity) === "inferred") && settledNames.some((name) => name !== base && name.includes(base))) groups.delete(base);
  }
  const offerings = [...groups.values()]
    .map((members) => {
      const sorted = [...members].sort((left, right) => rank(left, right));
      const shortest = [...members].sort((left, right) => left.name.length - right.name.length)[0]!;
      const lead = members.length > 1 ? shortest : sorted[0]!;
      return { entity: lead, variants: members.length - 1 };
    })
    // A product the site lists in many variants is one it sells most visibly.
    .sort((left, right) => rank(left.entity, right.entity, (entity) => (entity === left.entity ? left.variants : right.variants) * 2 + salience(entity) + specificity(entity)));

  const places = all.filter((entity) => entityRole(entity) === "place").sort((left, right) => rank(left, right, depth));
  const people = all.filter((entity) => entityRole(entity) === "person");

  const business = businessPool[0] ? view(businessPool[0]) : null;
  const typeFor = (entity: DomainEntity) => (productLines.includes(entity) ? "ProductLine" : undefined);
  const shownOfferings = offerings.slice(0, 3).map(({ entity, variants }) => view(entity, variants, typeFor(entity)));
  const shownPlaces = places.slice(0, business || shownOfferings.length > 0 ? 2 : 4).map((entity) => view(entity));
  const preview = [...(business ? [business] : []), ...shownOfferings, ...shownPlaces].slice(0, 6);

  const labels = new Map<string, number>();
  for (const { entity } of offerings) {
    const label = typeLabel(entity.types[0]);
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  const counted = [...(ownBusinesses.length > 0 ? ownBusinesses : businesses), ...offerings.map((item) => item.entity), ...places, ...people];
  return {
    business,
    offerings: offerings.map(({ entity, variants }) => view(entity, variants, typeFor(entity))),
    places: places.map((entity) => view(entity)),
    preview,
    counts: {
      pages: graph?.pages.length ?? 0,
      businesses: Math.min(1, businessPool.length) + Math.max(0, ownBusinesses.length - 1),
      offerings: [...labels.entries()].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count),
      places: places.length,
      people: people.length,
      relationships: relations.length,
      declared: counted.filter((entity) => entityProvenance(entity) === "declared").length,
      inferred: counted.filter((entity) => entityProvenance(entity) === "inferred").length,
      confirmed: counted.filter((entity) => entityProvenance(entity) === "human-confirmed").length,
    },
    sentence: sentenceFor(report, business, offerings.map(({ entity, variants }) => view(entity, variants, typeFor(entity))), relations, all),
  };
}

/** "LodgingBusiness" → "lodging business". */
export function typeLabel(type: string | undefined): string {
  if (!type) return "thing";
  return type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase();
}

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * What the business is, in one sentence built only from the model: the business and its kind, what
 * it offers, and where, only when a relation says where. "AlpiNest Feriendorf Lungau is a lodging
 * business offering Samspitze 4, in Mariapfarr." Nothing is said that the model does not hold.
 */
function sentenceFor(report: ReportRecord, business: ViewEntity | null, offerings: ViewEntity[], relations: EntityRelation[], all: DomainEntity[]): string | null {
  const names = new Map(all.map((entity) => [entity.id, entity.name]));
  const where = (id: string) => relations.find((relation) => relation.from === id && relation.kind === "located-in");
  const subject = business ?? offerings[0];
  if (!subject) return null;
  const archetype = report.classification?.primaryArchetype ?? "other";
  const kind = business && GENERIC_BUSINESS_TYPES.has(subject.type) && ARCHETYPE_NOUNS[archetype] ? ARCHETYPE_NOUNS[archetype]! : typeLabel(subject.type);
  // Without a business the sentence is about the leading offering alone: it offers nothing itself.
  // What the site declares or a review confirmed speaks for the business before what the text only mentions.
  const settled = offerings.filter((offering) => offering.provenance !== "inferred");
  const pool = business ? [...settled, ...offerings.filter((offering) => offering.provenance === "inferred")] : [];
  const shown = pool.slice(0, 3);
  const totalOfferings = pool.length;
  const more = totalOfferings - shown.length;
  const nouns = shown.length > 0 ? list(shown.map((offering) => offering.name)) + (more > 0 ? ` and ${more} more` : "") : "";
  const place = where(subject.id) ?? (shown[0] ? where(shown[0].id) : undefined);
  const placeName = place ? names.get(place.to) : undefined;
  const placeOf = placeName ? where(place!.to) : undefined;
  const wherePhrase = placeName ? `, in ${placeName}${placeOf && names.get(placeOf.to) ? `, ${names.get(placeOf.to)}` : ""}` : "";
  const body = nouns ? `${subject.name} is ${article(kind)} offering ${nouns}${wherePhrase}.` : `${subject.name} is ${article(kind)}${wherePhrase}.`;
  // Where nothing ties the business to a place, the places the site is about still say where, as the site's.
  if (!placeName) {
    const nested = relations.find((relation) => relation.kind === "located-in" && all.some((entity) => entity.id === relation.from && entityRole(entity) === "place"));
    if (nested && names.get(nested.from) && names.get(nested.to)) return `${body} The site is about ${names.get(nested.from)}, in ${names.get(nested.to)}.`;
  }
  return report.contextGraph ? body : null;
}

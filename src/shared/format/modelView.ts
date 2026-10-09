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
  /** For a place inside another the model knows: "Lungau", so the card says "Place in Lungau". */
  within?: string;
  role: EntityRole;
  provenance: EntityProvenance;
  /** How many more variants of this product the site lists, folded into it. */
  variants: number;
  /** A name the site is built around: in its domain or titles, or on more than one page read. */
  prominent?: boolean;
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
 * What a business is, from the content category the classifier read on its pages, most specific first:
 * "/Food & Drink/Restaurants/Fast Food" is a restaurant business, whatever archetype restaurants share
 * with hotels. Only a category the classifier is fairly sure of speaks.
 */
const CATEGORY_NOUNS: Array<[string, string]> = [
  ["/Food & Drink/Restaurants", "restaurant business"],
  ["/Food & Drink", "food and drink business"],
  ["/Travel & Transportation/Hotels & Accommodations", "hotel business"],
  ["/Travel & Transportation", "travel business"],
  ["/Travel", "travel business"],
  ["/Computers & Electronics/Software", "software company"],
  ["/Internet & Telecom", "internet company"],
  ["/Apparel", "fashion brand"],
  ["/Shopping", "shop"],
  ["/Finance/Insurance", "insurance company"],
  ["/Finance", "financial services company"],
  ["/Health", "health business"],
  ["/Beauty & Fitness", "beauty and fitness business"],
  ["/Real Estate", "real estate business"],
  ["/Autos & Vehicles", "automotive business"],
  ["/Jobs & Education/Education", "education provider"],
  ["/News", "publisher"],
  ["/Arts & Entertainment", "entertainment business"],
  ["/Business & Industrial", "business services company"],
];

function categoryNoun(report: ReportRecord): string | null {
  const categories = [...(report.classification?.categories ?? [])].filter((category) => category.confidence >= 0.5).sort((left, right) => right.confidence - left.confidence);
  for (const category of categories) {
    const match = CATEGORY_NOUNS.find(([prefix]) => category.name.startsWith(prefix));
    if (match) return match[1];
  }
  return null;
}

/**
 * A collection a shop or a site files things under ("Men's Shoes", "New Arrivals", "Apparel &
 * Accessories") rather than a thing it offers: two things joined, or a short run of words ending in a
 * plural, with no number and no brand-like capital inside a word.
 */
export function looksLikeCategory(name: string): boolean {
  const words = name.trim().split(/\s+/);
  // A slogan, not a thing: "Wildly Comfortable", "Shop New Arrivals", "Discover More", "Make a night of it".
  if (words.length <= 5 && (/ly$/i.test(words[0] ?? "") || /^(shop|discover|explore|browse|find|get|see|made|meet|free|make|join|book|stay|come|try|start|let's|enjoy)$/i.test(words[0] ?? ""))) return true;
  // A run of ordinary words is a line of copy: "a night of it", "work gets done".
  if (words.filter((word) => /^[a-z]{2,}$/.test(word) && !/^(and|of|for|the|with|by|to|in|on|a|an)$/.test(word)).length >= 2) return true;
  if (/\s(&|and)\s/i.test(name)) return true;
  // "The Hoxton, Brussels" names one place of a business, not a shelf of things.
  if (/\d/.test(name) || words.length > 3 || name.includes(",")) return false;
  if (words.some((word) => /[a-z][A-Z]/.test(word) || /^[A-Z]{2,}$/.test(word))) return false;
  return /[a-z]{3,}s$/.test(words[words.length - 1] ?? "");
}

/**
 * A name that is a label on the page rather than a thing the business offers: a phrase with an
 * ordinary lowercase word in it ("Project page"), a short acronym ("CLI", "SDK"), or one plain word
 * ("Pro", "Skills", "Unlimited"). Prominence on the site outweighs it: "Basecamp" is one word too.
 */
export function looksGeneric(name: string): boolean {
  const words = name.trim().split(/\s+/);
  if (words.length > 1) return words.slice(1).some((word) => /^[a-z]{3,}$/.test(word) && !/^(and|of|for|the|with|by|to|in|on)$/.test(word));
  const word = words[0] ?? "";
  if (/^[A-Z]{2,4}$/.test(word)) return true;
  return /^[A-Z][a-z]+$/.test(word) && !/\d/.test(word);
}

/** Where a variant's own words begin: "Men's Runner NZ Slip On - Mushroom (Mushroom Sole) - Size 10". */
const VARIANT_SEPARATOR = /\s+[-–—|/]\s+|\s*,\s*size\b|\s+\((?:size|colou?r)\b/i;

const normalized = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim();

/**
 * The kind of site in a chip's words: the archetype, unless it blurs what the pages are about, in which
 * case the top category the classifier is sure of ("food & drink" rather than "travel / hospitality").
 */
export function siteKind(report: ReportRecord): string {
  const archetype = report.classification?.primaryArchetype;
  const blurred = !archetype || archetype === "other" || archetype === "travel-hospitality";
  const top = [...(report.classification?.categories ?? [])].filter((category) => category.confidence >= 0.5).sort((left, right) => right.confidence - left.confidence)[0];
  const family = top?.name.split("/").filter(Boolean)[0];
  if (blurred && family && !/^travel/i.test(family)) return family.toLowerCase();
  return !archetype || archetype === "other" ? "general" : archetype.replaceAll("-", " / ");
}

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
  // A name spread over lines is two page fragments glued by the extractor, never a thing.
  const all = (graph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted" && !/[\r\n]/.test(entity.name));
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
    // Whole words only: "Pro" is not in "projects", "CLI" is not in "clients".
    const said = (text: string) => ` ${normalized(text)} `.includes(` ${name} `);
    return pages.reduce((score, page) => score + (said(page.title ?? "") ? 2 : 0) + (page.headings ?? []).filter(said).length, 0);
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
  // Dots go first, so "S.p.A." is "spa" and "B.V." is "bv".
  const businessName = (entity: DomainEntity) => normalized(entity.name).replace(/\./g, "").replace(/\s+/g, " ").replace(/[\s,]+(inc|llc|ltd|limited|gmbh|srl|s r l|spa|s p a|ag|sa|bv|nv|plc|sas|sarl|corp|corporation|co)$/, "").trim();
  // A name with a legal form ("Feltrinelli S.p.A.", "37signals LLC.") is the company's registered name.
  const legalName = (entity: DomainEntity) => businessName(entity) !== normalized(entity.name).replace(/\./g, "").replace(/\s+/g, " ").trim();
  // The names that are one business are counted as one: "37signals" on one page and "37signals LLC."
  // on five are seen on five, and shown by the name a customer uses, not the registered one.
  const sameBusiness = new Map<string, DomainEntity[]>();
  for (const entity of businesses.filter((candidate) => !namesTheSite(candidate, host))) {
    sameBusiness.set(businessName(entity), [...(sameBusiness.get(businessName(entity)) ?? []), entity]);
  }
  const distinct = [...sameBusiness.values()].map((members) => {
    const lead = [...members].sort((left, right) =>
      Number(primary(right)) - Number(primary(left)) ||
      PROVENANCE_RANK[entityProvenance(left)] - PROVENANCE_RANK[entityProvenance(right)] ||
      Number(legalName(left)) - Number(legalName(right)) ||
      right.sourceUrls.length - left.sourceUrls.length)[0]!;
    const sourceUrls = [...new Set(members.flatMap((member) => member.sourceUrls))].slice(0, 12);
    return sourceUrls.length === lead.sourceUrls.length ? lead : { ...lead, sourceUrls };
  });
  // Beside a business the site declares, a brand only the text names is a line it sells ("Runner NZ"), not a second business.
  const settledBusiness = distinct.some((entity) => entityProvenance(entity) !== "inferred");
  // A business only the text names that carries the declared business's own name is one of its places:
  // "The Hoxton, Brussels" is what The Hoxton offers. Its bare namesake ("Hoxton") is the business itself.
  const declaredBusiness = distinct.find((entity) => entityProvenance(entity) !== "inferred");
  const tokens = (name: string) => new Set(normalized(name).split(" ").filter((token) => token.length > 2 && token !== "the"));
  const ownTokens = declaredBusiness ? tokens(declaredBusiness.name) : new Set<string>();
  const carriesOwnName = (entity: DomainEntity) => ownTokens.size > 0 && [...ownTokens].every((token) => tokens(entity.name).has(token));
  const namesake = (entity: DomainEntity) => carriesOwnName(entity) && tokens(entity.name).size === ownTokens.size;
  // A registered name ("Feltrinelli S.p.A.", "Inter IKEA Systems B.V.") is a company, never a line it sells.
  const productLines = settledBusiness
    ? distinct.filter((entity) => entityProvenance(entity) === "inferred" && !namesake(entity) && !legalName(entity) && (entity.types.includes("Brand") || carriesOwnName(entity)))
    : [];
  // Any other business only the text names, beside the one the site declares, is a mention ("Reese's" in a
  // shake), not a second business of this site's; a review can still confirm it.
  const ownBusinesses = distinct.filter((entity) => !productLines.includes(entity) && !(settledBusiness && entityProvenance(entity) === "inferred" && !connected.has(entity.id)));
  const businessPool = (ownBusinesses.length > 0 ? ownBusinesses : businesses).sort((left, right) => rank(left, right));

  // Among names the model is equally sure of, one that carries the business's own name ("WordLift Agent")
  // or names a thing in more than one word ("Data Connect") is more likely what it sells than a bare
  // category ("Eyewear").
  const ownName = businessPool[0] ? businessName(businessPool[0]) : "";
  const hostLabel = host.split(".")[0] ?? "";
  // The site is about the name it is built around: its domain, its titles, the most pages.
  const prominence = (entity: DomainEntity) => {
    const name = normalized(entity.name).replace(/\s+/g, "");
    return (hostLabel && name === hostLabel ? 6 : 0) + salience(entity) + Math.min(3, entity.sourceUrls.length - 1);
  };
  const specificity = (entity: DomainEntity) => {
    const name = normalized(entity.name);
    return (ownName && name.includes(ownName) ? 2 : 0) + (productLines.includes(entity) && !entity.types.includes("Brand") ? 3 : 0) + (name.split(" ").length > 1 ? 1 : 0) + prominence(entity) - (looksGeneric(entity.name) ? 3 : 0);
  };

  // Offerings, one per product: variants fold into the shortest name they share a base with.
  const offeringPool = [...all.filter((entity) => entityRole(entity) === "offering" && !isPlatform(entity, host)), ...productLines];
  // An inferred event is usually a headline ("Mountain days"), an inferred offer a banner ("Final Sale"):
  // each stays out unless something connects it or someone confirmed it.
  const ownBusinessName = businessPool[0] ? businessName(businessPool[0]) : "";
  const offeringCandidates = offeringPool.filter((entity) => {
    // The business is not one of its own offerings: "The Guardian is a publisher offering The Guardian".
    if (ownBusinessName && businessName(entity) === ownBusinessName) return false;
    if (entityProvenance(entity) !== "inferred" || connected.has(entity.id)) return true;
    // A priced offer is a thing the business sells ("$2 Sodas"); an unpriced one is a banner ("Final Sale").
    if (entity.types.includes("Offer")) return /^([$€£¥]\s?\d|\d+([.,]\d+)?\s?(€|eur|usd|gbp)\b)/i.test(entity.name) && entity.name.length <= 40;
    if (entity.types.includes("Event")) return false;
    // A collection the text names is where things are filed, not one of the things.
    return !looksLikeCategory(entity.name);
  });
  const groups = new Map<string, DomainEntity[]>();
  for (const entity of offeringCandidates) {
    const base = normalized(entity.name.split(VARIANT_SEPARATOR)[0] ?? entity.name);
    groups.set(base, [...(groups.get(base) ?? []), entity]);
  }
  // The collections and slogans set aside still say the site offers more than the sentence names.
  const setAside = offeringPool.filter((entity) => entityProvenance(entity) === "inferred" && !connected.has(entity.id) && !entity.types.includes("Event") && !entity.types.includes("Offer") && looksLikeCategory(entity.name));
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
  const typeFor = (entity: DomainEntity) => (productLines.includes(entity) && entity.types.includes("Brand") ? "ProductLine" : undefined);
  const offeringView = (entity: DomainEntity, variants: number): ViewEntity => ({ ...view(entity, variants, typeFor(entity)), ...(prominence(entity) >= 2 ? { prominent: true } : {}) });
  // A bare word only the text names ("Underwear", "Pro") is a label, not a card a stranger reads as what the
  // business sells; it waits behind "Show all". A name the site is built around ("Basecamp") is not bare.
  // Headings name categories as often as products, so a bare word earns a card from the domain or from being
  // on three pages or more, never from a heading alone.
  const cardWorthy = offerings.filter(({ entity }) => entityProvenance(entity) !== "inferred" || !looksGeneric(entity.name) || normalized(entity.name).replace(/\s+/g, "") === hostLabel || entity.sourceUrls.length >= 3);
  const shownOfferings = cardWorthy.slice(0, 3).map(({ entity, variants }) => offeringView(entity, variants));
  const containerOf = (entity: DomainEntity) => {
    const up = relations.find((relation) => relation.from === entity.id && relation.kind === "located-in");
    return up ? all.find((candidate) => candidate.id === up.to)?.name : undefined;
  };
  const shownPlaces = places.slice(0, business || shownOfferings.length > 0 ? 2 : 4).map((entity) => {
    const within = containerOf(entity);
    return { ...view(entity), ...(within ? { within } : {}) };
  });
  const preview = [...(business ? [business] : []), ...shownOfferings, ...shownPlaces].slice(0, 6);

  const labels = new Map<string, number>();
  for (const { entity } of offerings) {
    const label = typeLabel(entity.types[0]);
    labels.set(label, (labels.get(label) ?? 0) + 1);
  }
  const counted = [...(ownBusinesses.length > 0 ? ownBusinesses : businesses), ...offerings.map((item) => item.entity), ...places, ...people];
  return {
    business,
    offerings: offerings.map(({ entity, variants }) => offeringView(entity, variants)),
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
    sentence: sentenceFor(report, business, offerings.map(({ entity, variants }) => offeringView(entity, variants)), relations, all, offerings.length + setAside.length),
  };
}

/** "LodgingBusiness" → "lodging business". */
export function typeLabel(type: string | undefined): string {
  if (!type) return "thing";
  return type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase();
}

/** "products", "apartments", "services": what most of the offerings are, said as a plural a person uses. */
function pluralKind(types: string[]): string {
  const nouns: Record<string, string> = {
    Product: "products", ProductGroup: "products", ProductLine: "products", Offer: "offers", Service: "services",
    SoftwareApplication: "software", WebApplication: "software", Apartment: "apartments", Accommodation: "stays",
    Hotel: "hotels", Event: "events", Course: "courses", Vehicle: "vehicles", FinancialProduct: "financial products",
  };
  const counts = new Map<string, number>();
  for (const type of types) {
    const noun = nouns[type] ?? "offerings";
    counts.set(noun, (counts.get(noun) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "offerings";
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
function sentenceFor(report: ReportRecord, business: ViewEntity | null, offerings: ViewEntity[], relations: EntityRelation[], all: DomainEntity[], everything = offerings.length): string | null {
  const names = new Map(all.map((entity) => [entity.id, entity.name]));
  const where = (id: string) => relations.find((relation) => relation.from === id && relation.kind === "located-in");
  const subject = business ?? offerings[0];
  if (!subject) return null;
  const archetype = report.classification?.primaryArchetype ?? "other";
  // The archetype says it precisely for software, shops, publishers and finance; travel and hospitality
  // lump restaurants with hotels, and "other" says nothing, so there the pages' category speaks first.
  const categoryFirst = archetype === "travel-hospitality" || !ARCHETYPE_NOUNS[archetype];
  const kind = business && GENERIC_BUSINESS_TYPES.has(subject.type)
    ? (categoryFirst ? categoryNoun(report) ?? ARCHETYPE_NOUNS[archetype] : ARCHETYPE_NOUNS[archetype] ?? categoryNoun(report)) ?? typeLabel(subject.type)
    : typeLabel(subject.type);
  // Without a business the sentence is about the leading offering alone: it offers nothing itself.
  // What the site declares or a review confirmed speaks for the business before what the text only mentions.
  const settled = offerings.filter((offering) => offering.provenance !== "inferred");
  // Only what the site declares, when it declares something: a sentence that names a slogan as a product
  // loses the reader faster than one that names a single product.
  const candidates = business ? (settled.length > 0 ? settled : offerings) : [];
  // What the site is built around speaks for it; otherwise every name that is not a page label does.
  // "Basecamp" leads basecamp.com; "Project page", "CLI" and a bare "Eyewear" stay in the cards.
  const prominent = candidates.filter((offering) => offering.prominent);
  const named = candidates.filter((offering) => !looksGeneric(offering.name));
  const pool = prominent.length > 0 ? prominent : named.length > 0 ? named : candidates.slice(0, 1);
  // Three names read at a glance; past three, "and more" says there is more without a count to parse.
  const shown = pool.slice(0, 3);
  const totalOfferings = pool.length;
  const more = totalOfferings - shown.length;
  // When the site holds more than the sentence names, say so as a kind ("products such as ..."), so one
  // product never stands for the whole business.
  // Counted before collections and slogans were set aside: a shop with "Men's Shoes" sells more than one shoe.
  const allOfferings = business ? Math.max(offerings.length, everything) : 0;
  const kindOf = pluralKind(offerings.map((offering) => offering.type));
  // One kind reads "hotels such as ..."; different kinds are named, and "and more" says there is more.
  const oneKind = new Set(shown.map((offering) => pluralKind([offering.type]))).size === 1;
  const said = list(shown.map((offering) => offering.name));
  const nouns =
    shown.length === 0 ? "" : more > 0 || allOfferings > shown.length ? (oneKind ? `${kindOf} such as ${said}` : `${shown.map((offering) => offering.name).join(", ")} and more`) : said;
  const place = where(subject.id) ?? (shown[0] ? where(shown[0].id) : undefined);
  const placeName = place ? names.get(place.to) : undefined;
  const placeOf = placeName ? where(place!.to) : undefined;
  const wherePhrase = placeName ? `, in ${placeName}${placeOf && names.get(placeOf.to) ? `, ${names.get(placeOf.to)}` : ""}` : "";
  const body = nouns ? `${subject.name} is ${article(kind)} offering ${nouns}${wherePhrase}.` : `${subject.name} is ${article(kind)}${wherePhrase}.`;
  // Where nothing ties the business to a place, the places the site is about still say where, as the site's.
  if (!placeName) {
    const nested = relations.find((relation) => relation.kind === "located-in" && all.some((entity) => entity.id === relation.from && entityRole(entity) === "place"));
    if (nested && names.get(nested.from) && names.get(nested.to)) return `${body} The site is about ${names.get(nested.from)}, in ${names.get(nested.to)}.`;
    // A chain names many places and says none is inside another: which places, then, and how many.
    const places = all.filter((entity) => entityRole(entity) === "place");
    if (places.length >= 3) {
      const first = places.slice(0, 3).map((place) => place.name);
      return `${body} The site is about ${list(places.length > 3 ? [...first, `${places.length - 3} more places`] : first)}.`;
    }
  }
  return report.contextGraph ? body : null;
}

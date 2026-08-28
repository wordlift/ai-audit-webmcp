import type { PageEntity, PageEntityOffer } from "./ScrapeProvider.js";

const MAX_ENTITIES = 24;
const MAX_SCRIPTS = 25;
const MAX_DEPTH = 6;

/**
 * Types that name something the business offers or is. Page furniture — WebSite, BreadcrumbList,
 * ImageObject — is deliberately absent: it says a website exists, not what it sells.
 */
const ENTITY_TYPES = new Set([
  "Product",
  "ProductGroup",
  "Hotel",
  "LodgingBusiness",
  "Resort",
  "Apartment",
  "Accommodation",
  "House",
  "Article",
  "NewsArticle",
  "BlogPosting",
  "SoftwareApplication",
  "WebApplication",
  "Service",
  "FinancialService",
  "InsuranceAgency",
  "LocalBusiness",
  "Organization",
  "Event",
  "Course",
]);

/** Keys worth descending into; anything else would walk the whole document for nothing. */
const WALK_KEYS = [
  "@graph",
  "mainEntity",
  "itemListElement",
  "item",
  "hasOfferCatalog",
  "about",
  "makesOffer",
  "itemOffered",
  "offers",
] as const;

/** Site-authored text is data: control characters go, whitespace collapses, length is capped. */
function collapse(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 32;
    out += code < 32 || (code >= 127 && code < 160) ? " " : character;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, limit);
}

function typesOf(record: Record<string, unknown>): string[] {
  const raw = record["@type"];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.replace(/^https?:\/\/schema\.org\//, ""));
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return /^https?:$/.test(parsed.protocol) ? collapse(parsed.toString(), 600) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the first usable offer; an AggregateOffer contributes its lowest price. */
function offerFrom(offers: unknown): PageEntityOffer | undefined {
  const candidates = Array.isArray(offers) ? offers : [offers];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const aggregate = typesOf(record).includes("AggregateOffer");
    const price = aggregate ? (record.lowPrice ?? record.price) : record.price;

    const offer: PageEntityOffer = {};
    if (typeof price === "number" || (typeof price === "string" && price.trim().length > 0)) {
      offer.price = collapse(String(price), 40);
    }
    const currency = collapse(record.priceCurrency, 10);
    if (currency) offer.priceCurrency = currency;
    const availability = collapse(record.availability, 120).replace(/^https?:\/\/schema\.org\//, "").slice(0, 80);
    if (availability) offer.availability = availability;
    const validFrom = collapse(record.validFrom, 40);
    if (validFrom) offer.validFrom = validFrom;
    const validThrough = collapse(record.validThrough, 40);
    if (validThrough) offer.validThrough = validThrough;

    if (Object.keys(offer).length > 0) return offer;
  }
  return undefined;
}

/**
 * Reads source-backed entities out of the page's JSON-LD. Extraction only: a thing appears here
 * because the site published it with a type and a name, never because a model guessed it.
 */
export function collectJsonLdEntities(document: Document, sourceUrl: string): PageEntity[] {
  const entities: PageEntity[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, depth: number): void => {
    if (entities.length >= MAX_ENTITIES || depth > MAX_DEPTH || !node) return;
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry, depth + 1);
      return;
    }
    if (typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    const type = typesOf(record).find((candidate) => ENTITY_TYPES.has(candidate));
    const name = collapse(record.name ?? record.headline, 200);

    if (type && name) {
      const fallbackId = `${type}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      const id = collapse(record["@id"], 160) || fallbackId;
      if (!seen.has(id)) {
        seen.add(id);
        const description = collapse(record.description, 300);
        const sku = collapse(record.sku, 120);
        const url = httpUrl(record.url);
        const offer = offerFrom(record.offers);
        entities.push({
          id,
          type,
          name,
          ...(description ? { description } : {}),
          ...(url ? { url } : {}),
          ...(sku ? { sku } : {}),
          ...(offer ? { offer } : {}),
          sourceUrl,
          method: "json-ld",
        });
      }
    }

    for (const key of WALK_KEYS) {
      if (record[key]) walk(record[key], depth + 1);
    }
  };

  for (const script of [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, MAX_SCRIPTS)) {
    try {
      walk(JSON.parse(script.textContent ?? ""), 0);
    } catch {
      // A malformed block contributes nothing; the valid ones still count.
    }
  }

  return entities;
}

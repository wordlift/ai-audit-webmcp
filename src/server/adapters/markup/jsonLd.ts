import { DOMAIN_ENTITY_TYPES } from "../scrape/NativeFetch.js";
import type { ExtractedEntity, ExtractedOffer } from "../scrape/ScrapeProvider.js";

/**
 * Reads a generated JSON-LD document the way the collector reads a declared one, and refuses
 * what a model may invent: a node without a type or a name, a type that is not a schema.org
 * name, a URL that is not one. What is refused is reported as an issue rather than silently
 * dropped, so the base is there for a SHACL pass once the shapes exist.
 */
export interface JsonLdNode {
  id?: string;
  types: string[];
  name: string;
  description?: string;
  url?: string;
  alternateNames: string[];
  sameAs: string[];
  offers: ExtractedOffer[];
}

export const MAX_NODES = 20;
const SCHEMA_PREFIX = /^https?:\/\/schema\.org\//;
const TYPE_NAME = /^[A-Z][A-Za-z0-9]{1,79}$/;

export function readJsonLd(document: unknown): { nodes: JsonLdNode[]; issues: string[] } {
  const issues: string[] = [];
  const root = document && typeof document === "object" ? (document as Record<string, unknown>) : null;
  if (!root && !Array.isArray(document)) return { nodes: [], issues: ["The document is not a JSON object"] };

  const context = root?.["@context"];
  if (root && !(typeof context === "string" ? /schema\.org/.test(context) : JSON.stringify(context ?? "").includes("schema.org"))) {
    issues.push("The document does not declare the schema.org context");
  }

  const candidates: unknown[] = Array.isArray(document)
    ? document
    : Array.isArray(root?.["@graph"])
      ? (root?.["@graph"] as unknown[])
      : root
        ? [root]
        : [];

  const nodes: JsonLdNode[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (nodes.length >= MAX_NODES) {
      issues.push(`More than ${MAX_NODES} entities; the rest were not read`);
      break;
    }
    if (!candidate || typeof candidate !== "object") {
      issues.push(`Entity ${index + 1} is not an object`);
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const types = stringList(record["@type"]).map((type) => type.replace(SCHEMA_PREFIX, ""));
    const badType = types.find((type) => !TYPE_NAME.test(type));
    if (types.length === 0 || badType !== undefined) {
      issues.push(`Entity ${index + 1} has ${badType === undefined ? "no type" : `a type that is not a schema.org name: "${badType.slice(0, 40)}"`}`);
      continue;
    }
    const name = firstString(record.name)?.trim().slice(0, 300);
    if (!name) {
      issues.push(`${types[0]} ${index + 1} has no name`);
      continue;
    }
    const url = httpUrl(record.url);
    if (record.url !== undefined && !url) issues.push(`${types[0]} "${name}" has a url that is not one`);
    const id = httpUrl(record["@id"]);
    const sameAs = stringList(record.sameAs).map(httpUrl).filter((value): value is string => value !== null).slice(0, 12);

    nodes.push({
      ...(id ? { id } : {}),
      types: unique(types).slice(0, 12),
      name,
      ...(firstString(record.description) ? { description: firstString(record.description)?.trim().slice(0, 1_000) } : {}),
      ...(url ? { url } : {}),
      alternateNames: stringList(record.alternateName).map((value) => value.trim().slice(0, 240)).filter(Boolean).slice(0, 20),
      sameAs,
      offers: readOffers(record.offers, issues, name),
    });
  }
  return { nodes, issues };
}

/**
 * A model describes the page as well as the business: WebPage, Question, Rating, BreadcrumbList.
 * Those are a page's furniture. The map keeps what the declared path keeps — the types the
 * business is made of — and says how many it left aside, so the count Fix shows is honest.
 */
export function domainNodes(nodes: JsonLdNode[], issues: string[]): JsonLdNode[] {
  const kept = nodes.filter((node) => node.types.some((type) => DOMAIN_ENTITY_TYPES.has(type)));
  const skipped = nodes.filter((node) => !kept.includes(node));
  if (skipped.length > 0) {
    const types = [...new Set(skipped.map((node) => node.types[0] ?? "Thing"))].slice(0, 8).join(", ");
    issues.push(`${skipped.length} ${skipped.length === 1 ? "entity" : "entities"} skipped as not domain entities: ${types}`);
  }
  return kept;
}

/**
 * Inferred entities carry an id of their own on the page's origin, so the same thing inferred on
 * two pages merges, and merges with a declared entity of the same name and a shared type — the
 * rule the graph already applies to declared markup.
 */
export function entitiesFromJsonLd(nodes: JsonLdNode[], pageUrl: string): ExtractedEntity[] {
  const origin = safeOrigin(pageUrl);
  return nodes.map((node) => ({
    id: node.id && safeOrigin(node.id) === origin ? node.id : `${origin}/#inferred-${slug(node.types[0] ?? "thing")}-${slug(node.name)}`,
    types: node.types,
    name: node.name,
    alternateNames: node.alternateNames,
    ...(node.description ? { description: node.description } : {}),
    sourceUrl: pageUrl,
    sameAs: node.sameAs,
    offers: node.offers,
    origin: "inferred" as const,
  }));
}

function readOffers(value: unknown, issues: string[], owner: string): ExtractedOffer[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const offers: ExtractedOffer[] = [];
  for (const item of list.slice(0, 12)) {
    if (!item || typeof item !== "object") {
      issues.push(`An offer on "${owner}" is not an object`);
      continue;
    }
    const offer = item as Record<string, unknown>;
    const price = typeof offer.price === "number" || typeof offer.price === "string" ? offer.price : undefined;
    offers.push({
      ...(firstString(offer.name) ? { name: firstString(offer.name)?.slice(0, 240) } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(firstString(offer.priceCurrency) ? { priceCurrency: firstString(offer.priceCurrency)?.slice(0, 8) } : {}),
      ...(firstString(offer.availability)
        ? { availability: firstString(offer.availability)?.replace(SCHEMA_PREFIX, "").slice(0, 240) }
        : {}),
      ...(httpUrl(offer.url) ? { url: httpUrl(offer.url) as string } : {}),
    });
  }
  return offers;
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringList);
  return [];
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string");
  return undefined;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.toString().slice(0, 2_048) : null;
  } catch {
    return null;
  }
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "thing";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

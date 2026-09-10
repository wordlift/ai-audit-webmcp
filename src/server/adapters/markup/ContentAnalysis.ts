import { domainNodes, entitiesFromJsonLd, type JsonLdNode } from "./jsonLd.js";
import type { MarkupOutcome, MarkupPageInput, MarkupProvider, MarkupTotals, MarkupUsage } from "./MarkupProvider.js";

/**
 * WordLift's own entity extraction, Content Analysis v3: multilingual named-entity recognition
 * with Wikidata linking, on WordLift's infrastructure, behind the same interface the Gemini
 * stand-in used. It is asked for the things a business is made of, by name, with a label set
 * that says so; what it finds becomes inferred entities, never evidence, never readiness. A
 * Wikidata link travels only when the linker is sure of it: a place in Lungau linked to an
 * Italian comune at the floor score is a guess, and a guess is worse than no link.
 *
 * Nothing here can be invented. The recogniser returns spans of the text it was sent, and every
 * name is checked against that text before it becomes an entity; a name that is not on the page
 * is dropped, whatever the service says. Descriptions and links come only from Wikidata, only
 * when the linker is sure, and offers and prices are never generated at all.
 */
export interface ContentAnalysisOptions {
  /** The WordLift API key: the service authenticates as `Key <key>`. */
  apiKey: string;
  endpoint?: string;
  /** The extraction confidence asked of the service, and the floor an entity must reach to be kept. */
  confidence?: number;
  /** A Wikidata link is kept only from this disambiguation score up. */
  linkConfidence?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export const CONTENT_ANALYSIS_ENDPOINT = "https://wordlift-lab--content-analysis-v3-web-app.modal.run";
/** Above the noise at 0.51 ("Breakfast", "two-bedroom family apartment"), below a real product at 0.56 ("Wordlift Agent"). */
const DEFAULT_CONFIDENCE = 0.55;
const DEFAULT_LINK_CONFIDENCE = 0.7;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TEXT_CHARACTERS = 12_000;
const MAX_ENTITIES = 20;

/**
 * The things a business is made of, asked for by name. The zero-shot recogniser takes labels as
 * instructions, so a travel site is asked for its stays, tours and passes, a shop for its products
 * and brands, a software company for its plans and integrations. What every site is asked for
 * comes first; the rest depends on what kind of site the audit is reading.
 */
export const ENTITY_LABELS = ["Organization", "Person", "Place", "City", "Region", "Country", "Product", "Service", "Offer", "Event", "Brand"] as const;

const LABELS_BY_SITE_TYPE: Record<string, readonly string[]> = {
  "travel-hospitality": ["Apartment", "Hotel", "Resort", "Accommodation", "Attraction", "Tour", "Pass", "Package", "Restaurant", "Ski area", "Lake", "Mountain"],
  "commerce-retail": ["Collection", "Store", "Discount", "Bundle", "Model"],
  saas: ["Plan", "Integration", "Platform", "Tool", "API", "Company"],
  "publisher-content": ["Article", "Author", "Publication", "Series", "Podcast"],
  "finance-insurance": ["Plan", "Policy", "Bank", "Insurer", "Fund", "Account", "Card"],
};

/** The labels for a page: what every site is asked for, then what this kind of site is made of. */
export function labelsFor(siteType?: string): string[] {
  return [...ENTITY_LABELS, ...(siteType ? (LABELS_BY_SITE_TYPE[siteType] ?? []) : [])];
}

/**
 * The service's labels as schema.org types, the vocabulary the rest of the map speaks. A country
 * is where a business is, not what it is. Every geographic label becomes Place: the recogniser
 * calls Lungau a city on one page and a place on the next, and the map merges across pages by
 * name and type, so one type for places is what keeps one Lungau one Lungau.
 */
const SCHEMA_TYPES: Record<string, string> = {
  Organization: "Organization",
  Company: "Organization",
  Person: "Person",
  Place: "Place",
  Location: "Place",
  City: "Place",
  Region: "Place",
  Attraction: "Place",
  Product: "Product",
  Service: "Service",
  Offer: "Offer",
  Apartment: "Apartment",
  Hotel: "Hotel",
  Resort: "Resort",
  Accommodation: "Accommodation",
  Tour: "TouristTrip",
  Pass: "Product",
  Package: "Offer",
  Restaurant: "Restaurant",
  "Ski area": "Place",
  Lake: "Place",
  Mountain: "Place",
  Collection: "ProductGroup",
  Store: "Store",
  Discount: "Offer",
  Bundle: "Offer",
  Model: "Product",
  Plan: "Product",
  Integration: "SoftwareApplication",
  Platform: "SoftwareApplication",
  Tool: "SoftwareApplication",
  API: "SoftwareApplication",
  Article: "Article",
  Author: "Person",
  Publication: "Organization",
  Series: "CreativeWork",
  Podcast: "CreativeWork",
  Policy: "Product",
  Bank: "Organization",
  Insurer: "Organization",
  Fund: "Product",
  Account: "Product",
  Card: "Product",
  Event: "Event",
  Brand: "Brand",
  Book: "Book",
  Movie: "Movie",
  Song: "MusicRecording",
  CreativeWork: "CreativeWork",
  SportsTeam: "SportsTeam",
};

/** Role nouns the recogniser reads as people, and the generic phrases it reads as things. Neither is an entity. */
const NOT_A_NAME = /^(guests?|visitors?|customers?|users?|members?|teams?|staff|family|families|children|kids|adults?|people|clients?|partners?|travellers?|travelers?|owners?|hosts?|breakfast|lunch|dinner|summer|winter|spring|autumn|fall|weekend|holidays?|vacations?)$/i;

interface AnalysedEntity {
  text?: unknown;
  label?: unknown;
  score?: unknown;
  entity_id?: unknown;
  entity_label?: unknown;
  entity_description?: unknown;
  disambiguation_score?: unknown;
}

interface AnalysisResponse {
  entities?: unknown;
  language?: unknown;
  text_length?: unknown;
  pipeline_version?: unknown;
}

export class ContentAnalysisProvider implements MarkupProvider {
  readonly name = "content-analysis";
  readonly model = "content-analysis-v3";
  readonly #totals: MarkupTotals = { pages: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };

  constructor(private readonly options: ContentAnalysisOptions) {}

  async generate(page: MarkupPageInput): Promise<MarkupOutcome> {
    const fetchImpl = this.options.fetch ?? fetch;
    const confidence = this.options.confidence ?? DEFAULT_CONFIDENCE;
    const text = textOf(page);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(`${(this.options.endpoint ?? CONTENT_ANALYSIS_ENDPOINT).replace(/\/$/, "")}/analyze/text`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Key ${this.options.apiKey}` },
        body: JSON.stringify({ text, confidence: Math.min(confidence, 0.5), labels: labelsFor(page.siteType) }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error instanceof Error && error.name === "AbortError" ? "Content analysis did not answer in time" : "Content analysis could not be reached");
    } finally {
      clearTimeout(timer);
    }
    // The service's error body may quote the text it was sent; only the status travels on.
    if (!response.ok) throw new Error(`Content analysis refused the page (HTTP ${response.status})`);
    const payload = (await response.json().catch(() => null)) as AnalysisResponse | null;
    const found = Array.isArray(payload?.entities) ? (payload.entities as AnalysedEntity[]) : [];

    const issues: string[] = [];
    const nodes = nodesFrom(found, confidence, this.options.linkConfidence ?? DEFAULT_LINK_CONFIDENCE, issues, text);
    const entities = entitiesFromJsonLd(domainNodes(nodes, issues), page.url);
    // The service meters nothing and runs on WordLift's own infrastructure: the count is what is
    // known. Characters in, entities out, and no list price to multiply.
    const usage: MarkupUsage = { inputTokens: text.length, outputTokens: entities.length, estimatedUsd: 0 };
    this.#totals.pages += 1;
    this.#totals.inputTokens += usage.inputTokens;
    this.#totals.outputTokens += usage.outputTokens;
    return { entities, issues, usage, model: typeof payload?.pipeline_version === "string" ? `content-analysis-v3/${payload.pipeline_version}` : this.model };
  }

  totals(): MarkupTotals {
    return { ...this.#totals };
  }
}

function textOf(page: MarkupPageInput): string {
  return [page.title, page.description, ...page.headings.slice(0, 40), page.text]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join("\n")
    .slice(0, MAX_TEXT_CHARACTERS);
}

/** What the service found, as nodes the markup path already knows how to filter and merge. */
export function nodesFrom(found: AnalysedEntity[], confidence: number, linkConfidence: number, issues: string[], text?: string): JsonLdNode[] {
  const nodes = new Map<string, JsonLdNode>();
  const haystack = text?.toLowerCase();
  let belowFloor = 0;
  let notNames = 0;
  let notOnPage = 0;
  for (const entity of found) {
    const name = typeof entity.text === "string" ? entity.text.trim() : "";
    const label = typeof entity.label === "string" ? entity.label : "";
    const score = typeof entity.score === "number" ? entity.score : 0;
    if (!name || !label) continue;
    if (score < confidence) {
      belowFloor += 1;
      continue;
    }
    // A name has a capital somewhere; a generic phrase or a role noun is not a thing the business is.
    if (NOT_A_NAME.test(name) || !/\p{Lu}/u.test(name)) {
      notNames += 1;
      continue;
    }
    if (label === "Country") {
      notNames += 1;
      continue;
    }
    // A name the page does not contain is not the page's: whatever produced it, it does not enter.
    if (haystack !== undefined && !haystack.includes(name.toLowerCase())) {
      notOnPage += 1;
      continue;
    }
    const type = SCHEMA_TYPES[label] ?? label;
    // One name is one thing: the recogniser labelling "Lungau" a city here and a place there is one Lungau.
    const key = name.toLowerCase();
    if (nodes.has(key)) continue;

    const linked = typeof entity.entity_id === "string" && /^Q\d+$/.test(entity.entity_id) && typeof entity.disambiguation_score === "number" && entity.disambiguation_score >= linkConfidence;
    const canonical = linked && typeof entity.entity_label === "string" ? entity.entity_label.trim() : "";
    nodes.set(key, {
      types: [type],
      name,
      alternateNames: canonical && canonical.toLowerCase() !== name.toLowerCase() ? [canonical] : [],
      ...(linked && typeof entity.entity_description === "string" && entity.entity_description.trim() ? { description: entity.entity_description.trim() } : {}),
      sameAs: linked ? [`https://www.wikidata.org/wiki/${entity.entity_id as string}`] : [],
      offers: [],
    });
    if (nodes.size >= MAX_ENTITIES) break;
  }
  // "Samspitze 4Enter" is "Samspitze 4" with a button label glued on by the page's text: the shorter name is the thing.
  const kept = [...nodes.values()];
  const glued = kept.filter((node) => kept.some((other) => other !== node && node.name.length > other.name.length && node.name.startsWith(other.name) && !/^[\s,.;:()-]/.test(node.name.slice(other.name.length))));
  if (belowFloor > 0) issues.push(`${belowFloor} ${belowFloor === 1 ? "entity" : "entities"} below the confidence floor`);
  if (notNames + glued.length > 0) issues.push(`${notNames + glued.length} ${notNames + glued.length === 1 ? "mention" : "mentions"} skipped as not a name`);
  if (notOnPage > 0) issues.push(`${notOnPage} ${notOnPage === 1 ? "name" : "names"} dropped as not on the page`);
  return kept.filter((node) => !glued.includes(node));
}

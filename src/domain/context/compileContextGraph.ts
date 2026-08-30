import type { SitePageSnapshot } from "../../server/adapters/scrape/ScrapeProvider.js";
import type {
  ActionInterface,
  CapabilityEvidence,
  CapabilityResult,
  ContentCategory,
  ContextGraph,
  DomainEntity,
} from "../../shared/types/index.js";

const ENTITY_ACTIONS: Record<string, string[]> = {
  Organization: ["site.browse", "site.search", "source.verify", "inquiry.submit", "policy.explain"],
  LocalBusiness: ["detail.retrieve", "site.search", "inquiry.submit", "availability.check"],
  LodgingBusiness: ["detail.retrieve", "offer.lookup", "availability.check", "items.compare", "items.recommend", "checkout.create"],
  Hotel: ["detail.retrieve", "offer.lookup", "availability.check", "items.compare", "items.recommend", "checkout.create"],
  Resort: ["detail.retrieve", "offer.lookup", "availability.check", "items.compare", "items.recommend", "checkout.create"],
  Apartment: ["detail.retrieve", "offer.lookup", "availability.check", "checkout.create"],
  Accommodation: ["detail.retrieve", "offer.lookup", "availability.check", "checkout.create"],
  Product: ["detail.retrieve", "offer.lookup", "items.compare", "items.recommend", "checkout.create"],
  ProductGroup: ["detail.retrieve", "items.compare", "items.recommend"],
  Service: ["detail.retrieve", "offer.lookup", "items.compare", "inquiry.submit"],
  SoftwareApplication: ["detail.retrieve", "features.search", "plans.compare", "trial.start", "support.request"],
  WebApplication: ["detail.retrieve", "features.search", "plans.compare", "trial.start", "support.request"],
  Article: ["detail.retrieve", "source.verify", "site.search", "content.related"],
  NewsArticle: ["detail.retrieve", "source.verify", "site.search", "content.related"],
  BlogPosting: ["detail.retrieve", "source.verify", "site.search", "content.related"],
  Person: ["source.verify", "detail.retrieve"],
  FinancialService: ["detail.retrieve", "eligibility.explain", "plans.compare", "quote.request", "application.start"],
  InsuranceAgency: ["eligibility.explain", "plans.compare", "quote.request", "application.start", "inquiry.submit"],
  Event: ["detail.retrieve", "availability.check", "checkout.create"],
  Place: ["detail.retrieve", "site.search"],
};

export function compileContextGraph(
  pages: SitePageSnapshot[],
  categories: ContentCategory[],
  capabilities: CapabilityResult[],
  canonicalUrl: string,
): ContextGraph {
  const entities = mergeEntities(pages, canonicalUrl);
  const actionIdsByEntity = new Map(
    entities.map((entity) => [
      entity.id,
      new Set(
        entity.types.includes("WebSite")
          ? capabilities.map((capability) => capability.actionId)
          : entity.types.flatMap((type) => ENTITY_ACTIONS[type] ?? []),
      ),
    ]),
  );
  const interfaces = capabilities.flatMap((capability) =>
    capability.evidence.map((evidence) => interfaceFrom(evidence, capability, entities, actionIdsByEntity)),
  );
  const bindings = entities.flatMap((entity) =>
    capabilities
      .filter((capability) => actionIdsByEntity.get(entity.id)?.has(capability.actionId))
      .map((capability) => {
        const evidence = capability.evidence.filter((item) => evidenceApplies(item, entity));
        const interfaceIds = interfaces
          .filter((item) => item.actionId === capability.actionId && item.entityIds.includes(entity.id))
          .map((item) => item.id);
        const basis = new Set<"archetype" | "structured-data" | "observed-interface">(["archetype"]);
        if (evidence.some((item) => item.kind === "structured-data")) basis.add("structured-data");
        if (evidence.some((item) => item.kind !== "structured-data")) basis.add("observed-interface");
        return {
          entityId: entity.id,
          actionId: capability.actionId,
          role: entity.types.some((type) => type === "Organization" || type === "WebSite")
            ? ("provider" as const)
            : ("object" as const),
          basis: [...basis],
          state: capability.state,
          evidenceIds: evidence.map((item) => item.id),
          interfaceIds,
          confidence: capability.agentSupport ? 1 : evidence.length > 0 ? 0.9 : 0.7,
        };
      }),
  );

  const auditedPages = pages.length > 0 ? pages : [emptyPage(canonicalUrl)];
  return {
    pages: auditedPages.slice(0, 4).map((page) => ({
      url: page.url,
      title: page.title,
      role: page.role,
      description: page.description || undefined,
      headings: page.headings.slice(0, 20),
      entityIds: entities.filter((entity) => entity.sourceUrls.includes(page.url)).map((entity) => entity.id),
    })),
    entities,
    lexicalEntries: compileLexicalEntries(auditedPages, categories, entities),
    interfaces: dedupeInterfaces(interfaces),
    bindings: bindings.slice(0, 240),
  };
}

export function appliesToForAction(context: ContextGraph, actionId: string) {
  const matches = context.bindings.filter((binding) => binding.actionId === actionId);
  const objects = matches.filter((binding) => binding.role === "object");
  const concreteProviders = matches.filter((binding) => {
    const entity = context.entities.find((candidate) => candidate.id === binding.entityId);
    return binding.role === "provider" && !entity?.types.includes("WebSite");
  });
  const preferred = objects.length > 0 ? objects : concreteProviders.length > 0 ? concreteProviders : matches;
  const ids = new Set(preferred.map((binding) => binding.entityId));
  return context.entities
    .filter((entity) => ids.has(entity.id))
    .map((entity) => ({ id: entity.id, name: entity.name, types: entity.types }));
}

/** Revisions keep the same entity/lexical graph while invocation evidence advances interfaces and bindings. */
export function refreshContextGraph(context: ContextGraph, capabilities: CapabilityResult[]): ContextGraph {
  const entityActions = new Map<string, Set<string>>();
  for (const binding of context.bindings) {
    const actions = entityActions.get(binding.entityId) ?? new Set<string>();
    actions.add(binding.actionId);
    entityActions.set(binding.entityId, actions);
  }
  const generated = capabilities.flatMap((capability) =>
    capability.evidence.map((evidence) => interfaceFrom(evidence, capability, context.entities, entityActions)),
  );
  const interfaces = dedupeInterfaces([...context.interfaces, ...generated]);
  const byAction = new Map(capabilities.map((capability) => [capability.actionId, capability]));
  const bindings = context.bindings.map((binding) => {
    const capability = byAction.get(binding.actionId);
    if (!capability) return binding;
    const evidence = capability.evidence.filter((item) => {
      const entity = context.entities.find((candidate) => candidate.id === binding.entityId);
      return entity ? evidenceApplies(item, entity) : false;
    });
    return {
      ...binding,
      state: capability.state,
      evidenceIds: evidence.map((item) => item.id),
      interfaceIds: interfaces
        .filter((item) => item.actionId === binding.actionId && item.entityIds.includes(binding.entityId))
        .map((item) => item.id),
      confidence: capability.agentSupport ? 1 : evidence.length > 0 ? 0.9 : binding.confidence,
    };
  });
  return { ...context, interfaces, bindings: bindings.slice(0, 240) };
}

function mergeEntities(pages: SitePageSnapshot[], canonicalUrl: string): DomainEntity[] {
  const byId = new Map<string, DomainEntity>();
  for (const page of pages) {
    for (const extracted of page.entities) {
      const existing = byId.get(extracted.id);
      const next: DomainEntity = {
        id: extracted.id,
        types: unique([...(existing?.types ?? []), ...extracted.types]).slice(0, 12),
        name: existing?.name ?? extracted.name,
        alternateNames: unique([...(existing?.alternateNames ?? []), ...extracted.alternateNames]).slice(0, 20),
        description: existing?.description ?? extracted.description,
        sourceUrls: unique([...(existing?.sourceUrls ?? []), extracted.sourceUrl]).slice(0, 12),
        sameAs: unique([...(existing?.sameAs ?? []), ...extracted.sameAs]).slice(0, 12),
        offers: [...(existing?.offers ?? []), ...extracted.offers].slice(0, 12),
        confidence: 0.95,
      };
      byId.set(extracted.id, next);
    }
  }
  const websiteId = `${new URL(canonicalUrl).origin}/#website`;
  if (![...byId.values()].some((entity) => entity.types.includes("WebSite"))) {
    const sourceUrls = unique((pages.length > 0 ? pages : [emptyPage(canonicalUrl)]).map((page) => page.url)).slice(0, 12);
    byId.set(websiteId, {
      id: websiteId,
      types: ["WebSite"],
      name: pages[0]?.title.trim() || new URL(canonicalUrl).hostname,
      alternateNames: [],
      description: pages[0]?.description || undefined,
      sourceUrls,
      sameAs: [],
      offers: [],
      confidence: pages.length > 0 ? 0.8 : 0.6,
    });
  }
  return [...byId.values()].sort((left, right) => entityRank(left) - entityRank(right) || left.name.localeCompare(right.name)).slice(0, 80);
}

function compileLexicalEntries(
  pages: SitePageSnapshot[],
  categories: ContentCategory[],
  entities: DomainEntity[],
): ContextGraph["lexicalEntries"] {
  const entries: ContextGraph["lexicalEntries"] = categories.slice(0, 12).map((category) => ({
    id: `category:${slug(category.name)}`,
    label: category.name.split("/").filter(Boolean).at(-1) ?? category.name,
    aliases: category.name.split("/").filter(Boolean).slice(0, -1),
    kind: "category" as const,
    entityIds: [],
    sourceUrls: pages.slice(0, 1).map((page) => page.url),
    confidence: category.confidence,
  }));
  for (const entity of entities) {
    entries.push({
      id: `entity-name:${slug(entity.id)}`,
      label: entity.name,
      aliases: entity.alternateNames,
      kind: "entity-name",
      entityIds: [entity.id],
      sourceUrls: entity.sourceUrls,
      confidence: entity.confidence,
    });
  }
  const seen = new Set(entries.map((entry) => entry.label.toLowerCase()));
  for (const page of pages) {
    for (const heading of page.headings.slice(0, 8)) {
      const normalized = heading.trim();
      if (normalized.length < 4 || normalized.length > 100 || seen.has(normalized.toLowerCase())) continue;
      seen.add(normalized.toLowerCase());
      entries.push({
        id: `topic:${slug(normalized)}`,
        label: normalized,
        aliases: [],
        kind: "topic",
        entityIds: entities.filter((entity) => entity.sourceUrls.includes(page.url)).map((entity) => entity.id),
        sourceUrls: [page.url],
        confidence: 0.7,
      });
      if (entries.length >= 100) return entries;
    }
  }
  return entries;
}

function interfaceFrom(
  evidence: CapabilityEvidence,
  capability: CapabilityResult,
  entities: DomainEntity[],
  actionIdsByEntity: Map<string, Set<string>>,
): ActionInterface {
  return {
    id: `interface:${evidence.id}`,
    actionId: capability.actionId,
    entityIds: entities.filter((entity) => actionIdsByEntity.get(entity.id)?.has(capability.actionId)).map((entity) => entity.id),
    name: interfaceName(evidence, capability.label),
    protocol: protocolFor(evidence),
    audience: evidence.audience,
    status: evidence.verification,
    sourceUrl: evidence.sourceUrl,
    evidenceId: evidence.id,
  };
}

function interfaceName(evidence: CapabilityEvidence, fallback: string): string {
  const quoted = evidence.claim.match(/"([^"]+)"/)?.[1];
  return (quoted ?? `${fallback} via ${protocolFor(evidence).replaceAll("-", " ")}`).slice(0, 300);
}

function protocolFor(evidence: CapabilityEvidence): ActionInterface["protocol"] {
  if (evidence.kind === "page") return "human-page";
  if (evidence.kind === "form") return "human-form";
  if (evidence.kind === "structured-data") return "structured-data";
  if (evidence.kind === "webmcp") return "webmcp";
  if (evidence.kind === "openapi") return "openapi";
  if (evidence.kind === "api-result") return "api";
  if (evidence.kind === "tool-result") return evidence.sourceUrl.includes("/mcp") ? "mcp" : "api";
  return evidence.sourceUrl.includes("/mcp") ? "mcp" : "agent-document";
}

function evidenceApplies(evidence: CapabilityEvidence, entity: DomainEntity): boolean {
  if (entity.sourceUrls.includes(evidence.sourceUrl)) return true;
  return evidence.kind === "structured-data" && entity.types.some((type) => evidence.claim.includes(type));
}

function entityRank(entity: DomainEntity): number {
  if (entity.types.includes("WebSite")) return -1;
  if (entity.types.includes("Organization")) return 0;
  if (entity.offers.length > 0) return 1;
  return 2;
}

function emptyPage(url: string): SitePageSnapshot {
  return {
    url,
    title: new URL(url).hostname,
    description: "",
    role: "entry",
    text: "",
    headings: [],
    linkPaths: [],
    linkLabels: [],
    forms: [],
    jsonLdTypes: [],
    entities: [],
    pageTools: [],
    truncated: false,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function dedupeInterfaces(values: ActionInterface[]): ActionInterface[] {
  return [...new Map(values.map((item) => [item.id, item])).values()].slice(0, 120);
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "unknown";
}

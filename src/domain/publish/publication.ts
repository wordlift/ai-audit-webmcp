import { entityJsonLd } from "../../shared/format/entityJsonLd.js";
import type { ActionBoundary, CapabilityEvidence, CapabilityResult, ContextGraph, DomainEntity, ReportRecord } from "../../shared/types/index.js";
import type { EntryProtocol, Publication, PublishedAction, PublishedAs, PublishedEntryPoint } from "../../shared/types/activate.js";
import { ARD, ardManifestSchema, type ArdEntry, type ArdManifest } from "./ardSchema.js";

export type { EntryProtocol, Publication, PublishedAction, PublishedAs, PublishedEntryPoint };

/**
 * Activate: one model, rendered three ways. The page JSON-LD for finding, the skill for acting,
 * the catalog for discovery. What the owner decided and what the audit could call decide what
 * each document says; nothing is declared that the audit could not call, and no document claims
 * that an action works: readiness is stated in the report, and cited from here.
 */
export interface PublicationOptions {
  /** The report's page, cited for readiness. */
  reportUrl: string;
  /** The report's API root, absolute: the documents are served beneath it. */
  apiUrl: string;
  /** Where WordLift runs an interface for this site, by action, for what a sidecar verified. */
  sidecarEndpoints?: Record<string, string>;
  now?: () => Date;
}


export const WLCAP_CONTEXT = { wlcap: "https://wordlift.io/vocab/agent-capability/" } as const;

/** The schema.org action each action in the model is published as. Verify-by-calling reads the same types back. */
export const SCHEMA_ACTION_TYPES: Record<string, string> = {
  "site.search": "SearchAction",
  "site.browse": "DiscoverAction",
  "detail.retrieve": "ViewAction",
  "items.compare": "ChooseAction",
  "items.recommend": "ChooseAction",
  "policy.explain": "ReadAction",
  "offer.lookup": "CheckAction",
  "availability.check": "CheckAction",
  "inquiry.submit": "CommunicateAction",
  "checkout.create": "ReserveAction",
  "checkout.complete": "BuyAction",
  "transaction.status": "TrackAction",
  "transaction.modify": "UpdateAction",
  "content.related": "DiscoverAction",
  "source.verify": "ReadAction",
  "subscription.start": "SubscribeAction",
  "subscription.manage": "UpdateAction",
  "eligibility.explain": "ReadAction",
  "quote.request": "QuoteAction",
  "application.start": "ApplyAction",
  "features.search": "SearchAction",
  "plans.compare": "ChooseAction",
  "trial.start": "RegisterAction",
  "support.request": "CommunicateAction",
};

/** The organisation type an operating role, in the owner's words, maps onto. Anything else stays an Organization that names its role. */
const ROLE_TYPES: ReadonlyArray<[RegExp, string]> = [
  [/\b(hotel|lodging|accommodation|resort)\b/i, "LodgingBusiness"],
  [/\b(destination|tourism|tourist)\b/i, "TouristInformationCenter"],
  [/\btravel\b/i, "TravelAgency"],
  [/\bmarketplace\b/i, "OnlineStore"],
  [/\b(merchant|retailer|shop|store)\b/i, "Store"],
  [/\b(publisher|newsroom|news|magazine)\b/i, "NewsMediaOrganization"],
  [/\binsur/i, "InsuranceAgency"],
  [/\b(bank|credit union)\b/i, "BankOrCreditUnion"],
];

export function organizationType(role: string | undefined): string {
  if (!role) return "Organization";
  return ROLE_TYPES.find(([pattern]) => pattern.test(role.replaceAll("-", " ")))?.[1] ?? "Organization";
}

/** The table in the plan: what the owner decided and what the audit called become what the page carries. */
export function publishedAs(capability: CapabilityResult): { publishedAs: PublishedAs; because: string } {
  const boundary = capability.boundary ?? null;
  if (boundary === "not-applicable") return { publishedAs: "nothing", because: "You said this is not yours. Nothing is published for it." };
  if (!capability.expected) {
    return capability.expectationSource.includes("human:decision")
      ? { publishedAs: "nothing", because: "You said this is not yours. Nothing is published for it." }
      : { publishedAs: "nothing", because: "This kind of site is not expected to offer it. Nothing is published for it." };
  }
  if (boundary === "partner-handoff") {
    return { publishedAs: "handoff", because: "You said a partner runs it. The action is published with the partner as its provider." };
  }
  if (boundary === "informational-only") {
    return { publishedAs: "entity", because: "You said you only describe it. The entity is published, no action." };
  }
  if (capability.state === "agent-ready") {
    return {
      publishedAs: "action",
      because:
        boundary === "owned"
          ? "You own it and an entry point answered. The action is published with its entry point."
          : "An entry point answered when the audit called it. The action is published with its entry point.",
    };
  }
  if (boundary === "owned") {
    return { publishedAs: "entity", because: "You own it, but no entry point has answered yet. The entity is published, no action, until one does." };
  }
  return { publishedAs: "entity", because: "No entry point has answered yet, so nothing is declared that an agent could not call." };
}

/** Declared entities in full, inferred ones only when the owner promoted them, demoted ones never. */
export function publishableEntities(entities: DomainEntity[]): DomainEntity[] {
  return entities.filter((entity) => entity.humanPriority !== "demoted" && (entity.origin !== "inferred" || entity.humanPriority === "primary"));
}

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "");
}

/** The address the audit called, from the evidence an agent-ready action carries. */
function entryPointFor(capability: CapabilityResult, graph: ContextGraph | undefined, options: PublicationOptions): PublishedEntryPoint | null {
  const invoked = capability.evidence.filter((item) => item.verification === "invoked" && item.audience === "agent");
  if (invoked.length === 0) return null;
  if (capability.via === "sidecar" || invoked.some((item) => item.id.startsWith("sidecar:"))) {
    const url = options.sidecarEndpoints?.[capability.actionId];
    return url ? { url, protocol: "sidecar", httpMethod: "POST", via: "sidecar" } : null;
  }
  // A template, when the audit kept one, is what an agent needs; a filled URL is only an example.
  const withTemplate = invoked.find((item) => templateIn(item));
  const evidence = withTemplate ?? invoked[0]!;
  const declared = graph?.interfaces.find((entry) => entry.evidenceId === evidence.id);
  const protocol: EntryProtocol =
    declared?.protocol === "mcp" || evidence.kind === "tool-result" ? "mcp" : declared?.protocol === "webmcp" || evidence.kind === "webmcp" ? "webmcp" : "http";
  const template = templateIn(evidence);
  const tool = /^mcp-call-(.+)$/.exec(evidence.id)?.[1];
  return {
    url: evidence.sourceUrl,
    ...(template ? { urlTemplate: template } : {}),
    protocol,
    httpMethod: protocol === "mcp" ? "POST" : "GET",
    via: "site",
    ...(tool ? { tool } : {}),
  };
}

function templateIn(evidence: CapabilityEvidence): string | undefined {
  const snippet = evidence.snippet?.trim();
  return snippet && /^https?:\/\/\S+\{[^}]+\}\S*$/.test(snippet) ? snippet : undefined;
}

function publishedAction(capability: CapabilityResult, graph: ContextGraph | undefined, options: PublicationOptions): PublishedAction {
  const verdict = publishedAs(capability);
  const base = { actionId: capability.actionId, label: capability.label, state: capability.state, boundary: capability.boundary ?? null };
  if (verdict.publishedAs === "action") {
    const entryPoint = entryPointFor(capability, graph, options);
    if (!entryPoint) {
      return { ...base, publishedAs: "entity", because: "It answered, but the audit kept no address an agent could call. The entity is published, no action." };
    }
    return { ...base, ...verdict, entryPoint };
  }
  if (verdict.publishedAs === "handoff" && capability.boundaryPartner) {
    return { ...base, ...verdict, provider: capability.boundaryPartner };
  }
  return { ...base, ...verdict };
}

/** One published action as a schema.org node, with its entry point or its provider. */
function actionNode(action: PublishedAction, capability: CapabilityResult, origin: string): Record<string, unknown> {
  const type = SCHEMA_ACTION_TYPES[action.actionId] ?? "Action";
  const node: Record<string, unknown> = {
    "@type": type,
    "@id": `${origin}/#action-${action.actionId}`,
    name: capability.label,
    description: capability.description,
    "wlcap:actionId": action.actionId,
    ...(action.boundary ? { "wlcap:boundary": action.boundary } : {}),
  };
  if (action.publishedAs === "action" && action.entryPoint) {
    const entry = action.entryPoint;
    node.target = {
      "@type": "EntryPoint",
      ...(entry.urlTemplate ? { urlTemplate: entry.urlTemplate } : { url: entry.url }),
      httpMethod: entry.httpMethod,
      ...(entry.protocol === "http" ? {} : { contentType: "application/json", encodingType: "application/json" }),
      "wlcap:protocol": entry.protocol,
      ...(entry.tool ? { "wlcap:tool": entry.tool } : {}),
    };
    const placeholder = entry.urlTemplate ? /\{([^}]+)\}/.exec(entry.urlTemplate)?.[1] : undefined;
    if (placeholder) node["query-input"] = `required name=${placeholder}`;
    if (entry.via === "sidecar") node.provider = { "@type": "Organization", name: "WordLift", url: "https://wordlift.io" };
  }
  if (action.publishedAs === "handoff" && action.provider) {
    node.provider = { "@type": "Organization", name: action.provider.name, ...(action.provider.url ? { url: action.provider.url } : {}) };
    if (action.provider.url) node.target = { "@type": "EntryPoint", url: action.provider.url };
  }
  return node;
}

interface Nodes {
  website: Record<string, unknown>;
  organization: Record<string, unknown> | null;
  entities: Map<string, Record<string, unknown>>;
}

function graphNodes(report: ReportRecord, entities: DomainEntity[], origin: string, host: string): Nodes {
  const nodes = new Map<string, Record<string, unknown>>();
  for (const entity of entities) nodes.set(entity.id, entityJsonLd(entity));
  const ofType = (type: string) => entities.find((entity) => entity.types.includes(type));

  const websiteEntity = ofType("WebSite");
  const website = websiteEntity
    ? nodes.get(websiteEntity.id)!
    : { "@type": "WebSite", "@id": `${origin}/#website`, url: `${origin}/`, name: report.contextGraph?.pages[0]?.title || host };
  if (!websiteEntity) nodes.set(website["@id"] as string, website);

  const role = report.classification?.businessRole;
  const organizationEntity = ofType("Organization");
  let organization: Record<string, unknown> | null = organizationEntity ? nodes.get(organizationEntity.id)! : null;
  if (!organization && role) {
    organization = { "@type": "Organization", "@id": `${origin}/#organization`, url: `${origin}/`, name: host };
    nodes.set(organization["@id"] as string, organization);
  }
  if (organization && role) {
    // The operating role, in the owner's words, becomes the organisation's type when one fits it.
    const type = organizationType(role);
    const types = new Set([...(Array.isArray(organization["@type"]) ? organization["@type"] : [organization["@type"]]).filter((item): item is string => typeof item === "string")]);
    if (type !== "Organization") {
      types.delete("Organization");
      types.add(type);
    }
    organization["@type"] = types.size === 1 ? [...types][0] : [...types];
    organization["wlcap:operatingRole"] = role;
    if (!website.publisher && organization["@id"] !== website["@id"]) website.publisher = { "@id": organization["@id"] };
  }
  return { website, organization, entities: nodes };
}

function pageJsonLd(report: ReportRecord, entities: DomainEntity[], actions: PublishedAction[], origin: string, host: string): Record<string, unknown> {
  const capabilities = new Map((report.capabilities ?? []).map((capability) => [capability.actionId, capability]));
  const { website, entities: nodes } = graphNodes(report, entities, origin, host);

  for (const action of actions) {
    if (action.publishedAs !== "action" && action.publishedAs !== "handoff") continue;
    const capability = capabilities.get(action.actionId)!;
    // The action goes on the entity that answers for it, when that entity is published; else on the site.
    const subject = capability.appliesTo.map((entry) => nodes.get(entry.id)).find((node) => node && node !== website) ?? website;
    const list = Array.isArray(subject.potentialAction) ? (subject.potentialAction as unknown[]) : [];
    subject.potentialAction = [...list, actionNode(action, capability, origin)];
  }

  const terms = (report.contextGraph?.lexicalEntries ?? []).filter((entry) => entry.provenance === "human-provided");
  const vocabulary =
    terms.length > 0
      ? {
          "@type": "DefinedTermSet",
          "@id": `${origin}/#vocabulary`,
          name: `${host} vocabulary`,
          hasDefinedTerm: terms.map((term) => ({
            "@type": "DefinedTerm",
            name: term.label,
            ...(term.meaning ? { description: term.meaning } : {}),
            ...(term.aliases.length > 0 ? { alternateName: term.aliases } : {}),
          })),
        }
      : null;

  return {
    "@context": ["https://schema.org", WLCAP_CONTEXT],
    "@graph": [website, ...[...nodes.values()].filter((node) => node !== website), ...(vocabulary ? [vocabulary] : [])],
  };
}

const OWN_WORDS: Record<ActionBoundary, string> = {
  owned: "ours",
  "partner-handoff": "a partner runs it",
  "informational-only": "described only",
  "not-applicable": "not ours",
};

function howToCall(entry: PublishedEntryPoint): string[] {
  switch (entry.protocol) {
    case "http": {
      const placeholder = entry.urlTemplate ? /\{([^}]+)\}/.exec(entry.urlTemplate)?.[1] : undefined;
      return [
        `- How to call it: \`GET ${entry.urlTemplate ?? entry.url}\`${placeholder ? `, filling \`{${placeholder}}\` with the query.` : "."}`,
      ];
    }
    case "mcp":
      return [
        `- How to call it: an MCP server at ${entry.url} (Streamable HTTP; JSON-RPC over POST)${entry.tool ? `, tool \`${entry.tool}\`` : ""}.`,
      ];
    case "webmcp":
      return [`- How to call it: an in-page tool on ${entry.url}, registered through WebMCP; open the page in a WebMCP-enabled browser.`];
    case "sidecar":
      return [`- How to call it: POST JSON to ${entry.url}. WordLift runs this interface for the site.`];
  }
}

/** The Terms of Action as a file an agent loads before acting. States boundaries, cites the report for readiness, claims nothing. */
function skillMarkdown(report: ReportRecord, entities: DomainEntity[], actions: PublishedAction[], host: string, options: PublicationOptions, publishedAt: string): string {
  const capabilities = new Map((report.capabilities ?? []).map((capability) => [capability.actionId, capability]));
  const role = report.classification?.businessRole;
  const archetype = report.classification?.primaryArchetype;
  const terms = (report.contextGraph?.lexicalEntries ?? []).filter((entry) => entry.provenance === "human-provided");
  const published = actions.filter((action) => action.publishedAs === "action" || action.publishedAs === "handoff");
  const described = actions.filter((action) => action.publishedAs === "entity");
  const excluded = actions.filter((action) => action.publishedAs === "nothing" && action.because.startsWith("You said"));
  const writes = published.filter((action) => {
    const governance = capabilities.get(action.actionId)?.contract?.governance;
    return capabilities.get(action.actionId)?.intent === "transactional" || governance?.requiresConfirmation || (governance && governance.sideEffects !== "none");
  });

  const lines: string[] = [
    "---",
    `name: ${host} Terms of Action`,
    `description: How an AI agent should act on ${host}: what the business is, what it offers, who runs each action, and how to call the interfaces it publishes.`,
    "---",
    "",
    `# ${host}: Terms of Action`,
    "",
    `Whether any interface named here answers today is stated in the report and nowhere else: ${options.reportUrl}. This file says what the business is, who is responsible for each action, and where an interface is; it never says whether an action answers today.`,
    "",
    `Published ${publishedAt.slice(0, 10)} by WordLift AI Audit${report.refinement ? `, with ${report.refinement.decisions} decision${report.refinement.decisions === 1 ? "" : "s"} the owner made` : ", before the owner reviewed it"}.`,
    "",
    "## What this business is",
    "",
    role
      ? `In the owner's words: ${role.replaceAll("-", " ")}.${archetype && archetype !== "other" ? ` The audit read it as a ${archetype.replace("-", " / ")} site.` : ""}`
      : archetype && archetype !== "other"
        ? `A ${archetype.replace("-", " / ")} site, as the audit read it. The owner has not yet said otherwise.`
        : "As the audit read it; the owner has not yet said what it is.",
    "",
    "## Entities",
    "",
    ...(entities.length > 0
      ? entities.map((entity) => {
          const wikidata = entity.sameAs.find((url) => /wikidata\.org/i.test(url));
          return `- ${entity.name} (${entity.types.join(", ")}) — \`${entity.id}\`${entity.humanPriority === "primary" ? ", primary" : ""}${wikidata ? `, same as ${wikidata}` : ""}`;
        })
      : ["- None published yet."]),
    "",
  ];

  if (terms.length > 0) {
    lines.push("## Vocabulary", "", ...terms.map((term) => `- **${term.label}**: ${term.meaning ?? "confirmed by the owner"}${term.aliases.length > 0 ? ` (also: ${term.aliases.join(", ")})` : ""}`), "");
  }

  lines.push("## Actions", "");
  if (published.length === 0) lines.push("No action is published yet: none has an entry point the audit could call, and the owner has handed none off.", "");
  for (const action of published) {
    const capability = capabilities.get(action.actionId)!;
    lines.push(`### ${action.label} (\`${action.actionId}\`)`, "", `${capability.description}`, "");
    lines.push(`- Who runs it: ${action.boundary ? OWN_WORDS[action.boundary] : "undecided; the owner has not said"}${action.provider ? ` — ${action.provider.name}${action.provider.url ? ` (${action.provider.url})` : ""}` : ""}.`);
    if (capability.boundaryRationale) lines.push(`- Why: ${capability.boundaryRationale}`);
    if (action.entryPoint) lines.push(...howToCall(action.entryPoint));
    if (action.publishedAs === "handoff") lines.push(action.provider?.url ? `- Where: the partner's site, ${action.provider.url}. Nothing on ${host} performs this.` : `- Where: with the partner. Nothing on ${host} performs this.`);
    lines.push("");
  }
  if (described.length > 0) {
    lines.push("## Described, not offered to agents", "", ...described.map((action) => `- ${action.label} (\`${action.actionId}\`): ${action.because}`), "");
  }

  lines.push("## Never", "");
  lines.push("- Never take this file as proof that an action answers today. Read the report.");
  if (writes.length > 0) {
    lines.push(`- Never perform ${writes.map((action) => action.label.toLowerCase()).join(", ")} without a person's confirmation: each changes something for them.`);
  }
  if (excluded.length > 0) lines.push(`- Never attempt ${excluded.map((action) => action.label.toLowerCase()).join(", ")} here: the owner said it is not theirs.`);
  lines.push("- Never invent an entry point that this file does not name.", "");
  return lines.join("\n");
}

function catalogFor(report: ReportRecord, actions: PublishedAction[], host: string, origin: string, siteName: string, options: PublicationOptions, publishedAt: string): ArdManifest {
  const capabilities = new Map((report.capabilities ?? []).map((capability) => [capability.actionId, capability]));
  const published = actions.filter((action) => action.publishedAs === "action" || action.publishedAs === "handoff");
  const archetype = report.classification?.primaryArchetype;
  const skill: ArdEntry = {
    identifier: `${ARD.urnPrefix}:${host}:terms-of-action`,
    displayName: `${host} Terms of Action`,
    type: ARD.skillType,
    url: `${options.apiUrl}/publish/skill.md`,
    description: `What ${host} is, who runs each of its actions, and how to call the interfaces it publishes.`,
    capabilities: published.map((action) => action.actionId),
    representativeQueries: published.map((action) => `${action.label} on ${host}`),
    ...(archetype && archetype !== "other" ? { tags: [archetype] } : {}),
    version: report.actionModelVersion,
    updatedAt: publishedAt,
    metadata: { report: options.reportUrl, generator: "WordLift AI Audit", decisions: report.refinement?.decisions ?? 0 },
  };
  const interfaces: ArdEntry[] = actions
    .filter((action) => action.publishedAs === "action" && action.entryPoint)
    .map((action) => {
      const capability = capabilities.get(action.actionId)!;
      const [area, name] = action.actionId.split(".") as [string, string];
      return {
        identifier: `${ARD.urnPrefix}:${host}:${area}:${name}`,
        displayName: action.label,
        type: ARD.jsonLdType,
        data: { "@context": ["https://schema.org", WLCAP_CONTEXT], ...actionNode(action, capability, origin) },
        description: capability.description,
        capabilities: [action.actionId],
        representativeQueries: [`${action.label} on ${host}`, capability.description],
        tags: [capability.stage, capability.intent],
        version: report.actionModelVersion,
        updatedAt: publishedAt,
        metadata: {
          report: options.reportUrl,
          protocol: action.entryPoint!.protocol,
          endpoint: action.entryPoint!.url,
          via: action.entryPoint!.via,
          ...(action.boundary ? { boundary: action.boundary } : {}),
        },
      };
    });
  return ardManifestSchema.parse({
    specVersion: ARD.specVersion,
    host: { displayName: siteName, identifier: host },
    entries: [skill, ...interfaces],
  });
}

export function compilePublication(report: ReportRecord, options: PublicationOptions): Publication {
  const site = new URL(report.canonicalUrl ?? report.requestedUrl);
  const origin = site.origin;
  const host = hostOf(site);
  const graph = report.contextGraph;
  const publishedAt = (options.now?.() ?? new Date()).toISOString();
  const entities = publishableEntities(graph?.entities ?? []);
  // Every expected action, and any action a person decided about, has a row; the rest is noise.
  const actions = (report.capabilities ?? [])
    .filter((capability) => capability.expected || capability.boundary || capability.expectationSource.includes("human:decision"))
    .map((capability) => publishedAction(capability, graph, options));
  const siteName = entities.find((entity) => entity.types.includes("WebSite"))?.name ?? graph?.pages[0]?.title ?? host;

  return {
    site: origin,
    host,
    reportId: report.id,
    reportUrl: options.reportUrl,
    publishedAt,
    decided: report.refinement?.decisions ?? 0,
    actions,
    documents: {
      pageJsonLd: `${options.apiUrl}/publish/page.jsonld`,
      skill: `${options.apiUrl}/publish/skill.md`,
      catalog: `${options.apiUrl}/publish/ai-catalog.json`,
    },
    catalogPath: ARD.path,
    jsonLd: pageJsonLd(report, entities, actions, origin, host),
    skill: skillMarkdown(report, entities, actions, host, options, publishedAt),
    catalog: catalogFor(report, actions, host, origin, siteName, options, publishedAt),
  };
}

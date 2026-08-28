import type { SiteSnapshot } from "../../server/adapters/scrape/ScrapeProvider.js";
import type { CapabilityEvidence } from "../../shared/types/index.js";
import { actionForDeclaredName, SCHEMA_ACTION_MAP } from "./schemaActions.js";

export interface SiteDetection {
  evidence: CapabilityEvidence[];
  /** Behavioral signals for archetype inference, for example `path:booking`. */
  signals: string[];
}

interface PathRule {
  pattern: RegExp;
  actionId: string;
  claim: string;
  signal?: string;
}

/**
 * Human-facing detectors. Each one says only what was observed on the page: a person can do this
 * here. None of them implies that an agent can.
 */
const PATH_RULES: PathRule[] = [
  { pattern: /\/(cart|basket)(\/|$|\?)/, actionId: "checkout.create", claim: "A cart page exists for people", signal: "path:cart" },
  { pattern: /\/checkout/, actionId: "checkout.complete", claim: "A checkout flow exists for people", signal: "path:checkout" },
  { pattern: /\/(booking|book|reserve|reservation)/, actionId: "availability.check", claim: "A booking flow exists for people", signal: "path:booking" },
  { pattern: /\/(pricing|plans|prezzi|preise)/, actionId: "plans.compare", claim: "A pricing or plans page exists for people", signal: "path:pricing" },
  { pattern: /\/(quote|preventivo|angebot)/, actionId: "quote.request", claim: "A quote request page exists for people", signal: "path:quote" },
  { pattern: /\/(apply|application|richiedi)/, actionId: "application.start", claim: "An application flow exists for people" },
  { pattern: /\/(eligibility|requirements|idoneita)/, actionId: "eligibility.explain", claim: "An eligibility page exists for people" },
  { pattern: /\/(faq|help|support|assistenza)/, actionId: "policy.explain", claim: "Help or FAQ pages exist for people" },
  { pattern: /\/(terms|privacy|policy|returns|refund|shipping|conditions)/, actionId: "policy.explain", claim: "Policy pages exist for people" },
  { pattern: /\/(order-status|orders|track|tracking|my-?account|account)/, actionId: "transaction.status", claim: "An order or account area exists for people" },
  { pattern: /\/(manage|cancel|modify|change-booking)/, actionId: "transaction.modify", claim: "A self-service management page exists for people" },
  { pattern: /\/(subscribe|newsletter|abbonati)/, actionId: "subscription.start", claim: "A subscription page exists for people" },
  { pattern: /\/(docs|documentation|developers|guides)/, actionId: "features.search", claim: "Product documentation exists for people" },
  { pattern: /\/(trial|signup|sign-up|get-started|register)/, actionId: "trial.start", claim: "A trial or sign-up flow exists for people" },
  { pattern: /\/(compare|comparison|vs-)/, actionId: "items.compare", claim: "A comparison page exists for people" },
  { pattern: /\/(contact|contatti|kontakt)/, actionId: "inquiry.submit", claim: "A contact page exists for people" },
  { pattern: /\/(support|tickets|helpdesk)/, actionId: "support.request", claim: "A support channel exists for people" },
];

/** Documents that say "agents are expected here", without naming individual operations. */
const DOCUMENT_DECLARATIONS: Partial<Record<SiteSnapshot["discovery"][number]["kind"], string>> = {
  llms: "The site publishes llms.txt for agents",
  skill: "The site publishes a skill description for agents",
  "agent-skills": "The site publishes an agent-skills index",
  "api-catalog": "The site publishes an API catalogue for agents",
  "mcp-server-card": "The site publishes an MCP server card naming its transports",
};

/** Documents that name the operations an agent could call. */
const NAMED_INTERFACES = new Set<SiteSnapshot["discovery"][number]["kind"]>([
  "mcp",
  "openapi",
  "ucp",
  "webmcp-tools",
  "agent-card",
]);

const SUBSCRIBE_INPUT = /email|newsletter|subscribe/;
const CONTACT_INPUT = /message|subject|enquiry|inquiry|comment/;

export function detectSiteEvidence(snapshot: SiteSnapshot, collectedAt: string): SiteDetection {
  const evidence: CapabilityEvidence[] = [];
  const signals = new Set<string>();
  const seen = new Set<string>();
  const site = snapshot.canonicalUrl || snapshot.requestedUrl;

  const add = (item: Omit<CapabilityEvidence, "collectedAt">) => {
    const key = `${item.actionId}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    evidence.push({ ...item, collectedAt });
  };

  // The page itself is human evidence that the catalogue can be browsed.
  if (snapshot.title || snapshot.headings.length > 0) {
    add({
      id: "page-browse",
      actionId: "site.browse",
      audience: "human",
      kind: "page",
      sourceUrl: site,
      claim: "People can browse this site through its pages and navigation",
      confidence: 1,
      verification: "observed",
    });
  }

  for (const form of snapshot.forms) {
    if (form.hasSearchInput) {
      add({
        id: `form-search-${form.action}`,
        actionId: "site.search",
        audience: "human",
        kind: "form",
        sourceUrl: site,
        claim: "People can search through an on-page form",
        confidence: 1,
        verification: "observed",
      });
    }
    if (form.hasDateInput) {
      add({
        id: `form-dates-${form.action}`,
        actionId: "availability.check",
        audience: "human",
        kind: "form",
        sourceUrl: site,
        claim: "People can check dates through a booking form",
        confidence: 1,
        verification: "observed",
      });
      signals.add("path:booking");
    }
    if (form.inputNames.some((name) => SUBSCRIBE_INPUT.test(name)) && form.inputNames.length <= 3) {
      add({
        id: `form-subscribe-${form.action}`,
        actionId: "subscription.start",
        audience: "human",
        kind: "form",
        sourceUrl: site,
        claim: "People can subscribe through a form",
        confidence: 0.8,
        verification: "observed",
      });
    }
    if (form.inputNames.some((name) => CONTACT_INPUT.test(name))) {
      add({
        id: `form-contact-${form.action}`,
        actionId: "inquiry.submit",
        audience: "human",
        kind: "form",
        sourceUrl: site,
        claim: "People can send an inquiry through a form",
        confidence: 0.9,
        verification: "observed",
      });
    }
  }

  const haystack = [...snapshot.linkPaths, ...snapshot.linkLabels].join(" ");
  for (const rule of PATH_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    add({
      id: `path-${rule.actionId}`,
      actionId: rule.actionId,
      audience: "human",
      kind: "page",
      sourceUrl: site,
      claim: rule.claim,
      confidence: 0.85,
      verification: "observed",
    });
    if (rule.signal) signals.add(rule.signal);
  }

  for (const type of snapshot.jsonLdTypes) {
    signals.add(`schema:${type}`);
    for (const actionId of SCHEMA_ACTION_MAP[type] ?? []) {
      add({
        id: `jsonld-${type}-${actionId}`,
        actionId,
        audience: "agent",
        kind: "structured-data",
        sourceUrl: site,
        claim: `${type} is published as JSON-LD, so an agent can read it`,
        confidence: 0.9,
        verification: "declared",
      });
    }
  }

  // WebMCP is registered in the page, not published at a path, so it is read from the page itself.
  for (const tool of snapshot.pageTools) {
    signals.add("agent:webmcp");
    signals.add(`agent:webmcp-${tool.origin}`);
    add({
      id: `webmcp-${tool.origin}-${tool.name}`.slice(0, 160),
      actionId: actionForDeclaredName(tool.name) ?? "site.search",
      audience: "agent",
      kind: "webmcp",
      sourceUrl: tool.sourceUrl,
      claim:
        tool.origin === "declarative"
          ? `"${tool.name}" is annotated on this page as a WebMCP tool, but no call has been verified`
          : `"${tool.name}" is registered for agents through navigator.modelContext, but no call has been verified`,
      confidence: tool.origin === "declarative" ? 0.85 : 0.8,
      verification: "declared",
    });
  }

  // Endpoints the site's own server card names as transports. A failed handshake on one of these
  // is a broken declaration even when the endpoint never spoke MCP at all.
  const cardEndpoints = new Set(
    snapshot.discovery
      .filter((document) => document.kind === "mcp-server-card" && document.found)
      .flatMap((document) => document.declaredNames.map(normalizeEndpoint))
      .filter((value) => value.length > 0),
  );

  for (const probe of snapshot.mcpEndpoints) {
    if (!probe.initialized) {
      // A broken declaration needs a declaration: the endpoint opened a session and then failed,
      // or the server card names it as a transport. A merely linked path that never spoke MCP —
      // a blog post the endpoint pattern happened to match — made no claim, so nothing is said.
      if (!probe.sessionOpened && !cardEndpoints.has(normalizeEndpoint(probe.url))) continue;
      add({
        id: `mcp-endpoint-failed-${probe.url}`.slice(0, 160),
        actionId: "site.search",
        audience: "agent",
        kind: "discovery",
        sourceUrl: probe.url,
        claim: `This linked MCP endpoint did not complete a handshake${probe.error ? `: ${probe.error}` : ""}`,
        confidence: 0.9,
        verification: "failed",
      });
      continue;
    }

    signals.add("agent:mcp-endpoint");
    add({
      id: `mcp-endpoint-${probe.url}`.slice(0, 160),
      actionId: "site.browse",
      audience: "agent",
      kind: "discovery",
      sourceUrl: probe.url,
      claim: `An agent opened an MCP session here and completed the initialize handshake${
        probe.serverName ? ` with "${probe.serverName}"` : ""
      }`,
      confidence: 1,
      verification: "invoked",
    });

    for (const tool of probe.tools.slice(0, 20)) {
      const actionId = actionForDeclaredName(tool.name);
      if (!actionId) continue;

      // A tool that was called and answered is the only thing that earns verified readiness.
      if (tool.called && tool.ok) {
        add({
          id: `mcp-call-${tool.name}`.slice(0, 160),
          actionId,
          audience: "agent",
          kind: "tool-result",
          sourceUrl: probe.url,
          claim: `An agent called "${tool.name}" on the site's live MCP server with ${
            tool.arguments ?? "{}"
          } and it returned a result`,
          confidence: 1,
          verification: "invoked",
        });
        continue;
      }

      if (tool.called) {
        add({
          id: `mcp-call-failed-${tool.name}`.slice(0, 160),
          actionId,
          audience: "agent",
          kind: "tool-result",
          sourceUrl: probe.url,
          claim: `"${tool.name}" is declared by the site's live MCP server but the call failed${
            tool.note ? `: ${tool.note}` : ""
          }`,
          confidence: 0.9,
          verification: "failed",
        });
        continue;
      }

      add({
        id: `mcp-tool-${tool.name}`.slice(0, 160),
        actionId,
        audience: "agent",
        kind: "discovery",
        sourceUrl: probe.url,
        claim: `"${tool.name}" is listed by the site's live MCP server, but it was not called${
          tool.note ? `: ${tool.note}` : ""
        }`,
        confidence: 0.9,
        verification: "declared",
      });
    }
  }

  if (snapshot.softNotFound) {
    // One accurate finding about the site, instead of a broken-declaration claim per probed path.
    // It is `observed`, not `failed`: the site behaves this way, but no declared interface broke, so
    // it must not cancel an interface that was proven to work.
    add({
      id: "soft-not-found",
      actionId: "site.browse",
      audience: "agent",
      kind: "discovery",
      sourceUrl: site,
      claim:
        "This site answers unknown paths with its HTML page and a 200, so an agent cannot tell which agent documents exist",
      confidence: 1,
      verification: "observed",
    });
  }

  for (const document of snapshot.discovery) {
    // A path that answers with the site's HTML shell is a broken declaration, not an interface.
    if (document.status === "invalid") {
      add({
        id: `invalid-${document.kind}`,
        actionId: document.kind === "mcp" || document.kind === "ucp" ? "site.search" : "site.browse",
        audience: "agent",
        kind: document.kind === "openapi" ? "openapi" : "discovery",
        sourceUrl: document.url,
        claim: "This agent-discovery path answers with the site's HTML page instead of a valid document",
        confidence: 0.9,
        verification: "failed",
      });
      continue;
    }
    if (!document.found) continue;
    const declaration = DOCUMENT_DECLARATIONS[document.kind];
    if (declaration) {
      signals.add(document.kind === "llms" ? "agent:llms-txt" : `agent:${document.kind}`);
      add({
        id: `discovery-${document.kind}`,
        actionId: "site.browse",
        audience: "agent",
        kind: "discovery",
        sourceUrl: document.url,
        claim: declaration,
        confidence: 0.8,
        verification: "declared",
      });
    }

    if (NAMED_INTERFACES.has(document.kind)) {
      signals.add(document.kind === "openapi" ? "agent:openapi" : `agent:${document.kind}`);
      const kind = document.kind === "openapi" ? "openapi" : document.kind === "webmcp-tools" ? "webmcp" : "discovery";
      const named = document.declaredNames
        .map((name) => ({ name, actionId: actionForDeclaredName(name) }))
        .filter((entry): entry is { name: string; actionId: string } => entry.actionId !== null);

      if (named.length === 0) {
        add({
          id: `discovery-${document.kind}`,
          actionId: "site.search",
          audience: "agent",
          kind,
          sourceUrl: document.url,
          claim: `An agent interface is declared at ${document.kind}, but no call has been verified`,
          confidence: 0.7,
          verification: "declared",
        });
        continue;
      }

      for (const entry of named.slice(0, 20)) {
        add({
          id: `declared-${document.kind}-${entry.name}`.slice(0, 160),
          actionId: entry.actionId,
          audience: "agent",
          kind,
          sourceUrl: document.url,
          claim: `"${entry.name}" is declared for agents, but no successful call has been verified`,
          confidence: 0.75,
          verification: "declared",
        });
      }
    }
  }

  return { evidence, signals: [...signals].sort() };
}

/** Parses an endpoint for comparison; an unparseable one can never match. */
function normalizeEndpoint(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

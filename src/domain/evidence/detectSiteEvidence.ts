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

  for (const document of snapshot.discovery) {
    // A path that answers with the site's HTML shell is a broken declaration, not an interface.
    if (document.status === "invalid") {
      add({
        id: `invalid-${document.kind}`,
        actionId: document.kind === "webmcp-tools" || document.kind === "mcp" ? "site.search" : "site.browse",
        audience: "agent",
        kind: document.kind === "openapi" ? "openapi" : document.kind === "webmcp-tools" ? "webmcp" : "discovery",
        sourceUrl: document.url,
        claim: "This agent-discovery path answers with the site's HTML page instead of a valid document",
        confidence: 0.9,
        verification: "failed",
      });
      continue;
    }
    if (!document.found) continue;
    if (document.kind === "llms" || document.kind === "skill" || document.kind === "agent-skills") {
      signals.add(document.kind === "llms" ? "agent:llms-txt" : `agent:${document.kind}`);
      add({
        id: `discovery-${document.kind}`,
        actionId: "site.browse",
        audience: "agent",
        kind: "discovery",
        sourceUrl: document.url,
        claim: `The site publishes ${document.kind === "llms" ? "llms.txt" : document.kind} for agents`,
        confidence: 0.8,
        verification: "declared",
      });
    }

    if (document.kind === "mcp" || document.kind === "webmcp-tools" || document.kind === "openapi") {
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

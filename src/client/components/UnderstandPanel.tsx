import { ArrowUpRight, Copy } from "lucide-react";
import { useState } from "react";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { entityProvenance, entityRole } from "../../shared/format/businessModel.js";
import type { ViewEntity } from "../../shared/format/modelView.js";
import { plainWord, type PlainWord } from "./FirstScreen";
import { EntityCard, type CardDetail } from "./EntityCard";
import { publishUrl, sampleJsonLd } from "./FixPanel";
import { useReportEngine } from "../engine/EngineContext";
import { track } from "../engine/track";

/**
 * Fix what agents cannot understand. Every entity the audit read on the site's pages, counted:
 * what is already machine-readable, and what exists only in the text. The second group is the
 * finding, and publishing it is the button. What agents currently understand, entity by entity,
 * is the evidence explaining the fix, open on the page; one entity's markup waits behind a fold.
 */
/** Five per column keeps the sell above the fold; the rest is one click away in the full audit. */
const MAX_PER_GROUP = 5;

export { entityTypeLabel } from "./EntityCard";

/** The page an entity was read from, as a short path a person recognises. */
export function whereFound(entity: DomainEntity): string {
  const first = entity.sourceUrls[0];
  if (!first) return "";
  try {
    const url = new URL(first);
    return url.pathname === "/" ? "home page" : decodeURIComponent(url.pathname).replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** What the map knows about one entity, as detail on its row: the actions it answers for, and the words the site uses for it. */
export interface EntityLinks {
  actions: Array<{ actionId: string; label: string; word: PlainWord | null }>;
  terms: string[];
  /** The Wikidata link the entity carries, when it carries one. */
  wikidata: { url: string; id: string } | null;
}

const WIKIDATA = /^https?:\/\/(?:www\.)?wikidata\.org\/(?:wiki|entity)\/(Q\d+)/i;

export function wikidataLink(entity: DomainEntity): EntityLinks["wikidata"] {
  for (const url of entity.sameAs) {
    const match = WIKIDATA.exec(url);
    if (match) return { url, id: match[1]! };
  }
  return null;
}

const RELATION_WORDS: Record<string, string> = { offers: "offers", "located-in": "in", "provided-by": "by", "part-of": "part of", serves: "serves", brand: "brand" };

/** What the site's own markup says this entity relates to: "offers Samspitze 4", "in Mariapfarr", "offered by AlpiNest". */
export function relationPhrases(entity: DomainEntity, report: ReportRecord, limit = 4): string[] {
  const names = new Map((report.contextGraph?.entities ?? []).map((candidate) => [candidate.id, candidate.name]));
  const phrases: string[] = [];
  for (const relation of report.contextGraph?.relations ?? []) {
    // What only the text says is marked so; the markup's word and a review's stand as they are.
    const read = relation.provenance === "inferred" ? " (from the text)" : "";
    if (relation.from === entity.id && names.has(relation.to)) phrases.push(`${RELATION_WORDS[relation.kind] ?? relation.kind} ${names.get(relation.to)}${read}`);
    else if (relation.to === entity.id && relation.kind === "offers" && names.has(relation.from)) phrases.push(`offered by ${names.get(relation.from)}${read}`);
  }
  return [...new Set(phrases)].slice(0, limit);
}

export function linksFor(entity: DomainEntity, report: ReportRecord, limit = 3): EntityLinks {
  const actions = (report.capabilities ?? [])
    .filter((capability) => capability.expected && capability.appliesTo.some((subject) => subject.id === entity.id))
    .sort((left, right) => right.importance - left.importance)
    .slice(0, limit)
    .map((capability) => ({ actionId: capability.actionId, label: capability.label, word: plainWord(capability) }));
  // A word the site uses for this entity, not a headline the page uses for everything on it; a site or a page has none of its own.
  const terms = (entity.types.includes("WebSite") || entity.types.includes("WebPage") ? [] : report.contextGraph?.lexicalEntries ?? [])
    .filter((term) => term.entityIds.includes(entity.id) && term.entityIds.length <= 2 && term.label.length <= 40 && term.label.toLowerCase() !== entity.name.toLowerCase())
    .slice(0, limit)
    .map((term) => term.label);
  return { actions, terms, wikidata: wikidataLink(entity) };
}

export interface EntityGroups {
  /** Declared in the pages' markup: agents already read these. */
  published: DomainEntity[];
  /** Read from the text by the entity extractor: agents cannot see these yet. */
  textOnly: DomainEntity[];
}

/** Two groups, demoted entities left out, the owner's primary ones first within each. */
export function groupEntities(entities: DomainEntity[]): EntityGroups {
  const kept = entities.filter((entity) => entity.humanPriority !== "demoted");
  const order = (left: DomainEntity, right: DomainEntity) =>
    Number(right.humanPriority === "primary") - Number(left.humanPriority === "primary") || right.confidence - left.confidence || left.name.localeCompare(right.name);
  return {
    published: kept.filter((entity) => entity.origin !== "inferred").sort(order),
    textOnly: kept.filter((entity) => entity.origin === "inferred").sort(order),
  };
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

function openFullAudit() {
  const fold = document.getElementById("full-audit") as HTMLDetailsElement | null;
  if (fold) fold.open = true;
}

export function UnderstandPanel({ report }: { report: ReportRecord }) {
  const [copied, setCopied] = useState(false);
  const { engine } = useReportEngine();
  const { published, textOnly } = groupEntities(report.contextGraph?.entities ?? []);
  const total = published.length + textOnly.length;
  if (total === 0) return null;

  // The sample is the richest entity agents cannot see yet: the one with offers, else the most described.
  const sample = [...textOnly].sort(
    (left, right) => right.offers.length - left.offers.length || (right.description?.length ?? 0) - (left.description?.length ?? 0),
  )[0];
  const sampleText = sample ? JSON.stringify(sampleJsonLd(sample), null, 2) : null;

  async function copy() {
    if (!sampleText) return;
    await navigator.clipboard.writeText(sampleText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  const fixable = textOnly.length > 0;
  const toView = (entity: DomainEntity): ViewEntity => ({ id: entity.id, name: entity.name, type: entity.types[0] ?? "Thing", role: entityRole(entity), provenance: entityProvenance(entity), variants: 0 });
  const detailFor = (entity: DomainEntity): CardDetail => {
    const links = linksFor(entity, report);
    return { where: whereFound(entity) || undefined, relations: relationPhrases(entity, report), actions: links.actions, terms: links.terms, wikidata: links.wikidata };
  };
  return (
    <section id="understand" className={`understand ${fixable ? "understand-fixable" : "understand-done"}`} aria-labelledby="understand-title">
      {/* Nothing to fix is one line, not a card: the model on the first screen already showed every thing. */}
      {fixable ? (
        <h2 id="understand-title">Fix what agents cannot understand</h2>
      ) : (
        <p id="understand-title" className="understand-done-line">
          <b>Agents understand your business.</b> All {plural(total, "important thing")} found on these pages {total === 1 ? "is" : "are"} declared by the site.
        </p>
      )}
      {fixable && (
        <p className="understand-lead">
          Agents found {plural(total, "important thing")} on these pages.{" "}
          {published.length === 0 ? "None" : published.length} {published.length === 1 ? "is" : "are"} declared by the site, so agents already read {published.length === 1 ? "it" : "them"}. {textOnly.length} {textOnly.length === 1 ? "exists" : "exist"} only in the text.
        </p>
      )}

      {fixable && (
        <p className="fix-cta">
          <a className="fix-publish" href={publishUrl(report.id, { intent: "build-context", engine: engine?.id })} onClick={() => track(report.id, "door_build-context")} target="_blank" rel="noreferrer">
            Make it machine-readable with WordLift <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <span>WordLift turns the {textOnly.length} {textOnly.length === 1 ? "thing" : "things"} only in your content into stable, machine-readable knowledge on every page, and keeps it in sync as the site changes.</span>
        </p>
      )}

      {/* Only what needs fixing is listed here, in the same card as the first screen, with the detail the fix
          needs: the page it was read from, its connections, the actions it answers for, the site's words. What
          the site already declares is one line; the decision about each thing is made on the first screen. */}
      {fixable && (
        <ul className="engine-entities understand-cards" aria-label="Only in the text">
          {textOnly.slice(0, MAX_PER_GROUP).map((entity) => (
            <EntityCard key={entity.id} entity={toView(entity)} detail={detailFor(entity)} />
          ))}
        </ul>
      )}
      {fixable && textOnly.length > MAX_PER_GROUP && (
        <p className="entity-more">
          <a href="#full-audit" onClick={openFullAudit}>{textOnly.length - MAX_PER_GROUP} more in the model &amp; evidence</a>
        </p>
      )}
      {fixable && published.length > 0 && (
        <p className="understand-declared">
          <b>Declared by the site:</b> {published.slice(0, 8).map((entity) => entity.name).join(", ")}{published.length > 8 ? ` and ${published.length - 8} more` : ""}.
          {" "}<a href="#full-audit" onClick={openFullAudit}>Open the full map</a>, where entities, terms and actions are drawn together.
        </p>
      )}
      {sample && sampleText && (
        <details className="fix-sample-fold">
          <summary>See the markup for one of them</summary>
          <figure className="fix-sample">
            <figcaption>
              <span>Sample · {sample.name} · from {whereFound(sample) || "the site"}</span>
              <button type="button" onClick={() => void copy()}><Copy size={13} /> {copied ? "Copied" : "Copy"}</button>
            </figcaption>
            <pre>{sampleText}</pre>
          </figure>
        </details>
      )}
    </section>
  );
}

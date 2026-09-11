import { ArrowUpRight, Braces, Copy } from "lucide-react";
import { useState } from "react";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { plainWord, type PlainWord } from "./FirstScreen";
import { publishUrl, sampleJsonLd } from "./FixPanel";

/**
 * Fix what agents cannot understand. Every entity the audit read on the site's pages, counted:
 * what is already machine-readable, and what exists only in the text. The second group is the
 * finding, and publishing it is the button. What agents currently understand, entity by entity,
 * is the evidence explaining the fix, open on the page; one entity's markup waits behind a fold.
 */
const MAX_PER_GROUP = 12;

/** "LodgingBusiness" → "Lodging business": the schema.org type in words a person reads. */
export function entityTypeLabel(type: string | undefined): string {
  if (!type) return "Thing";
  const words = type.replace(/^https?:\/\/schema\.org\//, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

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
    if (relation.from === entity.id && names.has(relation.to)) phrases.push(`${RELATION_WORDS[relation.kind] ?? relation.kind} ${names.get(relation.to)}`);
    else if (relation.to === entity.id && relation.kind === "offers" && names.has(relation.from)) phrases.push(`offered by ${names.get(relation.from)}`);
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

function openFullMap() {
  const fold = document.getElementById("full-audit") as HTMLDetailsElement | null;
  if (fold) fold.open = true;
  document.querySelector(".context-engine")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

/** What the chip's colour says about the action today, for the reader who hovers. */
const PLAIN_WORDS: Record<string, string> = { works: "an AI agent can do this today", fix: "fix this, agents cannot do it yet", talk: "talk to us, there is no interface for it", none: "not expected of this kind of site" };

function EntityList({ entities, tone, report }: { entities: DomainEntity[]; tone: "published" | "text"; report: ReportRecord }) {
  const shown = entities.slice(0, MAX_PER_GROUP);
  const more = entities.length - shown.length;
  return (
    <>
      <ul className="entity-list">
        {shown.map((entity) => {
          const links = linksFor(entity, report);
          return (
            <li key={entity.id} className={`entity-row entity-row-${tone}`}>
              <span className="entity-name">{entity.name}</span>
              <span className="entity-type">{entityTypeLabel(entity.types[0])}</span>
              {whereFound(entity) && <span className="entity-where">{whereFound(entity)}</span>}
              {relationPhrases(entity, report).length > 0 && (
                <span className="entity-relations" aria-label={`What the site's markup says ${entity.name} relates to`}>
                  {relationPhrases(entity, report).join(" · ")}
                </span>
              )}
              {(links.actions.length > 0 || links.terms.length > 0 || links.wikidata) && (
                <span className="entity-links" aria-label={`What the map links to ${entity.name}`}>
                  {links.actions.length > 0 && <small className="entity-links-label">Answers for</small>}
                  {links.actions.map((action) => (
                    <span key={action.actionId} className={`entity-link entity-link-${action.word ?? "none"}`} title={`${action.label}: ${PLAIN_WORDS[action.word ?? "none"]}`}>{action.label}</span>
                  ))}
                  {links.terms.length > 0 && <small className="entity-links-label">In the site's words</small>}
                  {links.terms.map((term) => (
                    <span key={term} className="entity-link entity-link-term">“{term}”</span>
                  ))}
                  {/* The link to the world's record of the thing closes the row: it is about the entity, not an action. */}
                  {links.wikidata && (
                    <a className="entity-link entity-link-wikidata" href={links.wikidata.url} target="_blank" rel="noreferrer">
                      Wikidata {links.wikidata.id}
                    </a>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <p className="entity-more">
          <a href="#full-audit" onClick={openFullAudit}>{more} more in the full audit</a>
        </p>
      )}
    </>
  );
}

export function UnderstandPanel({ report }: { report: ReportRecord }) {
  const [copied, setCopied] = useState(false);
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
  return (
    <section id="understand" className={`understand ${fixable ? "understand-fixable" : ""}`} aria-labelledby="understand-title">
      <p className="section-kicker"><Braces size={16} /> Fix</p>
      <h2 id="understand-title">{fixable ? "Fix what agents cannot understand" : "Agents understand your business"}</h2>
      <p className="understand-lead">
        Agents found {plural(total, "important thing")} on these pages.
        {" "}
        {fixable ? (
          <>
            {published.length === 0 ? "None" : published.length} {published.length === 1 ? "is" : "are"} already machine-readable. {textOnly.length} {textOnly.length === 1 ? "exists" : "exist"} only in the text.
          </>
        ) : (
          <>All of {total === 1 ? "it is" : "them are"} already machine-readable.</>
        )}
      </p>

      {fixable && (
        <p className="fix-cta">
          <a className="fix-publish" href={publishUrl(report.id, { intent: "fix" })} target="_blank" rel="noreferrer">
            Publish the missing {textOnly.length} with WordLift <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <span>WordLift writes the machine-readable form for every page and keeps it in sync as the site changes.</span>
        </p>
      )}

      {/* Open by default: the lists are the evidence for the fix, and a person wants to see them. */}
      <details className="understand-detail" open>
        <summary>What agents currently understand</summary>
        <div className="entity-groups">
          <div className="entity-group">
            <h3>
              <span className="plain-word plain-word-works">Agents read these</span>
              <span className="entity-count">{published.length}</span>
            </h3>
            {published.length > 0 ? (
              <EntityList entities={published} tone="published" report={report} />
            ) : (
              <p className="entity-empty">Nothing on these pages is machine-readable yet.</p>
            )}
          </div>
          <div className="entity-group">
            <h3>
              <span className="plain-word plain-word-fix">Only in your text</span>
              <span className="entity-count">{textOnly.length}</span>
            </h3>
            {textOnly.length > 0 ? (
              <EntityList entities={textOnly} tone="text" report={report} />
            ) : (
              <p className="entity-empty">Everything the pages describe is already machine-readable.</p>
            )}
          </div>
        </div>
        <p className="entity-more understand-footnote">
          Each row shows the actions the entity answers for, in the colour of what agents can do today, and the words the site uses for it.{" "}
          <a href="#full-audit" onClick={openFullMap}>Open the full map</a>, where entities, terms and actions are drawn together.
        </p>
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
      </details>
    </section>
  );
}

import { ArrowUpRight, Braces, Copy } from "lucide-react";
import { useState } from "react";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { publishUrl, sampleJsonLd } from "./FixPanel";

/**
 * Fix what agents cannot understand. Every entity the audit read on the site's pages, counted:
 * what is already machine-readable, and what exists only in the text. The second group is the
 * finding, and publishing it is the button. What agents currently understand, entity by entity,
 * waits one click below as the evidence explaining the fix; one entity's markup waits behind it.
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

function EntityList({ entities, tone }: { entities: DomainEntity[]; tone: "published" | "text" }) {
  const shown = entities.slice(0, MAX_PER_GROUP);
  const more = entities.length - shown.length;
  return (
    <>
      <ul className="entity-list">
        {shown.map((entity) => (
          <li key={entity.id} className={`entity-row entity-row-${tone}`}>
            <span className="entity-name">{entity.name}</span>
            <span className="entity-type">{entityTypeLabel(entity.types[0])}</span>
            {whereFound(entity) && <span className="entity-where">{whereFound(entity)}</span>}
          </li>
        ))}
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
    <section className={`understand ${fixable ? "understand-fixable" : ""}`} aria-labelledby="understand-title">
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

      <details className="understand-detail">
        <summary>See what agents currently understand</summary>
        <div className="entity-groups">
          <div className="entity-group">
            <h3>
              <span className="plain-word plain-word-works">Agents read these</span>
              <span className="entity-count">{published.length}</span>
            </h3>
            {published.length > 0 ? (
              <EntityList entities={published} tone="published" />
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
              <EntityList entities={textOnly} tone="text" />
            ) : (
              <p className="entity-empty">Everything the pages describe is already machine-readable.</p>
            )}
          </div>
        </div>
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

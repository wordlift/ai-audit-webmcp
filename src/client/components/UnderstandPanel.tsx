import { ArrowUpRight, Braces, Copy, Eye } from "lucide-react";
import { useState } from "react";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { publishUrl, sampleJsonLd } from "./FixPanel";

/**
 * Understand, then Fix, on one screen: every entity the audit read on the site's pages, named
 * plainly, with where it was found and whether an agent can already read it as structured data.
 * The ones that exist only in the text are the finding; publishing them is the button. One entity's
 * markup is shown as a sample behind a fold; the full set is generated on the account side.
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
  /** Read from the text by the markup provider: agents cannot see these yet. */
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

  const lead =
    textOnly.length === 0
      ? `${plural(total, "thing")} on your pages, all described in a form agents read.`
      : published.length === 0
        ? `${plural(total, "thing")} on your pages, and agents can read none of them yet: they exist only in your text.`
        : `${plural(total, "thing")} on your pages. ${published.length} ${published.length === 1 ? "is" : "are"} described in a form agents read; ${textOnly.length} ${textOnly.length === 1 ? "exists" : "exist"} only in your text.`;

  return (
    <section className="understand" aria-labelledby="understand-title">
      <p className="section-kicker"><Eye size={16} /> Understand</p>
      <h2 id="understand-title">What an agent understands about your business</h2>
      <p className="understand-lead">{lead}</p>

      <div className="entity-groups">
        <div className="entity-group">
          <h3>
            <span className="plain-word plain-word-works">Agents read these</span>
            <span className="entity-count">{published.length}</span>
          </h3>
          {published.length > 0 ? (
            <EntityList entities={published} tone="published" />
          ) : (
            <p className="entity-empty">Nothing on these pages is described in a form agents read yet.</p>
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
            <p className="entity-empty">Everything the pages describe is already published for agents.</p>
          )}
        </div>
      </div>

      {textOnly.length > 0 && (
        <>
          <p className="fix-cta">
            <a className="fix-publish" href={publishUrl(report.id)} target="_blank" rel="noreferrer">
              <Braces size={15} aria-hidden="true" /> Publish {textOnly.length === 1 ? "it" : `these ${textOnly.length}`} with WordLift <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <span>The markup is written for every page and kept in sync as the site changes. The report id travels with you.</span>
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
        </>
      )}
    </section>
  );
}

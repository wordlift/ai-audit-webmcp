import { ArrowUpRight, Braces, Copy } from "lucide-react";
import { useState } from "react";
import { entityJsonLd } from "../../shared/format/entityJsonLd.js";
import type { CapabilityResult, DomainEntity, ReportRecord } from "../../shared/types/index.js";

/**
 * Fix, on the first screen: the difference between what the pages declare and what they contain,
 * one sample of the markup an entity should carry, and one button. The sample is a preview; the
 * full set is generated on the account side, where it is also kept in sync. Nothing here is
 * downloaded, and nothing here changes readiness.
 */
const DASHBOARD_URL = "https://my.wordlift.io/";

/** Actions the site expects that no agent can reach: nothing declared, or people only. */
export function actionsWithoutInterface(capabilities: CapabilityResult[]): CapabilityResult[] {
  return capabilities.filter((capability) => capability.expected && (capability.state === "human-only" || capability.state === "missing"));
}

/** One inferred entity as the JSON-LD its page should carry, with the context Activate's page carries too. */
export function sampleJsonLd(entity: DomainEntity): Record<string, unknown> {
  return { "@context": "https://schema.org", ...entityJsonLd(entity) };
}

/** Where the dashboard picks the report up: the id travels, nothing else. */
export function publishUrl(reportId: string): string {
  const url = new URL(DASHBOARD_URL);
  url.searchParams.set("source", "ai-audit");
  url.searchParams.set("report", reportId);
  return url.toString();
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

export function FixPanel({ report }: { report: ReportRecord }) {
  const [copied, setCopied] = useState(false);
  const inferred = (report.contextGraph?.entities ?? []).filter((entity) => entity.origin === "inferred");
  const unreachable = actionsWithoutInterface(report.capabilities ?? []);
  // The panel earns its place only when there is a difference to close.
  if (inferred.length === 0 && unreachable.length === 0) return null;

  // The sample is the richest inferred entity: the one with offers, else the most described.
  const sample = [...inferred].sort(
    (left, right) => right.offers.length - left.offers.length || (right.description?.length ?? 0) - (left.description?.length ?? 0),
  )[0];
  const sampleText = sample ? JSON.stringify(sampleJsonLd(sample), null, 2) : null;

  async function copy() {
    if (!sampleText) return;
    await navigator.clipboard.writeText(sampleText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="fix-panel" aria-labelledby="fix-panel-title">
      <p className="section-kicker"><Braces size={16} /> Fix</p>
      <h2 id="fix-panel-title">The markup your site should have</h2>
      <div className="fix-stats">
        {inferred.length > 0 && (
          <div className="fix-stat">
            <b>{inferred.length}</b>
            <span>{inferred.length === 1 ? "entity appears on your pages and is" : "entities appear on your pages and are"} not published as structured data</span>
          </div>
        )}
        {unreachable.length > 0 && (
          <div className="fix-stat">
            <b>{unreachable.length}</b>
            <span>{plural(unreachable.length, "action has", "actions have")} no interface an agent can call</span>
          </div>
        )}
      </div>
      {sample && sampleText && (
        <figure className="fix-sample">
          <figcaption>
            <span>Sample · one entity · from {sample.sourceUrls[0] ? new URL(sample.sourceUrls[0]).pathname : "the site"}</span>
            <button type="button" onClick={() => void copy()}><Copy size={13} /> {copied ? "Copied" : "Copy"}</button>
          </figcaption>
          <pre>{sampleText}</pre>
        </figure>
      )}
      <p className="fix-cta">
        <a className="fix-publish" href={publishUrl(report.id)} target="_blank" rel="noreferrer">
          Publish with WordLift <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <span>Applied in full on your site and kept in sync as it changes. The report id travels with you.</span>
      </p>
    </section>
  );
}

import { Bot, Check, LoaderCircle } from "lucide-react";
import type { ReportRecord } from "../../shared/types/index.js";

const PHASES: Array<{ id: ReportRecord["phase"]; label: string }> = [
  { id: "understanding", label: "Reading the pages" },
  { id: "mapping", label: "Working out what an agent should be able to do here" },
  { id: "checking", label: "Calling what the site declares, to see what answers" },
];

/**
 * The report while it is being made. Whatever has already landed — the foundation score, the
 * entities read from the site — is shown immediately, so the wait is spent reading results
 * instead of watching a spinner.
 */
export function ReportProgress({ report }: { report: ReportRecord }) {
  const host = hostOf(report.canonicalUrl ?? report.requestedUrl);
  const activeIndex = Math.max(0, PHASES.findIndex((phase) => phase.id === report.phase));
  const entities = report.contextGraph?.entities ?? [];

  return (
    <div className="report-page report-progress" aria-busy="true">
      <p className="eyebrow"><Bot size={16} /> What an AI agent can do here</p>
      <h1>Reading <span>{host}</span>…</h1>

      <ol className="progress-phases">
        {PHASES.map((phase, index) => (
          <li key={phase.id} className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""}>
            {index < activeIndex ? <Check aria-hidden="true" /> : index === activeIndex ? <LoaderCircle className="spin" aria-hidden="true" /> : <i aria-hidden="true">{index + 1}</i>}
            <span>{phase.label}</span>
          </li>
        ))}
      </ol>

      {report.foundationAudit && (
        <section className="progress-arrival" aria-label="Foundation audit">
          <header>
            <strong>{report.foundationAudit.score}/100</strong>
            <span>Foundation score, already in</span>
          </header>
          <p>{report.foundationAudit.summary}</p>
        </section>
      )}

      {entities.length > 0 && (
        <section className="progress-arrival" aria-label="Entities">
          <header><span>What we have read so far</span></header>
          <ul className="progress-entities">
            {entities.slice(0, 12).map((entity) => (
              <li key={entity.id}>
                <strong>{entity.name}</strong>
                <span>{entity.types.join(", ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="progress-footnote" role="status">
        We call what the site declares rather than counting it. This page updates itself; the report
        appears when the audit lands, usually within a minute.
      </p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

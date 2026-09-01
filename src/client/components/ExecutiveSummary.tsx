import { Bot, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { summaryLead } from "../../shared/format/plainText.js";
import type { ReportRecord } from "../../shared/types/index.js";

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

export function ExecutiveSummary({ report }: { report: ReportRecord }) {
  // "other" is a model bucket, not English: the reader sees "a general site", never "a other site".
  const primary = report.classification?.primaryArchetype;
  const archetype = !primary || primary === "other" ? "general" : primary.replaceAll("-", " / ");
  return (
    <section className="executive-summary" aria-labelledby="summary-heading">
      <div className="summary-copy">
        <p className="section-kicker"><Bot size={18} /> AI agent perspective</p>
        <h1 id="summary-heading">We understand this as a <span>{archetype}</span> site.</h1>
        {/* The hero carries the lead only; the full summary lives in the foundation panel below. */}
        <p>{report.foundationAudit ? summaryLead(report.foundationAudit.summary) : "This report maps the functions an agent needs against the evidence available today."}</p>
        {report.contextGraph && <p className="summary-context-count">Built from {plural(report.contextGraph.pages.length, "representative page")}, {plural(report.contextGraph.entities.length, "named entity", "named entities")} and {plural(report.contextGraph.interfaces.length, "interface")} observed or declared.</p>}
        {report.publishedWith && (
          <aside className="published-with" aria-label="Publishing platform">
            <p>
              <Sparkles size={15} aria-hidden="true" /> This site runs <strong>{report.publishedWith.name}</strong>
            </p>
            <small>{report.publishedWith.evidence}.</small>
            <a href="https://my.wordlift.io" target="_blank" rel="noreferrer">Own this site? Manage it in your WordLift dashboard →</a>
          </aside>
        )}
      </div>
      <div className="score-grid" aria-label="Readiness scores">
        <ScoreCard
          label="Agent readiness"
          value={report.score?.value}
          caption="Actions an agent is proven to complete"
          unavailableCaption="Readiness could not be computed for this run"
          icon={<CheckCircle2 />}
          accent
        />
        <ScoreCard
          label="AI Audit foundation"
          value={report.foundationAudit?.score}
          caption="Knowledge and discovery signals published"
          unavailableCaption="The foundation audit did not complete, so there is no score to show"
          icon={<ShieldCheck />}
        />
      </div>
      <div className="priority-panel">
        <p className="section-kicker">Highest-impact gaps</p>
        <ol>
          {(report.priorities ?? []).map((priority) => (
            <li key={priority.actionId}>
              <span>{priority.label}</span>
              <small>{priority.state.replace("-", " ")} · {priority.reason}</small>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ScoreCard({
  label,
  value,
  caption,
  unavailableCaption,
  icon,
  accent = false,
}: {
  label: string;
  value?: number;
  caption: string;
  unavailableCaption: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  // A score that could not be produced is unavailable, never zero: 0/100 is a measured result.
  if (value === undefined) {
    return (
      <article className={`score-card score-card-unavailable ${accent ? "score-card-accent" : ""}`}>
        <div className="score-card-head">{icon}<span>{label}</span></div>
        <p className="score-card-value"><strong>Unavailable</strong></p>
        <div className="score-meter" role="img" aria-label="No score available" />
        <p className="score-card-caption">{unavailableCaption}</p>
      </article>
    );
  }
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <article className={`score-card ${accent ? "score-card-accent" : ""}`}>
      <div className="score-card-head">{icon}<span>{label}</span></div>
      <p className="score-card-value"><strong>{value}</strong><small>/100</small></p>
      {/* The bar makes two very different numbers comparable at a glance. */}
      <div className="score-meter" role="img" aria-label={`${bounded} out of 100`}>
        <span style={{ width: `${bounded}%` }} />
      </div>
      <p className="score-card-caption">{caption}</p>
    </article>
  );
}

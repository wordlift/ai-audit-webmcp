import { Bot, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import type { ReportRecord } from "../../shared/types/index.js";

export function ExecutiveSummary({ report }: { report: ReportRecord }) {
  const archetype = report.classification?.primaryArchetype.replaceAll("-", " / ") ?? "Unclassified";
  return (
    <section className="executive-summary" aria-labelledby="summary-heading">
      <div className="summary-copy">
        <p className="section-kicker"><Bot size={18} /> AI agent perspective</p>
        <h1 id="summary-heading">We understand this as a <span>{archetype}</span> site.</h1>
        <p>{report.foundationAudit?.summary ?? "This report maps the functions an agent needs against the evidence available today."}</p>
        {report.contextGraph && <p className="summary-context-count">Built from {report.contextGraph.pages.length} representative pages, {report.contextGraph.entities.length} named entities and {report.contextGraph.interfaces.length} observed interfaces.</p>}
        {report.publishedWith && (
          <aside className="published-with" aria-label="Publishing platform">
            <p>
              <Sparkles size={15} aria-hidden="true" /> This site runs <strong>{report.publishedWith.name}</strong>
            </p>
            <small>{report.publishedWith.evidence}.</small>
            <a href="https://my.wordlift.io" target="_blank" rel="noreferrer">Manage it in your WordLift dashboard →</a>
          </aside>
        )}
      </div>
      <div className="score-grid" aria-label="Readiness scores">
        <ScoreCard
          label="Agent readiness"
          value={report.score?.value ?? 0}
          caption="Actions an agent is proven to complete"
          icon={<CheckCircle2 />}
          accent
        />
        <ScoreCard
          label="AI Audit foundation"
          value={report.foundationAudit?.score ?? 0}
          caption="Knowledge and discovery signals published"
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
  icon,
  accent = false,
}: {
  label: string;
  value: number;
  caption: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
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

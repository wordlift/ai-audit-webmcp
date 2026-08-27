import { Bot, CheckCircle2, ShieldCheck } from "lucide-react";
import type { ReportRecord } from "../../shared/types/index.js";

export function ExecutiveSummary({ report }: { report: ReportRecord }) {
  const archetype = report.classification?.primaryArchetype.replaceAll("-", " / ") ?? "Unclassified";
  return (
    <section className="executive-summary" aria-labelledby="summary-heading">
      <div className="summary-copy">
        <p className="section-kicker"><Bot size={18} /> AI agent perspective</p>
        <h1 id="summary-heading">We understand this as a <span>{archetype}</span> site.</h1>
        <p>{report.foundationAudit?.summary ?? "This report maps the functions an agent needs against the evidence available today."}</p>
      </div>
      <div className="score-grid" aria-label="Readiness scores">
        <ScoreCard label="Agent readiness" value={report.score?.value ?? 0} icon={<CheckCircle2 />} accent />
        <ScoreCard label="AI Audit foundation" value={report.foundationAudit?.score ?? 0} icon={<ShieldCheck />} />
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

function ScoreCard({ label, value, icon, accent = false }: { label: string; value: number; icon: React.ReactNode; accent?: boolean }) {
  return (
    <article className={`score-card ${accent ? "score-card-accent" : ""}`}>
      <div>{icon}<span>{label}</span></div><strong>{value}</strong><small>/100</small>
    </article>
  );
}

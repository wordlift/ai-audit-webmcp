import { ChevronDown, Gauge, Sparkles } from "lucide-react";
import type { FoundationAuditSummary } from "../../shared/types/index.js";

export function FoundationAuditDetails({ audit }: { audit: FoundationAuditSummary }) {
  return (
    <details className="foundation-details">
      <summary>
        <span><Gauge /> Full WordLift audit</span>
        <small>{audit.sections.length} audited dimensions · {audit.findings.length} findings</small>
        <ChevronDown />
      </summary>
      <div className="foundation-details-body">
        {audit.quickWins.length > 0 && (
          <section className="quick-wins">
            <h3><Sparkles /> Quick wins</h3>
            <ul>{audit.quickWins.map((win) => <li key={win.title}><strong>{win.title}</strong>{win.impact && <span>{win.impact} impact</span>}</li>)}</ul>
          </section>
        )}
        <div className="audit-section-grid">
          {audit.sections.map((section) => (
            <section key={section.id} className="audit-section">
              <header><h3>{section.label}</h3>{section.score !== undefined && <strong>{Math.round(section.score)}</strong>}</header>
              {section.status && <span className="audit-status">{section.status}</span>}
              {section.explanation && <p>{section.explanation}</p>}
              {section.details.length > 0 && <dl>{section.details.map((detail) => <div key={`${detail.label}:${detail.value}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
            </section>
          ))}
        </div>
      </div>
    </details>
  );
}

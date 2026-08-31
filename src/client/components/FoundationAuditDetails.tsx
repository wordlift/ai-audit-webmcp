import { Bot, ChevronDown, ExternalLink, Gauge, ListChecks, Sparkles } from "lucide-react";
import type { FoundationAuditSummary } from "../../shared/types/index.js";

const MAIN_AI_AUDIT_URL = "https://audit.wordlift.io";
const ALLOWED = /allow|full|open|granted|ok/i;
const BLOCKED = /block|disallow|denied|forbidden|no access/i;

export function FoundationAuditDetails({ audit }: { audit: FoundationAuditSummary }) {
  const bots = audit.botAccess ?? [];

  return (
    <section className="foundation-audit-block" aria-label="WordLift foundation audit">
      <details className="foundation-details">
        <summary>
          <span><Gauge /> Full WordLift audit</span>
          <small>{audit.score}/100 foundation · {audit.sections.length} audited dimensions · {audit.findings.length} findings</small>
          <ChevronDown />
        </summary>
        <div className="foundation-details-body">
          <header className="foundation-scoreboard">
            <div className="foundation-score" aria-label={`Foundation score ${audit.score} out of 100`}>
              <strong>{audit.score}</strong><span>/100</span>
              <small>Foundation score</small>
            </div>
            <div className="foundation-meta">
              <p className="foundation-summary">{audit.summary}</p>
              <p className="foundation-provenance">
                <span>Source: WordLift AI Audit API{audit.collectedAt ? ` · collected ${new Date(audit.collectedAt).toLocaleString()}` : ""}</span>
                {audit.sourceUrl && <a href={audit.sourceUrl} target="_blank" rel="noreferrer">Audited site <ExternalLink /></a>}
              </p>
            </div>
          </header>
          {bots.length > 0 && (
            <section className="crawler-access" aria-label="AI crawler access">
              <h3><Bot /> AI crawler access</h3>
              <p className="foundation-note">The robots policy is the front door: an agent that cannot crawl cannot ground.</p>
              <div className="bot-chips">
                {bots.map((bot) => (
                  <span
                    key={bot.name}
                    className={`bot-chip ${BLOCKED.test(bot.status) ? "bot-blocked" : ALLOWED.test(bot.status) ? "bot-allowed" : ""}`}
                    title={bot.vendor ? `${bot.vendor} · ${bot.status}` : bot.status}
                  >
                    {bot.name} · {bot.status.toLowerCase()}
                  </span>
                ))}
              </div>
            </section>
          )}
          {audit.quickWins.length > 0 && (
            <section className="quick-wins">
              <h3><Sparkles /> Quick wins</h3>
              <ul>{audit.quickWins.map((win) => <li key={win.title}><strong>{win.title}</strong>{win.impact && <span>{win.impact} impact</span>}</li>)}</ul>
            </section>
          )}
          {audit.findings.length > 0 && (
            <section className="foundation-findings">
              <h3><ListChecks /> Audit findings</h3>
              <ul>{audit.findings.map((finding, index) => <li key={`${index}:${finding}`}>{finding}</li>)}</ul>
            </section>
          )}
          <div className="audit-section-grid">
            {audit.sections.map((section) => (
              <section key={section.id} className="audit-section">
                <header>
                  <h3>{section.label}</h3>
                  {section.score !== undefined && <strong>{Math.round(section.score)}</strong>}
                </header>
                {section.status && <span className="audit-status">{section.status}</span>}
                {section.explanation && <p>{section.explanation}</p>}
                {section.details.length > 0 && <dl>{section.details.map((detail) => <div key={`${detail.label}:${detail.value}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
              </section>
            ))}
          </div>
          <footer className="foundation-footer">
            <p>The foundation score is WordLift's site-level AI readiness. It sits beside agent readiness and is never blended into it.</p>
            <a href={MAIN_AI_AUDIT_URL} target="_blank" rel="noreferrer">Run the complete audit on audit.wordlift.io <ExternalLink /></a>
          </footer>
        </div>
      </details>
      <a className="main-audit-link" href={MAIN_AI_AUDIT_URL} target="_blank" rel="noreferrer">
        <Gauge /> Open the full AI Audit on audit.wordlift.io <ExternalLink />
      </a>
    </section>
  );
}

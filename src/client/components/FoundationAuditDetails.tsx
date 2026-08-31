import { Bot, ChevronDown, ExternalLink, Gauge, Layers, ListChecks, Sparkles } from "lucide-react";
import type { FoundationAuditSummary } from "../../shared/types/index.js";

const MAIN_AI_AUDIT_URL = "https://audit.wordlift.io";
const ALLOWED = /allow|full|open|granted|ok/i;
const BLOCKED = /block|disallow|denied|forbidden|no access/i;
const LEAD_FINDINGS = 3;

type Tone = "bad" | "warn" | "neutral" | "good";
const TONE_RANK: Record<Tone, number> = { bad: 0, warn: 1, neutral: 2, good: 3 };

/** Reads the audit's free-text status into one of four tones, so the eye can sort before the mind reads. */
function toneOf(status?: string): Tone {
  if (!status) return "neutral";
  if (/poor|critical|missing|fail|bad|blocked|error/i.test(status)) return "bad";
  if (/need|improv|fair|partial|warn|limited|moderate/i.test(status)) return "warn";
  if (/good|excellent|strong|pass|ok|complete|ready/i.test(status)) return "good";
  return "neutral";
}

export function FoundationAuditDetails({ audit }: { audit: FoundationAuditSummary }) {
  const bots = audit.botAccess ?? [];
  // Dimensions that need attention come first; the audit's own order is kept within a tone.
  const dimensions = audit.sections
    .map((section) => ({ section, tone: toneOf(section.status) }))
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);
  const tally = { bad: 0, warn: 0, neutral: 0, good: 0 };
  for (const { tone } of dimensions) tally[tone] += 1;

  // A finding that only restates a dimension's status or a quick win is already on screen.
  const restated = new Set([
    ...audit.sections.map((section) => `${section.label}: ${section.status}${section.score === undefined ? "" : ` (${section.score})`}`),
    ...audit.quickWins.map((win) => `Quick win: ${win.title}${win.impact ? ` (${win.impact} impact)` : ""}`),
  ]);
  const findings = audit.findings.filter((finding) => !restated.has(finding));
  const leadFindings = findings.slice(0, LEAD_FINDINGS);
  const moreFindings = findings.slice(LEAD_FINDINGS);

  return (
    <section className="foundation-audit-block" aria-label="WordLift foundation audit">
      <details className="foundation-details">
        <summary>
          <span><Gauge /> Full WordLift audit</span>
          <small>{audit.score}/100 foundation · {tally.good}/{audit.sections.length} dimensions good · {findings.length} findings</small>
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
              {audit.sections.length > 0 && (
                <ul className="foundation-tally" aria-label="Dimension status">
                  {tally.good > 0 && <li className="tone-good">{tally.good} good</li>}
                  {tally.warn > 0 && <li className="tone-warn">{tally.warn} to improve</li>}
                  {tally.bad > 0 && <li className="tone-bad">{tally.bad} critical</li>}
                  {tally.neutral > 0 && <li>{tally.neutral} unrated</li>}
                </ul>
              )}
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

          {dimensions.length > 0 && (
            <section className="audit-dimensions" aria-label="Audited dimensions">
              <h3><Layers /> Audited dimensions</h3>
              <ol className="dimension-list">
                {dimensions.map(({ section, tone }) => (
                  <li key={section.id} className={`dimension tone-${tone}`}>
                    <div className="dimension-row">
                      <span className="dimension-dot" aria-hidden="true" />
                      <div className="dimension-main">
                        <strong>{section.label}</strong>
                        {section.explanation && <p>{section.explanation}</p>}
                      </div>
                      {section.status && <span className="dimension-status">{section.status}</span>}
                      {section.score !== undefined && (
                        <span className="dimension-score">{Math.round(section.score)}<small>pts</small></span>
                      )}
                    </div>
                    {section.details.length > 0 && (
                      <details className="dimension-details">
                        <summary>{section.details.length} detail{section.details.length === 1 ? "" : "s"} <ChevronDown /></summary>
                        <dl>{section.details.map((detail) => <div key={`${detail.label}:${detail.value}`}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {findings.length > 0 && (
            <section className="foundation-findings">
              <h3><ListChecks /> Audit findings</h3>
              <ul>{leadFindings.map((finding, index) => <li key={`${index}:${finding}`}>{finding}</li>)}</ul>
              {moreFindings.length > 0 && (
                <details className="more-findings">
                  <summary>Show {moreFindings.length} more finding{moreFindings.length === 1 ? "" : "s"} <ChevronDown /></summary>
                  <ul>{moreFindings.map((finding, index) => <li key={`${index}:${finding}`}>{finding}</li>)}</ul>
                </details>
              )}
            </section>
          )}

          <footer className="foundation-footer">
            <p>The foundation score is WordLift's site-level AI readiness. It is shown beside the agent score and never blended into it.</p>
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

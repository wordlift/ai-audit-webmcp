import type { FoundationAuditSummary } from "../../shared/types/index.js";

const ALLOWED = /allow|full|open|granted|ok/i;
const BLOCKED = /block|disallow|denied|forbidden|no access/i;

/**
 * The foundation audit's own structure: which AI crawlers may even read the site, how each
 * section scored, and the quickest wins. This data was always collected — now it is shown.
 */
export function FoundationPanel({ foundation }: { foundation: FoundationAuditSummary }) {
  const sections = foundation.sections ?? [];
  const bots = foundation.botAccess ?? [];
  const wins = foundation.quickWins ?? [];
  if (sections.length === 0 && bots.length === 0 && wins.length === 0) return null;

  return (
    <div className="foundation-panel">
      {bots.length > 0 && (
        <section aria-label="AI crawler access">
          <h4>Who may read this site</h4>
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
      {sections.length > 0 && (
        <section aria-label="Foundation sections">
          <h4>Foundation, by section</h4>
          <ul className="foundation-sections">
            {sections.map((section) => (
              <li key={section.label}>
                <span>{section.label}</span>
                {typeof section.score === "number" && (
                  <span className="foundation-meter" role="img" aria-label={`${section.score} out of 100`}>
                    <i style={{ width: `${section.score}%` }} />
                  </span>
                )}
                <small>{typeof section.score === "number" ? section.score : section.status}</small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {wins.length > 0 && (
        <section aria-label="Quick wins">
          <h4>Quickest wins</h4>
          <ul className="foundation-wins">
            {wins.map((win) => (
              <li key={win.title}>
                {win.title}
                {win.impact && <span className={`win-impact win-${win.impact.toLowerCase()}`}>{win.impact}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

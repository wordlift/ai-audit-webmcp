import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useMatch } from "react-router-dom";
import { AuditWebsiteTool } from "../webmcp/AuditWebsiteTool";
import { GetAuditReportTool } from "../webmcp/GetAuditReportTool";
import { MODE_HASH, modeFromHash, reportHref } from "./nav";

/**
 * The one bar every screen shares. On a report it carries the three intentions, the current one
 * lit: Audit, Fix, Activate. They are views over the same report, so moving between them keeps the
 * report and what is selected. Evidence, the precise layer, sits to the right and is never a step.
 */
const STEPS = [
  { id: "audit", label: "Audit", hint: "What we understood about the business, and what agents can do" },
  { id: "fix", label: "Fix", hint: "Review the model and say who handles each action" },
  { id: "activate", label: "Activate", hint: "Make this knowledge and these capabilities usable" },
] as const;

export function SiteHeader() {
  const location = useLocation();
  const match = useMatch("/reports/:reportId/*");
  const reportId = match?.params.reportId;
  const onActivate = Boolean(reportId) && /\/activate\/?$/.test(location.pathname);
  const mode = modeFromHash(location.hash);
  const current = onActivate ? "activate" : mode;
  const [share, setShare] = useState<"idle" | "copied" | "failed">("idle");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShare("copied");
    } catch {
      setShare("failed");
    }
    window.setTimeout(() => setShare("idle"), 2_500);
  }

  return (
    <header className={`site-header${reportId ? " site-header-report" : ""}`}>
      <div className="site-header-inner">
        <Link className="wordlift-brand" to="/" aria-label="WordLift AI Audit home">
          <img className="wordlift-mark" src="/brand/wordmark-sky.svg" alt="WordLift" width={116} height={24} />
          <span className="product-name">AI Audit</span>
        </Link>
        {reportId && (
          <nav className="step-nav" aria-label="Steps">
            <ol>
              {STEPS.map((step, index) => {
                const isCurrent = step.id === current;
                // Coming back from Activate, the selection is on the report's own address, not this one.
                const to = step.id === "activate" ? `/reports/${reportId}/activate` : onActivate ? `/reports/${reportId}${MODE_HASH[step.id]}` : reportHref(reportId, step.id, location.search);
                return (
                  <li key={step.id}>
                    <Link className={`step-link${isCurrent ? " is-current" : ""}`} to={to} title={step.hint} aria-current={isCurrent ? "step" : undefined}>
                      <span className="step-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      {step.label}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <div className="header-status">
          <AuditWebsiteTool />
          <GetAuditReportTool />
          {reportId ? (
            <>
              <Link className={`header-link${current === "evidence" ? " is-current" : ""}`} to={`/reports/${reportId}${MODE_HASH.evidence}`} aria-current={current === "evidence" ? "page" : undefined}>
                Evidence
              </Link>
              <button type="button" className="header-link" onClick={() => void copyLink()}>
                {share === "copied" ? "Link copied" : share === "failed" ? "Copy the address bar" : "Share"} <ArrowUpRight size={15} aria-hidden="true" />
              </button>
              <span className="sr-only" role="status">{share === "copied" ? "Report link copied" : ""}</span>
            </>
          ) : (
            <span className="open-source-label">Open source</span>
          )}
        </div>
      </div>
    </header>
  );
}

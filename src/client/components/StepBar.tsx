import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

/**
 * The three steps a person walks, on both pages, the current one lit: Audit, Fix, Activate. On the
 * report the first two are places on the page and the third is the next page; on Activate the
 * first two lead back. The full audit stays a quieter entry at the end, never a step.
 */
export type Step = "audit" | "fix" | "activate";

const STEPS: ReadonlyArray<{ id: Step; label: string; hint: string }> = [
  { id: "audit", label: "Audit", hint: "What agents can do today" },
  { id: "fix", label: "Fix", hint: "What agents cannot read yet, and who runs what" },
  { id: "activate", label: "Activate", hint: "Publish it, and keep it agent-ready" },
];

/** On the report, the lit step follows the reader: the section nearest the top of the viewport. */
function useStepInView(reportId: string, enabled: boolean): Step {
  const [current, setCurrent] = useState<Step>("audit");
  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return;
    const targets = (["audit", "fix", "activate"] as Step[]).map((step) => document.getElementById(`step-${step}`)).filter((el): el is HTMLElement => Boolean(el));
    const visible = new Map<Step, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id.replace("step-", "") as Step, entry.isIntersecting ? entry.boundingClientRect.top : Number.POSITIVE_INFINITY);
        const inView = [...visible.entries()].filter(([, top]) => Number.isFinite(top)).sort((left, right) => Math.abs(left[1]) - Math.abs(right[1]));
        if (inView[0]) setCurrent(inView[0][0]);
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.1] },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [reportId, enabled]);
  return current;
}

export function StepBar({ reportId, page, children }: { reportId: string; page: "report" | "activate"; children?: React.ReactNode }) {
  const inView = useStepInView(reportId, page === "report");
  const current: Step = page === "activate" ? "activate" : inView;
  const report = `/reports/${reportId}`;
  return (
    <nav className="step-bar" aria-label="Steps">
      <ol className="step-list">
        {STEPS.map((step, index) => {
          const isCurrent = step.id === current;
          const href = step.id === "activate" ? `${report}/activate` : page === "report" ? `#step-${step.id}` : `${report}#step-${step.id}`;
          const className = `step-link${isCurrent ? " is-current" : ""}`;
          const label = (
            <>
              <span className="step-index" aria-hidden="true">{index + 1}</span>
              {step.label}
            </>
          );
          return (
            <li key={step.id}>
              {href.startsWith("#") ? (
                <a className={className} href={href} title={step.hint} aria-current={isCurrent ? "step" : undefined}>{label}</a>
              ) : (
                <Link className={className} to={href} title={step.hint} aria-current={isCurrent ? "step" : undefined}>{label}</Link>
              )}
            </li>
          );
        })}
        <li className="step-aside">
          {page === "report" ? (
            <a className="step-link step-link-quiet" href="#full-audit" onClick={() => { const fold = document.getElementById("full-audit") as HTMLDetailsElement | null; if (fold) fold.open = true; }}>Full audit</a>
          ) : (
            <Link className="step-link step-link-quiet" to={`${report}#full-audit`}>Full audit</Link>
          )}
        </li>
      </ol>
      {children && <div className="step-bar-actions">{children}</div>}
    </nav>
  );
}

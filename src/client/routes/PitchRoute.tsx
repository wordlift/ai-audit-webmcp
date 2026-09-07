import { ArrowRight, Share2, Swords } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { explainReportError, visibleErrors } from "../../shared/format/explainError.js";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { ApiError, getReport, startReport } from "../api/client";
import { actionsThatMatter, nextStep, plainWord, readAgo } from "../components/FirstScreen";
import { publishUrl } from "../components/FixPanel";

/**
 * The pitch: one site against up to two competitors, on one screen, free and shareable. How an
 * agency walks into a prospect: here is what AI agents cannot do with your website, and here is
 * what they can do with your competitor's. Three audits, one link. A competitor read today is
 * read from today's crawl, so the third pitch of the week costs nothing new.
 */
const MAX_SITES = 3;
const WORD_LABEL = { works: "Works", fix: "Fix this", talk: "Talk to us" } as const;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function archetypeOf(report: ReportRecord): string {
  const primary = report.classification?.primaryArchetype;
  return !primary || primary === "other" ? "general" : primary.replaceAll("-", " / ");
}

/** The gaps the prospect would be sold on: every expected action an agent cannot complete, widest first. */
export function gapsFor(report: ReportRecord): CapabilityResult[] {
  return actionsThatMatter(report.capabilities ?? [], 80).filter((capability) => capability.state !== "agent-ready");
}

export function PitchCompare({ reports, now = () => Date.now() }: { reports: ReportRecord[]; now?: () => number }) {
  const [copied, setCopied] = useState(false);
  const [prospect, ...competitors] = reports;
  if (!prospect) return null;
  const rows = actionsThatMatter(prospect.capabilities ?? []);
  const gaps = gapsFor(prospect);

  async function share() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <section className="pitch-page" aria-labelledby="pitch-title">
      <nav className="report-toolbar" aria-label="Pitch actions">
        <Link to="/pitch"><ArrowRight size={17} /> New pitch</Link>
        <button type="button" onClick={() => void share()}><Share2 size={17} /> {copied ? "Copied" : "Share pitch"}</button>
      </nav>

      <header className="pitch-head">
        <p className="section-kicker"><Swords size={16} /> The pitch</p>
        <h1 id="pitch-title">
          {hostOf(prospect.canonicalUrl ?? prospect.requestedUrl)}
          {competitors.length > 0 && <span> against {competitors.map((report) => hostOf(report.canonicalUrl ?? report.requestedUrl)).join(" and ")}</span>}
        </h1>
        <p>What AI agents can do on each site today, verified by calling. The same three actions, the ones that matter for a {archetypeOf(prospect)} site, across all of them.</p>
      </header>

      <div className="pitch-cards" role="list" aria-label="Agent readiness by site">
        {reports.map((report, index) => (
          <article key={report.id} className={`pitch-card ${index === 0 ? "pitch-card-prospect" : ""}`} role="listitem">
            <p className="pitch-card-role">{index === 0 ? "Prospect" : `Competitor ${index}`}</p>
            <h2>{hostOf(report.canonicalUrl ?? report.requestedUrl)}</h2>
            <p className="first-meta">
              <span className="chip-arche">{archetypeOf(report)}</span>
              {readAgo(report.collectedAt, now()) && <span>{readAgo(report.collectedAt, now())}</span>}
            </p>
            <p className="pitch-score"><b>{report.score?.value ?? "–"}</b> of 100 agent-ready</p>
            <Link to={`/reports/${report.id}`}>Open the report</Link>
          </article>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="table-scroll">
          <table className="pitch-table">
            <thead>
              <tr>
                <th scope="col">Action</th>
                {reports.map((report, index) => (
                  <th key={report.id} scope="col">{index === 0 ? "Prospect" : hostOf(report.canonicalUrl ?? report.requestedUrl)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.actionId}>
                  <th scope="row">{row.label}</th>
                  {reports.map((report) => {
                    const capability = report.capabilities?.find((item) => item.actionId === row.actionId);
                    const word = capability ? plainWord(capability) : null;
                    return (
                      <td key={report.id}>
                        {word ? <span className={`plain-word plain-word-${word}`}>{WORD_LABEL[word]}</span> : <span className="pitch-none">not expected</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="pitch-gaps" aria-labelledby="pitch-gaps-title">
        <h2 id="pitch-gaps-title">{gaps.length === 0 ? "Nothing to fix: every expected action works for agents." : `Fix these ${gaps.length} ${gaps.length === 1 ? "issue" : "issues"}`}</h2>
        {gaps.length > 0 && (
          <ol>
            {gaps.map((gap) => {
              const word = plainWord(gap) ?? "fix";
              return (
                <li key={gap.actionId}>
                  <span className={`plain-word plain-word-${word}`}>{WORD_LABEL[word]}</span>
                  <strong>{gap.label}</strong>
                  <small>{nextStep(gap)}</small>
                </li>
              );
            })}
          </ol>
        )}
        <p className="fix-cta">
          <a className="fix-publish" href={publishUrl(prospect.id)} target="_blank" rel="noreferrer">Publish with WordLift</a>
          <span>Fix and Activate are the work; this page is the meeting.</span>
        </p>
      </section>
    </section>
  );
}

function PitchForm() {
  const navigate = useNavigate();
  const [urls, setUrls] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const targets = urls.map((value) => value.trim()).filter(Boolean).slice(0, MAX_SITES);
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // Three audits at once; a site read today is served from today's crawl by the service.
      const started = targets.map((target) => startReport(target, { surface: "web" }));
      await Promise.all(started.map((entry) => entry.accepted));
      for (const entry of started) entry.ready.catch(() => undefined);
      navigate(`/pitch/${started.map((entry) => entry.reportId).join(",")}`);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "The audit could not be started");
    }
  }

  return (
    <section className="home-page">
      <div className="hero" aria-labelledby="pitch-form-title">
        <div className="eyebrow"><Swords size={16} /> Free · one link · three sites</div>
        <h1 id="pitch-form-title">What can AI agents do on their site, <span>and on their competitors'?</span></h1>
        <p className="hero-copy">
          A prospect and up to two competitors, audited side by side: what works for agents, what does not, and what to fix first. Walk into the meeting with the page.
        </p>
        <form className="audit-form pitch-form" onSubmit={submit}>
          {["Prospect website URL", "Competitor URL", "Second competitor URL (optional)"].map((label, index) => (
            <label key={label} htmlFor={`pitch-url-${index}`}>
              {label}
              <input
                id={`pitch-url-${index}`}
                type="url"
                placeholder="https://example.com"
                value={urls[index] ?? ""}
                required={index === 0}
                onChange={(event) => setUrls((current) => current.map((value, at) => (at === index ? event.target.value : value)))}
              />
            </label>
          ))}
          <div className="input-row">
            <button type="submit" disabled={busy}>{busy ? "Reading the sites" : "Compare them"} <ArrowRight size={18} /></button>
          </div>
          <p>Public websites only. Each site gets its own report, free and shareable.</p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </div>
    </section>
  );
}

export function PitchRoute() {
  const { ids = "" } = useParams();
  const reportIds = ids.split(",").map((value) => value.trim()).filter(Boolean).slice(0, MAX_SITES);
  const [reports, setReports] = useState<Record<string, ReportRecord | { error: string }>>({});

  useEffect(() => {
    if (reportIds.length === 0) return;
    let cancelled = false;
    const timers: number[] = [];
    // Each report is watched on its own until it lands; the page fills in column by column.
    const watch = (id: string, attempt = 0) => {
      getReport(id)
        .then((record) => {
          if (cancelled) return;
          setReports((current) => ({ ...current, [id]: record }));
          if (record.status === "running") timers.push(window.setTimeout(() => watch(id, attempt + 1), 1_500));
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof ApiError && caught.status === 404 && attempt < 12) {
            timers.push(window.setTimeout(() => watch(id, attempt + 1), 700));
            return;
          }
          setReports((current) => ({ ...current, [id]: { error: caught instanceof Error ? caught.message : "Report unavailable" } }));
        });
    };
    for (const id of reportIds) watch(id);
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  if (reportIds.length === 0) return <PitchForm />;

  const landed = reportIds.map((id) => reports[id]).filter((entry): entry is ReportRecord => Boolean(entry) && !("error" in entry!) && (entry as ReportRecord).status !== "running");
  const pending = reportIds.filter((id) => !reports[id] || ("status" in reports[id]! && (reports[id] as ReportRecord).status === "running"));
  const failed = reportIds.filter((id) => reports[id] && "error" in reports[id]!);

  if (landed.length < reportIds.length - failed.length) {
    return (
      <div className="report-loading" role="status">
        Reading {pending.length} of {reportIds.length} sites…{failed.length > 0 && ` ${failed.length} could not be read.`}
      </div>
    );
  }
  const usable = landed.filter((report) => report.status !== "failed");
  if (usable.length === 0) {
    return <div className="report-loading" role="status">None of the sites could be read: {landed.map((report) => visibleErrors(report.errors).map(explainReportError).join(" ")).join(" ")}</div>;
  }
  return <PitchCompare reports={usable} />;
}

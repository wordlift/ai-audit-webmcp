import { ArrowLeft, ArrowUpRight, Copy, Radar, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Publication, PublishedAction, ScoreReading } from "../../shared/types/activate.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { getPublication, getReport, getVisits, type ReportVisits } from "../api/client";
import { publishUrl } from "../components/FixPanel";
import { OWN_WORDS } from "../components/OwnIt";
import { ReportErrorState } from "../components/ReportErrorState";

/**
 * Activate: what the site publishes from this report, and what happened since. One model rendered
 * three ways, a table of what the owner said against what the page carries, and then the numbers
 * that close the loop: the score and how it moved, crawlers by name, Google's verified reads, the
 * agents that read the instructions, and the agents that activated a capability, with each failure
 * and its reason. Every number here equals the ledger; an empty ledger says what to expect, never a
 * row of zeros.
 */
const PREVIEW_LINES = 28;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Plain words for what the page carries; the precise reason sits beside them. */
export function carries(action: PublishedAction): string {
  switch (action.publishedAs) {
    case "action":
      return action.entryPoint?.via === "sidecar" ? "The action, with its entry point, run by WordLift" : "The action, with its entry point";
    case "handoff":
      return action.provider ? `The action, with ${action.provider.name} as provider` : "The action, handed off";
    case "entity":
      return "The entity, no action";
    case "nothing":
      return "Nothing";
  }
}

export function saidWord(action: PublishedAction): string {
  return action.boundary ? OWN_WORDS[action.boundary] : "Undecided";
}

const CRAWLER_NAMES: Record<string, string> = {
  googlebot: "Googlebot",
  googleother: "GoogleOther",
  "google-extended": "Google-Extended",
  "google-cloudvertexbot": "Google-CloudVertexBot",
  bingbot: "Bingbot",
  gptbot: "GPTBot",
  "oai-searchbot": "OAI-SearchBot",
  "chatgpt-user": "ChatGPT-User",
  claudebot: "ClaudeBot",
  "claude-user": "Claude-User",
  "claude-searchbot": "Claude-SearchBot",
  perplexitybot: "PerplexityBot",
  applebot: "Applebot",
  amazonbot: "Amazonbot",
  "meta-externalagent": "Meta-ExternalAgent",
  bytespider: "Bytespider",
  ccbot: "CCBot",
  duckassistbot: "DuckAssistBot",
  other: "Other crawlers",
};

const PLATFORM_NAMES: Record<string, string> = {
  anthropic: "Claude (Anthropic)",
  openai: "ChatGPT (OpenAI)",
  google: "Gemini (Google)",
  perplexity: "Perplexity",
};

export interface Count {
  name: string;
  count: number;
}

function sumByPrefix(visits: ReportVisits | null, prefix: string, keep: (rest: string) => boolean = () => true): Map<string, number> {
  const totals = new Map<string, number>();
  for (const day of visits?.days ?? []) {
    for (const [cls, count] of Object.entries(day.counts)) {
      if (!cls.startsWith(prefix)) continue;
      const rest = cls.slice(prefix.length);
      if (!keep(rest)) continue;
      totals.set(rest, (totals.get(rest) ?? 0) + count);
    }
  }
  return totals;
}

const byCount = (left: Count, right: Count) => right.count - left.count || left.name.localeCompare(right.name);

/** Crawlers by name, most frequent first. A Googlebot from an unverified address is not Google and is not listed as one. */
export function crawlersByName(visits: ReportVisits | null): Count[] {
  return [...sumByPrefix(visits, "crawler:", (name) => !name.startsWith("claimed-"))]
    .map(([name, count]) => ({ name: CRAWLER_NAMES[name] ?? name, count }))
    .sort(byCount);
}

/** Verified Googlebot reads: the requests Google's own ranges vouched for. */
export function googleReads(visits: ReportVisits | null): number {
  return sumByPrefix(visits, "crawler:googlebot").get("") ?? 0;
}

/** Requests that claimed to be Google and were not. */
export function claimedGoogle(visits: ReportVisits | null): number {
  let total = 0;
  for (const [, count] of sumByPrefix(visits, "crawler:claimed-google")) total += count;
  return total;
}

/** Agents by platform: a hosted assistant's egress, or an MCP client by name. */
export function agentsByPlatform(visits: ReportVisits | null): Count[] {
  return [...sumByPrefix(visits, "agent:")].map(([name, count]) => ({ name: PLATFORM_NAMES[name] ?? name, count })).sort(byCount);
}

export interface ActivationSummary {
  tool: string;
  ok: number;
  failed: number;
  /** Each failure with its reason: the moment the owner learns a capability changed. */
  failures: Count[];
  surfaces: Count[];
}

export function reasonLabel(reason: string): string {
  return reason.replace(/[_-]+/g, " ").trim() || "unknown reason";
}

/** Activations by tool: how many succeeded, how many failed and why, and from which surface. */
export function activationSummary(visits: ReportVisits | null): ActivationSummary[] {
  const tools = new Map<string, ActivationSummary & { failureMap: Map<string, number>; surfaceMap: Map<string, number> }>();
  for (const row of visits?.activations ?? []) {
    const tool = tools.get(row.tool) ?? { tool: row.tool, ok: 0, failed: 0, failures: [], surfaces: [], failureMap: new Map(), surfaceMap: new Map() };
    if (row.outcome === "ok") tool.ok += row.count;
    else {
      tool.failed += row.count;
      const reason = reasonLabel(row.outcome.split(":").slice(1).join(":"));
      tool.failureMap.set(reason, (tool.failureMap.get(reason) ?? 0) + row.count);
    }
    tool.surfaceMap.set(row.surface, (tool.surfaceMap.get(row.surface) ?? 0) + row.count);
    tools.set(row.tool, tool);
  }
  return [...tools.values()]
    .map(({ failureMap, surfaceMap, ...summary }) => ({
      ...summary,
      failures: [...failureMap].map(([name, count]) => ({ name, count })).sort(byCount),
      surfaces: [...surfaceMap].map(([name, count]) => ({ name, count })).sort(byCount),
    }))
    .sort((left, right) => right.ok + right.failed - (left.ok + left.failed));
}

/** "62 → 74 since 1 September": the oldest reading still in the store against the newest. */
export function scoreMovement(history: ScoreReading[] | undefined): { from: number; to: number; since: string } | null {
  if (!history || history.length < 2) return null;
  const sorted = [...history].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return { from: first.score, to: last.score, since: first.createdAt };
}

function preview(text: string): string {
  const lines = text.split("\n");
  return lines.length > PREVIEW_LINES ? `${lines.slice(0, PREVIEW_LINES).join("\n")}\n…` : text;
}

function DocCard({ kind, title, note, text, href }: { kind: string; title: string; note: string; text: string; href: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  return (
    <article className="doc-card" aria-label={title}>
      <header>
        <span className="doc-kind">{kind}</span>
        <h3>{title}</h3>
      </header>
      <p>{note}</p>
      <pre>{preview(text)}</pre>
      <footer>
        <button type="button" onClick={() => void copy()}><Copy size={13} /> {copied ? "Copied" : "Copy"}</button>
        <a href={href} target="_blank" rel="noreferrer">Open the document <ArrowUpRight size={13} aria-hidden="true" /></a>
      </footer>
    </article>
  );
}

const PUBLISHED_ORDER: Record<PublishedAction["publishedAs"], number> = { action: 0, handoff: 1, entity: 2, nothing: 3 };

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

/** The rows that say something of their own, and the two groups that say one thing for many actions. */
export function tableRows(actions: PublishedAction[]): { published: PublishedAction[]; entityOnly: PublishedAction[]; nothing: PublishedAction[] } {
  const sorted = [...actions].sort((left, right) => PUBLISHED_ORDER[left.publishedAs] - PUBLISHED_ORDER[right.publishedAs]);
  return {
    published: sorted.filter((action) => action.publishedAs === "action" || action.publishedAs === "handoff"),
    entityOnly: sorted.filter((action) => action.publishedAs === "entity"),
    nothing: sorted.filter((action) => action.publishedAs === "nothing"),
  };
}

const names = (actions: PublishedAction[]) => actions.map((action) => action.label).join(", ");

export function ActivateScreen({ report, publication, visits }: { report: ReportRecord; publication: Publication; visits: ReportVisits | null }) {
  const host = hostOf(report.canonicalUrl ?? report.requestedUrl);
  const { published: publishedRows, entityOnly, nothing } = tableRows(publication.actions);
  const movement = scoreMovement(visits?.history);
  const crawlers = crawlersByName(visits);
  const google = googleReads(visits);
  const claimed = claimedGoogle(visits);
  const agents = agentsByPlatform(visits);
  const activations = activationSummary(visits);
  const hasInterface = publication.actions.some((action) => action.publishedAs === "action");

  return (
    <div className="activate-page">
      <nav className="report-toolbar" aria-label="Activate actions">
        <Link to={`/reports/${report.id}`}><ArrowLeft size={17} /> Back to the report</Link>
        <a className="fix-publish" href={publishUrl(report.id)} target="_blank" rel="noreferrer">
          Publish with WordLift <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </nav>

      <header className="activate-head">
        <p className="section-kicker"><Rocket size={16} /> Activate</p>
        <h1>{host}</h1>
        <p className="first-sentence">What this site publishes from the report, and who has read it since.</p>
        <p className="activate-score">
          {movement && movement.from !== movement.to ? (
            <>
              <b>{movement.from}</b> <span aria-hidden="true">→</span> <b>{movement.to}</b> of 100 agent-ready since {longDate(movement.since)}
            </>
          ) : movement ? (
            <>
              <b>{movement.to}</b> of 100 agent-ready, unchanged since {longDate(movement.since)}.
            </>
          ) : (
            <>
              <b>{report.score?.value ?? "–"}</b> of 100 agent-ready. The next reading shows how it moved.
            </>
          )}
        </p>
      </header>

      <section className="activate-section" aria-labelledby="carries-title">
        <h2 id="carries-title">What the page carries</h2>
        <p className="activate-lead">
          {publication.decided > 0 ? (
            <>{plural(publication.decided, "decision")} of yours shaped this. </>
          ) : (
            <>
              Nobody has answered <Link to={`/reports/${report.id}#own-it`}>the three questions</Link> yet, so this is what the audit verified, no
              less.{" "}
            </>
          )}
          Nothing is declared that the audit could not call.
        </p>
        <div className="table-scroll">
          <table className="pitch-table activate-table">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">You said</th>
                <th scope="col">The page carries</th>
              </tr>
            </thead>
            <tbody>
              {publishedRows.map((action) => (
                <tr key={action.actionId}>
                  <th scope="row">{action.label}</th>
                  <td>{saidWord(action)}</td>
                  <td>
                    <span className={`carries carries-${action.publishedAs}`}>{carries(action)}</span>
                    <span className="carries-why">{action.because}</span>
                  </td>
                </tr>
              ))}
              {publishedRows.length === 0 && (
                <tr>
                  <th scope="row">No action yet</th>
                  <td>–</td>
                  <td><span className="carries carries-nothing">Nothing an agent can call has answered, so no action is published.</span></td>
                </tr>
              )}
              {entityOnly.length > 0 && (
                <tr className="activate-group">
                  <th scope="row">{entityOnly.length === 1 ? entityOnly[0]!.label : `${entityOnly.length} more actions`}</th>
                  <td>{entityOnly.every((action) => !action.boundary) ? "Undecided" : entityOnly.some((action) => !action.boundary) ? "Mixed" : "Answered"}</td>
                  <td>
                    <span className="carries carries-entity">The entity, no action</span>
                    <span className="carries-why">
                      {entityOnly.length > 1 && <>{names(entityOnly)}. </>}
                      Nothing is declared that an agent could not call; each becomes an action the day an entry point answers.
                    </span>
                  </td>
                </tr>
              )}
              {nothing.length > 0 && (
                <tr className="activate-group">
                  <th scope="row">{nothing.length === 1 ? nothing[0]!.label : `${nothing.length} actions`}</th>
                  <td>Not ours</td>
                  <td>
                    <span className="carries carries-nothing">Nothing</span>
                    <span className="carries-why">{nothing.length > 1 ? `${names(nothing)}. ` : ""}You said these are not yours, so nothing is published for them.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="activate-section" aria-labelledby="documents-title">
        <h2 id="documents-title">Three documents, one model</h2>
        <div className="doc-cards">
          <DocCard
            kind="For finding"
            title="On your pages"
            note="JSON-LD for the site's pages: the entities, and the actions agents may take, each with its entry point or its provider."
            text={JSON.stringify(publication.jsonLd, null, 2)}
            href={publication.documents.pageJsonLd}
          />
          <DocCard
            kind="For acting"
            title="For agents"
            note="The Terms of Action as a file an agent loads before acting. It states boundaries and cites the report; it never claims an action works."
            text={publication.skill}
            href={publication.documents.skill}
          />
          <DocCard
            kind="For discovery"
            title="For registries"
            note={`The catalog registries crawl, served from ${publication.catalogPath} on the site.`}
            text={JSON.stringify(publication.catalog, null, 2)}
            href={publication.documents.catalog}
          />
        </div>
        <p className="fix-cta">
          <a className="fix-publish" href={publishUrl(report.id)} target="_blank" rel="noreferrer">
            Publish with WordLift <ArrowUpRight size={15} aria-hidden="true" />
          </a>
          <span>The plugin puts all three on your site and keeps them current as the site changes. The report id travels with you.</span>
        </p>
      </section>

      <section className="observe" aria-labelledby="observe-title">
        <p className="section-kicker"><Radar size={16} /> Since it was published</p>
        <h2 id="observe-title">Who has read it</h2>
        <div className="observe-grid">
          <article className="observe-card" aria-labelledby="crawlers-title">
            <h3 id="crawlers-title">Crawlers</h3>
            {crawlers.length > 0 ? (
              <ul>
                {crawlers.map((row) => (
                  <li key={row.name}><span>{row.name}</span><b>{row.count}</b></li>
                ))}
              </ul>
            ) : (
              <p className="observe-empty">No crawler yet. Expect the first within days of publishing.</p>
            )}
          </article>
          <article className="observe-card" aria-labelledby="google-title">
            <h3 id="google-title">Google</h3>
            {google > 0 ? (
              <p className="observe-number"><b>{google}</b> {google === 1 ? "verified Googlebot read" : "verified Googlebot reads"}</p>
            ) : (
              <p className="observe-empty">Google has not read it yet. Verified against Google's own address ranges when it does.</p>
            )}
            {claimed > 0 && <p className="observe-note">{plural(claimed, "request")} claimed to be Google and {claimed === 1 ? "was" : "were"} not.</p>}
          </article>
          <article className="observe-card" aria-labelledby="agents-title">
            <h3 id="agents-title">Agents</h3>
            {agents.length > 0 ? (
              <ul>
                {agents.map((row) => (
                  <li key={row.name}><span>{row.name}</span><b>{row.count}</b></li>
                ))}
              </ul>
            ) : (
              <p className="observe-empty">No agent yet. Agents arrive once a directory lists the site, or once someone points one at the report.</p>
            )}
          </article>
          <article className="observe-card" aria-labelledby="activations-title">
            <h3 id="activations-title">Activations</h3>
            {activations.length > 0 ? (
              <ul className="observe-activations">
                {activations.map((tool) => (
                  <li key={tool.tool}>
                    <span className="observe-tool">{tool.tool}</span>
                    <span>
                      <b>{tool.ok}</b> succeeded{tool.failed > 0 ? <>, <b>{tool.failed}</b> failed</> : ""}
                    </span>
                    {tool.failures.length > 0 && (
                      <ul className="observe-failures">
                        {tool.failures.map((failure) => (
                          <li key={failure.name}>{plural(failure.count, "failure")}: {failure.name}</li>
                        ))}
                      </ul>
                    )}
                    <span className="observe-surfaces">{tool.surfaces.map((surface) => `${surface.name} ${surface.count}`).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="observe-empty">
                {hasInterface
                  ? "No agent has activated a capability yet. The first shows here with its outcome."
                  : "Nothing to activate yet: no interface has answered."}
              </p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}

export function ActivateRoute() {
  const { reportId = "" } = useParams();
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [visits, setVisits] = useState<ReportVisits | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [record, published, ledger] = await Promise.all([
          getReport(reportId),
          getPublication(reportId),
          getVisits(reportId).catch(() => null),
        ]);
        if (cancelled) return;
        setReport(record);
        setPublication(published);
        setVisits(ledger);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Nothing to publish yet");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (error) return <ReportErrorState title="Nothing to publish yet" message={error} />;
  if (!report || !publication) return <div className="report-loading" role="status">Preparing what the site publishes…</div>;
  return <ActivateScreen report={report} publication={publication} visits={visits} />;
}

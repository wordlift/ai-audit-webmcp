import { ArrowUpRight, BookOpen, Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Publication, PublishedAction, ScoreReading } from "../../shared/types/activate.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { getPublication, getReport, getVisits, startReport, type ReportVisits } from "../api/client";
import { AgentSurfaces } from "../components/AgentSurfaces";
import { DocDialog, type PublishedDoc } from "../components/DocDialog";
import { runbookPrompt } from "../components/ActivateRunbook";
import { publishUrl, talkToUsUrl } from "../components/FixPanel";
import { OWN_WORDS } from "../components/OwnIt";
import { ReportErrorState } from "../components/ReportErrorState";
import { EngineProvider, useReportEngine } from "../engine/EngineContext";
import { track } from "../engine/track";
import { PROVENANCE_LABEL, RESPONSIBILITY_LABEL, agentStatus, coreEntities, detection, entityCounts, identity, typeWords } from "../surface/surface";
import { AgentMark } from "../surface/ui";

/**
 * Activate: how this knowledge and these capabilities are made usable. On the left, a preview of
 * the publication the report prepares: what agents can use, what they will know, what they are
 * told, with the prepared files one fold below. On the right, the delivery routes the product
 * already has: WordLift setup, an agent with the runbook, and a new audit afterwards. Nothing on
 * this screen publishes; a reviewed decision is never shown as a verified call; and the numbers
 * since publication equal the ledger, with an empty ledger saying what to expect, never zeros.
 */

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


const PUBLISHED_ORDER: Record<PublishedAction["publishedAs"], number> = { action: 0, handoff: 1, entity: 2, nothing: 3 };

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
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

type PreviewTab = "business" | "capabilities" | "rules";
const PREVIEW_TABS: ReadonlyArray<{ id: PreviewTab; label: string }> = [
  { id: "business", label: "Business" },
  { id: "capabilities", label: "Capabilities" },
  { id: "rules", label: "Rules" },
];

/**
 * Whether an action travels in the package as something an agent can call. Only an entry point the
 * audit's agent used is included as one; a person's review is never invocation evidence.
 */
export function publicationWord(action: PublishedAction): string {
  switch (action.publishedAs) {
    case "action":
      return "Included";
    case "handoff":
      return action.provider ? `Included as a handoff to ${action.provider.name}` : "Included as a handoff";
    case "entity":
      return action.state === "unverified" ? "Not included as verified" : "Not included as callable";
    case "nothing":
      return "Not included";
  }
}

export function ActivateScreen({ report, publication, visits }: { report: ReportRecord; publication: Publication; visits: ReportVisits | null }) {
  const navigate = useNavigate();
  const host = hostOf(report.canonicalUrl ?? report.requestedUrl);
  const { published: publishedRows, entityOnly, nothing } = tableRows(publication.actions);
  const movement = scoreMovement(visits?.history);
  const crawlers = crawlersByName(visits);
  const google = googleReads(visits);
  const claimed = claimedGoogle(visits);
  const agents = agentsByPlatform(visits);
  const activations = activationSummary(visits);
  const hasInterface = publication.actions.some((action) => action.publishedAs === "action");
  const { engine } = useReportEngine();
  const found = detection(report);
  // A site that runs WordLift continues in its dashboard; one that does not starts with a conversation.
  const runsWordLift = found.state === "detected";
  const activate = runsWordLift ? publishUrl(report.id, { intent: "activate", engine: engine?.id }) : talkToUsUrl(report.id);
  const who = identity(report);
  const cards = coreEntities(report, 6);
  const counts = entityCounts(report);
  const [tab, setTab] = useState<PreviewTab>("capabilities");
  const [openDoc, setOpenDoc] = useState<PublishedDoc | null>(null);
  const [prompt, setPrompt] = useState<"idle" | "copied" | "failed">("idle");
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const files: Array<PublishedDoc & { file: string; where: string }> = [
    {
      kind: "On your pages",
      title: "Business data",
      file: "page.jsonld",
      where: "the <head> of your home page",
      note: "JSON-LD for the site's pages: the entities, and the actions agents may take, each with its entry point or its provider.",
      text: JSON.stringify(publication.jsonLd, null, 2),
      href: publication.documents.pageJsonLd,
      format: "json",
    },
    {
      kind: "Where registries look",
      title: "Discovery catalog",
      file: "ai-catalog.json",
      where: publication.sitePaths.catalog,
      note: `The catalog registries crawl, served from ${publication.catalogPath} on the site.`,
      text: JSON.stringify(publication.catalog, null, 2),
      href: publication.documents.siteCatalog,
      format: "json",
    },
    {
      kind: "At the site's root",
      title: "llms.txt",
      file: "llms.txt",
      where: publication.sitePaths.llms,
      note: "What the business is, what it offers and where, and what an agent can do, as the markdown index language models read first. Only what the site declares or you confirmed.",
      text: publication.llms,
      href: publication.documents.llms,
      format: "markdown",
    },
    {
      kind: "A file agents load",
      title: "Agent instructions",
      file: "skill.md",
      where: publication.sitePaths.skill,
      note: "The Terms of Action as a file an agent loads before acting. It states boundaries and cites the report; it never claims an action works.",
      text: publication.skill,
      href: publication.documents.skill,
      format: "markdown",
    },
    {
      kind: "For an agent with your code",
      title: "Runbook",
      file: "runbook.md",
      where: "handed to your agent, not published",
      note: "What an agent does to put the documents on the site, and how it proves they are there.",
      text: publication.runbook,
      href: publication.documents.runbook,
      format: "markdown",
    },
  ];
  const runbook = files[4]!;
  const promptText = runbookPrompt(publication);
  const decidedActions = publication.actions.filter((action) => action.boundary);
  const terms = report.contextGraph?.lexicalEntries ?? [];
  const reviewedTerms = terms.filter((term) => term.provenance === "human-provided");

  async function copyPrompt() {
    track(publication.reportId, "runbook_prompt_copied");
    try {
      await navigator.clipboard.writeText(promptText);
      setPrompt("copied");
    } catch {
      // No clipboard: the text is shown, selected, for the person to copy by hand.
      setPrompt("failed");
    }
  }

  async function runAgain() {
    setRerunning(true);
    setRerunError(null);
    try {
      // The same audit, read fresh, at the depth this report ran: nothing is escalated on anyone's behalf.
      const started = startReport(report.requestedUrl, { fresh: true, surface: "web", depth: report.scanDepth });
      await started.accepted;
      navigate(`/reports/${started.reportId}`, { state: { started: true } });
    } catch (caught) {
      setRerunning(false);
      setRerunError(caught instanceof Error ? caught.message : "The site could not be read again.");
    }
  }

  return (
    <div className="activate-page">
      <DocDialog doc={openDoc} onOpenChange={(open) => { if (!open) setOpenDoc(null); }} />

      <div className="activate-main">
        <header className="fix-head">
          <p className="kicker"><span>{host}</span><span>Publication preview</span></p>
          <h1>Activate your Context Engine.</h1>
          <p className="fix-lead">A reviewable package of business knowledge and usable capabilities.</p>
        </header>

        <div className="tabs" role="tablist" aria-label="Publication preview">
          {PREVIEW_TABS.map((entry) => (
            <button key={entry.id} type="button" role="tab" id={`preview-tab-${entry.id}`} aria-selected={tab === entry.id} aria-controls="preview-panel" className={tab === entry.id ? "is-current" : undefined} onClick={() => setTab(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="preview-panel" aria-labelledby={`preview-tab-${tab}`} className="preview-panel">
          {tab === "capabilities" && (
            <>
              <h2>What agents can use</h2>
              <p className="section-lead">Prepared from this report.</p>
              {!hasInterface && (
                <p className="empty-note" role="status">
                  No action in this report is verified as callable, so none is published as one. Your business context and action boundaries can still be prepared while the technical work remains.
                </p>
              )}
              <div className="table-wrap">
                <table className="capability-table preview-table">
                  <thead>
                    <tr>
                      <th scope="col">Capability</th>
                      <th scope="col">Status</th>
                      <th scope="col">Publication</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publication.actions.map((action) => (
                      <tr key={action.actionId} className={action.publishedAs === "entity" && action.state === "unverified" ? "is-uncertain" : undefined}>
                        <th scope="row">{action.label}</th>
                        <td><AgentMark status={agentStatus({ state: action.state })} /></td>
                        <td>
                          {publicationWord(action)}
                          <span className="row-owner">{action.because}</span>
                        </td>
                      </tr>
                    ))}
                    {publication.actions.length === 0 && (
                      <tr><td colSpan={3}>No action is expected of this kind of site, so none is prepared.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Link className="text-button text-button-strong" to={`/reports/${report.id}?view=capabilities#step-fix`}>
                Return to verification <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </>
          )}

          {tab === "business" && (
            <>
              <h2>What agents will know</h2>
              <p className="section-lead">The business context this report holds, each thing with where the knowledge comes from.</p>
              {cards.length > 0 ? (
                <ul className="preview-entities">
                  {cards.map((core) => (
                    <li key={core.entity.id}>
                      <b>{core.entity.name}</b>
                      <span className="quiet">{typeWords(core.view.type)}</span>
                      <span className={`provenance provenance-${core.view.provenance}`}><i aria-hidden="true" />{PROVENANCE_LABEL[core.view.provenance]}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-note">This report holds no products, services or places to publish.</p>
              )}
              <p className="section-lead">
                {plural(counts.total, "entity", "entities")} in the model: {counts.declared} declared, {counts.inferred} inferred. Only what the site declares or a review confirmed is published as fact.
              </p>
            </>
          )}

          {tab === "rules" && (
            <>
              <h2>What agents are told</h2>
              <p className="section-lead">
                {publication.decided > 0
                  ? `${plural(publication.decided, "decision")} of yours shaped this.`
                  : "No responsibility has been reviewed yet, so this publishes what the audit verified, no less."}{" "}
                Nothing is declared that the audit could not call.
              </p>
              <div className="table-wrap">
                <table className="capability-table preview-table">
                  <thead>
                    <tr>
                      <th scope="col">Action</th>
                      <th scope="col">Who handles it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publication.actions.map((action) => (
                      <tr key={action.actionId}>
                        <th scope="row">{action.label}</th>
                        <td>{action.boundary ? <>{RESPONSIBILITY_LABEL[action.boundary]}{action.provider ? `: ${action.provider.name}` : ""}</> : <span className="quiet">Not reviewed</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="section-lead">
                {plural(terms.length, "term")} of vocabulary{reviewedTerms.length > 0 ? `, ${reviewedTerms.length} reviewed` : ", none reviewed yet"}.
                {decidedActions.length === 0 && " "}
              </p>
              <Link className="text-button text-button-strong" to={`/reports/${report.id}?view=capabilities#step-fix`}>
                Review who handles each action <ArrowUpRight size={15} aria-hidden="true" />
              </Link>
            </>
          )}
        </div>

        <section className="activate-context" aria-labelledby="context-title">
          <p className="kicker kicker-quiet">Connected business context</p>
          <h2 id="context-title">{who.state === "resolved" ? who.entity.name : host}</h2>
          {who.state === "needs-review" && <p className="form-hint" role="status">Business identity needs review, so the site's address stands in for its name.</p>}
          <p className="section-lead">Business knowledge, terminology and action boundaries travel together.</p>
          <Link className="text-button text-button-strong" to={`/reports/${report.id}?view=model#step-fix`}>
            Open business context <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </section>

        <details className="technical-files">
          <summary>Technical files &amp; contracts <ChevronDown size={18} aria-hidden="true" /></summary>
          <p className="section-lead">
            Prepared from this report. A file read or downloaded here is a prepared package, not a deployment: nothing is on your site until the route you choose puts it there.
          </p>
          <ul className="file-list">
            {files.map((file) => (
              <li key={file.file}>
                <div>
                  <b>{file.title}</b>
                  <code>{file.file}</code>
                  <span className="quiet">Goes to: {file.where}</span>
                </div>
                <button type="button" className="text-button" onClick={() => setOpenDoc(file)}>
                  <BookOpen size={14} aria-hidden="true" /> Read
                </button>
                <a className="text-button" href={file.href} target="_blank" rel="noreferrer">Download <ArrowUpRight size={13} aria-hidden="true" /></a>
              </li>
            ))}
          </ul>

          <h3 id="carries-title">What the page carries</h3>
          <div className="table-wrap">
            <table className="capability-table preview-table">
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
                      {carries(action)}
                      <span className="row-owner">{action.because}</span>
                    </td>
                  </tr>
                ))}
                {publishedRows.length === 0 && (
                  <tr>
                    <th scope="row">No action yet</th>
                    <td>–</td>
                    <td>Nothing an agent can call has answered, so no action is published.</td>
                  </tr>
                )}
                {entityOnly.length > 0 && (
                  <tr>
                    <th scope="row">{entityOnly.length === 1 ? entityOnly[0]!.label : `${entityOnly.length} more actions`}</th>
                    <td>{entityOnly.every((action) => !action.boundary) ? "Undecided" : entityOnly.some((action) => !action.boundary) ? "Mixed" : "Answered"}</td>
                    <td>
                      The entity, no action
                      <span className="row-owner">
                        {entityOnly.length > 1 && <>{names(entityOnly)}. </>}
                        Nothing is declared that an agent could not call; each becomes an action the day an entry point answers.
                      </span>
                    </td>
                  </tr>
                )}
                {nothing.length > 0 && (
                  <tr>
                    <th scope="row">{nothing.length === 1 ? nothing[0]!.label : `${nothing.length} actions`}</th>
                    <td>Not relevant</td>
                    <td>
                      Nothing
                      <span className="row-owner">{nothing.length > 1 ? `${names(nothing)}. ` : ""}You said these are not relevant, so nothing is published for them.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* What agents are given to read, today and from this report: the surfaces Activate publishes, and the ones the site already has. */}
          <div className="activate-surfaces"><AgentSurfaces report={report} /></div>
        </details>
        <p className="activate-prepared"><i aria-hidden="true" /> Prepared files <span>Publication happens through the route you choose.</span></p>

        <section className="observe" aria-labelledby="observe-title">
          <p className="kicker kicker-quiet">Prove</p>
          <h2 id="observe-title">Is {host} still agent-ready?</h2>
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
          {!(crawlers.length > 0 || google > 0 || agents.length > 0 || activations.length > 0) ? (
            <p className="observe-nothing">
              Nothing to prove yet. Once published, this shows who crawled it, whether Google read it, which agents read it, and which capability an agent activated, with the score's movement.
              {!hasInterface && " No interface has answered yet, so there is nothing an agent could activate."}
            </p>
          ) : (
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
          )}
          <p className="section-lead">
            <a href={publishUrl(report.id, { intent: "monitor", engine: engine?.id })} onClick={() => track(report.id, "door_monitor")} target="_blank" rel="noreferrer">Monitor AI visibility</a>: track how your
            business is discovered and used by AI systems. WordLift re-verifies on a schedule and writes only when something moves.
          </p>
        </section>
      </div>

      <aside className="activate-rail" aria-label="Choose your delivery">
        <section>
          <p className="kicker kicker-quiet">Choose your delivery</p>
          <h2>Keep it alive with WordLift.</h2>
          <p>Build and maintain your brand knowledge graph as an evolving Context Engine.</p>
          <a className="button button-primary button-block button-large" href={activate} onClick={() => { if (runsWordLift) track(report.id, "door_activate"); }} target="_blank" rel="noreferrer">
            Continue with WordLift <ArrowUpRight size={17} aria-hidden="true" />
          </a>
          <p className="rail-note">
            {runsWordLift
              ? `Opens the existing WordLift setup. WordLift was detected on ${host}; that is not an account connection and does not prove who owns the site.`
              : `${host} does not run WordLift yet, so this opens a conversation with our team: book a demo.`}
          </p>
        </section>

        <section>
          <h2 id="runbook-title">Publish with your agent.</h2>
          <p>Use the prepared instructions in Codex or Claude Code.</p>
          <button type="button" className="button button-outline button-block button-large" onClick={() => void copyPrompt()}>
            {prompt === "copied" ? <><Check size={16} aria-hidden="true" /> Prompt copied</> : "Copy publishing prompt"}
          </button>
          <p className="rail-note" role="status">
            {prompt === "copied" ? "Copied. Paste it to your agent. Copying publishes nothing: the files are live only once your agent has put them on the site." : "Copying a prompt does not publish files or make a capability live."}
          </p>
          {prompt === "failed" && (
            <label className="prompt-fallback">
              The prompt could not be copied here. Select it and copy it by hand:
              <textarea readOnly rows={5} value={promptText} onFocus={(event) => event.currentTarget.select()} />
            </label>
          )}
          <button type="button" className="text-button text-button-strong" onClick={() => setOpenDoc(runbook)}>
            Read the runbook <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </section>

        <section>
          <p className="kicker kicker-quiet">After publishing</p>
          <h3>Verify what agents can actually use.</h3>
          <button type="button" className="text-button text-button-strong" onClick={() => void runAgain()} disabled={rerunning}>
            {rerunning ? "Reading the site again…" : "Run the audit again"} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
          <p className="rail-note">Publishing business context does not build a missing interface or raise readiness. A new audit says what answers.</p>
          {rerunError && <p className="form-error" role="alert">{rerunError}</p>}
        </section>

        <a className="text-button text-button-strong rail-help" href={talkToUsUrl(report.id)} target="_blank" rel="noreferrer">
          Need help? Talk to us <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </aside>
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
  return (
    <EngineProvider report={report}>
      <ActivateScreen report={report} publication={publication} visits={visits} />
    </EngineProvider>
  );
}

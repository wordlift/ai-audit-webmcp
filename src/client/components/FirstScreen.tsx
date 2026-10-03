import { ArrowRight, Bot, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { getVisits, refineReport, startReport, type ReportVisits } from "../api/client";
import { ActionDetailDialog } from "./ActionDetailDialog";
import { AgentDiary } from "./AgentDiary";
import { AgentDoors } from "./AgentDoors";
import { ContextEnginePreview, cardAssertions, contextEngineSummary, graphRelations } from "./ContextEnginePreview";
import { modelView, siteKind } from "../../shared/format/modelView.js";
import { EngineStatus } from "./EngineStatus";
import { holds, useReportEngine } from "../engine/EngineContext";
import { track } from "../engine/track";
import { DeepScanOffer } from "./DeepScanOffer";
import { publishUrl } from "./FixPanel";
import { entityRole } from "../../shared/format/businessModel.js";
import { explainReportError, onlyFoundationMissing, unreadableReason } from "../../shared/format/explainError.js";
import { groupEntities } from "./UnderstandPanel";

/**
 * The first screen of a report shows the Context Engine first and what agents can do with it second.
 * It answers, in under a minute, what the business is and offers as the audit understood it, which
 * of that the site declares and which was inferred, and then the three actions that matter for this
 * kind of site, each with one plain word and one next step. Every plain word maps onto exactly one
 * precise state, never two; the precise vocabulary lives one click below, in the model & evidence
 * fold, and in every file an agent reads. The model is the asset; readiness is the proof.
 */
export type PlainWord = "works" | "fix" | "talk";

export const WORD_LABEL: Record<PlainWord, string> = { works: "Works", fix: "Fix this", talk: "Talk to us" };

/** Works: verified by invocation. Fix this: declared or human-only. Talk to us: nothing to build on. */
export function plainWord(capability: CapabilityResult): PlainWord | null {
  switch (capability.state) {
    case "agent-ready":
      return "works";
    case "unverified":
    case "human-only":
      return "fix";
    case "missing":
      return "talk";
    default:
      return null;
  }
}

/** One next step per precise state, in the person's words. */
export function nextStep(capability: CapabilityResult): string {
  switch (capability.state) {
    case "agent-ready":
      return capability.via === "sidecar" ? "Our agent successfully used this. Run by WordLift." : "Our agent successfully used this.";
    case "unverified":
      return "Your site says agents can do this, but our agent could not complete it.";
    case "human-only":
      return "People can do this, but an AI agent has no direct way in.";
    case "missing":
      return "There is no agent-accessible interface yet.";
    default:
      return "";
  }
}

/** The widest gap sorts first among actions of equal importance. */
const GAP: Record<CapabilityResult["state"], number> = {
  missing: 0,
  "human-only": 1,
  unverified: 2,
  "agent-ready": 3,
  "not-expected": 4,
};

/** The actions that matter most for this kind of business: expected, the most important first. */
export function actionsThatMatter(capabilities: CapabilityResult[], count = 3): CapabilityResult[] {
  return capabilities
    .filter((capability) => capability.expected && capability.state !== "not-expected")
    .sort(
      (left, right) =>
        right.importance - left.importance || GAP[left.state] - GAP[right.state] || left.label.localeCompare(right.label),
    )
    .slice(0, count);
}

/** The headline: what agents can do with this business, counted on the things that matter. */
export function headline(capabilities: CapabilityResult[], host: string): string {
  const three = actionsThatMatter(capabilities);
  if (three.length === 0) return `No agent capabilities are expected for ${host} yet.`;
  const works = three.filter((capability) => capability.state === "agent-ready").length;
  return `AI agents can do ${works} of the ${three.length} ${three.length === 1 ? "thing" : "things"} that matter on ${host}.`;
}

const lowerFirst = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);
const listed = (labels: string[]) => (labels.length <= 1 ? labels[0] ?? "" : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`);

/**
 * Under "Can agents use it?": what the site lets an agent do today, named, and what it does not yet.
 * The site is the subject, so nobody reads a gap on the site as the tool admitting it failed.
 */
export function capabilityLine(capabilities: CapabilityResult[], host = "This site"): string {
  const three = actionsThatMatter(capabilities);
  if (three.length === 0) return "";
  const say = (items: CapabilityResult[], joiner = "and") => {
    const labels = items.map((capability) => lowerFirst(capability.label));
    return labels.length <= 1 ? labels[0] ?? "" : `${labels.slice(0, -1).join(", ")} ${joiner} ${labels[labels.length - 1]}`;
  };
  const works = three.filter((capability) => capability.state === "agent-ready");
  const rest = three.filter((capability) => capability.state !== "agent-ready");
  if (works.length === 0) return `${host} does not yet let an AI agent ${say(rest, "or")}.`;
  if (rest.length === 0) return `${host} already lets an AI agent ${say(works)}.`;
  return `${host} already lets an AI agent ${say(works)}, but not yet ${say(rest, "or")}.`;
}

/** The line under the headline: the size of the gap, or the good news. */
export function gapLine(capabilities: CapabilityResult[]): string | null {
  const three = actionsThatMatter(capabilities);
  if (three.length === 0) return null;
  const rest = three.filter((capability) => capability.state !== "agent-ready").length;
  if (rest === 0) return "Everything that matters works.";
  if (rest === three.length) return rest === 1 ? "Fix it." : `Fix all ${rest}.`;
  return `Fix the other ${rest === 1 ? "one" : rest}.`;
}

/** How many expected actions the full audit covers beyond the three on the first screen. */
export function beyondTheThree(capabilities: CapabilityResult[]): number {
  const expected = capabilities.filter((capability) => capability.expected && capability.state !== "not-expected").length;
  return Math.max(0, expected - actionsThatMatter(capabilities).length);
}

function openFullAudit() {
  const fold = document.getElementById("full-audit") as HTMLDetailsElement | null;
  if (fold) fold.open = true;
}

/** "Read 3 hours ago": when the site was actually read, which a reused crawl makes worth saying. */
export function readAgo(collectedAt: string | undefined, now: number): string | null {
  if (!collectedAt) return null;
  const minutes = Math.max(0, Math.round((now - new Date(collectedAt).getTime()) / 60_000));
  if (minutes < 2) return "Checked just now";
  if (minutes < 90) return `Checked ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `Checked ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `Checked ${days} ${days === 1 ? "day" : "days"} ago`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * What the business says it is, from its home page's own description: the value it claims, in its
 * words, beside what WordLift read. Quoted, never rewritten; nothing when the page says nothing useful.
 */
export function ownWords(report: ReportRecord): string | null {
  const pages = report.contextGraph?.pages ?? [];
  const entry = pages.find((page) => page.role === "entry") ?? pages[0];
  const words = entry?.description?.replace(/\s+/g, " ").trim();
  if (!words || words.length < 24 || words.toLowerCase() === entry?.title?.toLowerCase()) return null;
  return words.length > 150 ? `${words.slice(0, 147).replace(/\s+\S*$/, "")}…` : words;
}

/** "3 crawlers and 1 agent have read this": the readers that are not people, summed across days. */
export function readersLine(visits: ReportVisits | null): string | null {
  if (!visits || !Array.isArray(visits.days)) return null;
  let crawlers = 0;
  let agents = 0;
  for (const day of visits.days) {
    for (const [cls, count] of Object.entries(day.counts)) {
      if (cls.startsWith("crawler:") && !cls.startsWith("crawler:claimed-")) crawlers += count;
      else if (cls.startsWith("agent:")) agents += count;
    }
  }
  if (crawlers === 0 && agents === 0) return null;
  const part = (count: number, noun: string) => `${count} ${count === 1 ? noun : `${noun}s`}`;
  return `${part(crawlers, "crawler")} and ${part(agents, "agent")} have read this since it was published.`;
}

/**
 * Next to a score that measures whether agents can act, what the platform the site runs on already
 * delivers: agents can read the business. The two are different things, and a reader who sees
 * "Runs on WordLift" beside a low score deserves to be told which one WordLift is responsible for.
 */
/** "2 apartments", "3 places": the nouns a business uses, never a type name. */
function pluralNoun(count: number, label: string): string {
  const noun = label.toLowerCase();
  const plural = /(s|x|z|ch|sh)$/.test(noun) ? `${noun}es` : /[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`;
  return `${count} ${count === 1 ? noun : plural}`;
}


/**
 * The shape of the business in one line: the business, one thing it offers, where that is.
 * "AlpiNest → offers Samspitze 4 → in Mariapfarr". By default only what the markup declares or a
 * review confirmed joins it; asked for the text too, it is the line a poorly marked-up site gets,
 * said as read from the text.
 */
export function relationChain(report: ReportRecord, include: "settled" | "with-text" = "settled"): string[] | null {
  const relations = (report.contextGraph?.relations ?? []).filter((relation) => include === "with-text" || relation.provenance !== "inferred");
  const entities = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted");
  if (relations.length === 0 || entities.length === 0) return null;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const outgoing = (id: string, kind: string) => relations.filter((relation) => relation.from === id && relation.kind === kind && byId.has(relation.to));
  const businesses = entities
    .filter((entity) => entityRole(entity) === "business")
    .sort((left, right) => Number(right.humanPriority === "primary") - Number(left.humanPriority === "primary") || outgoing(right.id, "offers").length - outgoing(left.id, "offers").length || Number(left.origin === "inferred") - Number(right.origin === "inferred"));
  const business = businesses[0];
  if (business) {
    const steps = [business.name];
    const offered = outgoing(business.id, "offers")[0];
    let last = business.id;
    if (offered) {
      steps.push(`offers ${byId.get(offered.to)!.name}`);
      last = offered.to;
    }
    const where = outgoing(last, "located-in")[0] ?? (last !== business.id ? outgoing(business.id, "located-in")[0] : undefined);
    if (where) steps.push(`in ${byId.get(where.to)!.name}`);
    if (steps.length >= 2) return steps;
  }
  // No connection starts at the business: the shape of what it offers still reads, place within place.
  // "Samspitze 4 → in Mariapfarr → in Lungau".
  const nestedIn = (id: string) => relations.filter((relation) => relation.to === id && relation.kind === "located-in").length;
  const start = entities
    .filter((entity) => (entityRole(entity) === "offering" || entityRole(entity) === "place") && outgoing(entity.id, "located-in").length > 0)
    .sort(
      (left, right) =>
        Number(entityRole(left) === "place") - Number(entityRole(right) === "place") ||
        Number(right.humanPriority === "primary") - Number(left.humanPriority === "primary") ||
        nestedIn(left.id) - nestedIn(right.id) ||
        Number(left.origin === "inferred") - Number(right.origin === "inferred"),
    )[0];
  if (!start) return null;
  const steps = [start.name];
  const seen = new Set([start.id]);
  let at = start.id;
  for (let hop = 0; hop < 3; hop += 1) {
    const next = outgoing(at, "located-in").find((relation) => !seen.has(relation.to));
    if (!next) break;
    steps.push(`in ${byId.get(next.to)!.name}`);
    seen.add(next.to);
    at = next.to;
  }
  return steps.length >= 2 ? steps : null;
}

export function runsOnLine(report: ReportRecord): string {
  const name = report.publishedWith?.name ?? "WordLift";
  const { published, textOnly } = groupEntities(report.contextGraph?.entities ?? []);
  const total = published.length + textOnly.length;
  const read = total > 0 && published.length > 0 ? `: ${published.length} of the ${total} things that matter here ${published.length === 1 ? "is" : "are"} machine-readable` : "";
  return `${name} already makes this business readable to agents${read}. The score measures whether agents can act, which is the next step.`;
}

export function FirstScreen({ report, now = () => Date.now() }: { report: ReportRecord; now?: () => number }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<CapabilityResult | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [visits, setVisits] = useState<ReportVisits | null>(null);

  // The ledger is a separate read, and a report never waits for it.
  useEffect(() => {
    let cancelled = false;
    getVisits(report.id)
      .then((result) => {
        if (!cancelled) setVisits(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [report.id]);
  const readers = readersLine(visits);

  const host = hostOf(report.canonicalUrl ?? report.requestedUrl);
  const capabilities = report.capabilities ?? [];
  const three = actionsThatMatter(capabilities);
  const beyond = beyondTheThree(capabilities);
  const primary = report.classification?.primaryArchetype;
  const archetype = siteKind(report);
  const score = report.score?.value;
  const ago = readAgo(report.collectedAt, now());
  const gap = gapLine(capabilities);
  const engine = contextEngineSummary(report);
  // A site that could not be read has no model and no proof: the page says that, not a score of nothing.
  const unreadable = !engine ? unreadableReason(report.errors) : null;
  const { engine: stored, key: engineKey } = useReportEngine();

  async function runAgain() {
    setRerunning(true);
    try {
      // The explicit re-verify: the site is read again even though a day-old crawl would have served.
      const started = startReport(report.requestedUrl, { fresh: true, surface: "web", depth: report.scanDepth });
      await started.accepted;
      navigate(`/reports/${started.reportId}`, { state: { started: true } });
    } catch {
      setRerunning(false);
    }
  }

  return (
    <section className="first-screen" id="step-audit" aria-labelledby="first-screen-title">
      <div className="first-screen-head">
        {/* The step bar already says this is Audit; the space goes to the proof. */}
        {!engine && <p className="section-kicker"><Bot size={16} /> Audit</p>}
        {/* The moment is the headline: what the business is, in one sentence from what was read. What
            a Context Engine is follows in one plain line, so nobody has to guess who built what. */}
        <h1 id="first-screen-title" className={engine?.sentence ? "first-understood" : undefined}>
          {engine?.sentence ?? (engine ? `WordLift built a first Context Engine for ${host}.` : unreadable ? `WordLift could not read ${host}.` : headline(capabilities, host))}
        </h1>
        {unreadable && (
          <p className="first-sentence">
            {explainReportError(unreadable)} Nothing below is about the business yet.{" "}
            <button type="button" className="run-again" onClick={() => void runAgain()} disabled={rerunning}>{rerunning ? "Reading again…" : "Try again"}</button>
          </p>
        )}
        {!engine && !unreadable && gap && <p className="first-sentence">{gap}</p>}
        {engine && (
          <p className="first-context">
            From {engine.pages} {engine.pages === 1 ? "page" : "pages"} of {host}, WordLift built a model of this business that AI agents can use to
            understand it and act on it: its first <b>Context Engine</b>.
          </p>
        )}
        {engine && ownWords(report) && <p className="first-own-words">In its own words: “{ownWords(report)}”</p>}
        <p className="first-meta">
          {ago && <span className="read-when">{ago}</span>}
          <span className="chip-arche">{archetype}</span>
          {/* On the platform's own site the badge says nothing a reader can use, and reads as self-praise. */}
          {report.publishedWith && !/(^|\.)wordlift\.(io|com)$/i.test(host) && (
            <a className="chip-arche chip-runs-on" href={publishUrl(report.id, { engine: stored?.id })} onClick={() => track(report.id, "door_claim-context")} target="_blank" rel="noreferrer" title={`${runsOnLine(report)} ${report.publishedWith.evidence}. Own this site? Open your WordLift dashboard.`}>
              This site already uses {report.publishedWith.name}
            </a>
          )}
          {ago && (
            <button type="button" className="run-again" onClick={() => void runAgain()} disabled={rerunning}>
              {rerunning ? "Reading again…" : "Run again"}
            </button>
          )}
        </p>
        <EngineStatus report={report} engine={stored} />
        {/* A correction always shows where it landed, even when it left nothing to show as a card. */}
        {!engine && report.refinement && (
          <p className="engine-reviewed" role="status">
            <b>{report.refinement.filedBy === "owner" ? "Reviewed by the owner" : "Reviewed"}</b> · {report.refinement.decisions} {report.refinement.decisions === 1 ? "decision" : "decisions"} added
            {(() => {
              const notOurs = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority === "demoted").map((entity) => entity.name);
              return notOurs.length > 0 ? <> · not ours: {notOurs.slice(0, 3).join(", ")}</> : null;
            })()}
          </p>
        )}
        {engine && (
          <ContextEnginePreview
            summary={engine}
            relations={graphRelations(report)}
            host={host}
            onExplore={() => track(report.id, "engine_explored")}
            keptOnEngine={holds(stored)}
            onSave={async (decisions) => {
              // The same review the interview files, from the cards: the reviewed version opens with the corrections on it.
              const child = await refineReport(report.id, cardAssertions(decisions), engineKey);
              track(report.id, "model_corrected");
              navigate(`/reports/${child.id}`);
            }}
          />
        )}
        {/* Beside the model, the two things to do with it: review it, which makes it better, or ask it, which proves it is usable. */}
        {engine && <AgentDoors reportId={report.id} host={holds(stored) ? stored!.host : null} engineKey={engineKey} />}
      </div>

      <div className="first-capabilities" aria-labelledby={engine ? "first-capabilities-title" : undefined}>
        {engine && three.length > 0 && (
          <>
            <h2 id="first-capabilities-title">Can agents use it?</h2>
            <p className="first-sentence">
              {capabilityLine(capabilities, host)}
              {three.some((capability) => capability.state !== "agent-ready") && (
                <>
                  {" "}
                  <a href="#step-fix">See how to fix {three.filter((capability) => capability.state !== "agent-ready").length === 1 ? "it" : "them"}</a>
                </>
              )}
            </p>
          </>
        )}
        {score !== undefined && (
          <p className="first-meta">
            <span className="first-score">Agent readiness <b>{score}</b>/100</span>
            <span className="first-score-means">based on what our agent could actually do when it tried</span>
          </p>
        )}
        {report.status === "partial" && onlyFoundationMissing(report.errors) && (
          <p className="first-note">No foundation score this time: WordLift's foundation audit did not answer. Run again to include it.</p>
        )}
      </div>

      {three.length > 0 && (
        <ol className="three-actions" aria-label="The actions that matter">
          {three.map((capability) => {
            const word = plainWord(capability) ?? "fix";
            return (
              <li key={capability.actionId}>
                <button type="button" className={`three-action three-action-${word}`} onClick={() => { setSelected(capability); track(report.id, "capability_opened"); }}>
                  <span className="three-action-name">{capability.label}</span>
                  <span className={`plain-word plain-word-${word}`}>
                    {WORD_LABEL[word]}
                    {word === "works" ? <Check size={12} aria-hidden="true" /> : <ArrowRight size={12} aria-hidden="true" />}
                  </span>
                  <span className="three-action-why">{nextStep(capability)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {/* Claiming comes after the proof: what the model is, what agents can do with it, then keep it. */}
      <DeepScanOffer report={report} variant="inline" claimed={holds(stored)} />

      {beyond > 0 && (
        <p className="discovery-line">
          <a href="#full-audit" onClick={openFullAudit}>All {beyond + three.length} actions a {archetype === "general" ? "site like this" : `${archetype} site`} should offer are in the model &amp; evidence.</a>
        </p>
      )}
      {report.agentDiscovery?.catalog === "missing" && (
        <p className="discovery-line">Agents have no way to find this site's capabilities yet: it publishes no catalog. Activating publishes one.</p>
      )}
      {report.agentDiscovery?.catalog === "found" && (
        <p className="discovery-line">Agents can find this site's capabilities: it publishes a catalog.</p>
      )}
      {readers && <p className="discovery-line readers-line">{readers}</p>}

      {/* The proof behind the words, one click away: what the audit's agent actually did. */}
      <AgentDiary report={report} />

      <ActionDetailDialog reportId={report.id} report={report}
        capability={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </section>
  );
}

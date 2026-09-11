import { ArrowRight, Bot, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { getVisits, startReport, type ReportVisits } from "../api/client";
import { ActionDetailDialog } from "./ActionDetailDialog";
import { AgentDiary } from "./AgentDiary";
import { DeepScanOffer } from "./DeepScanOffer";
import { publishUrl } from "./FixPanel";
import { entityRole } from "../../shared/format/businessModel.js";
import { entityTypeLabel, groupEntities } from "./UnderstandPanel";

/**
 * The first screen of a report is an action screen. It answers, in under a minute, what agents
 * can do with this business and what to do next: the three actions that matter for this kind of
 * site, each with one plain word and one next step. Every plain word maps onto exactly one precise
 * state, never two; the precise vocabulary lives one click below, in the full audit, and in every
 * file an agent reads. The score is evidence; the gap is the product.
 */
export type PlainWord = "works" | "fix" | "talk";

const WORD_LABEL: Record<PlainWord, string> = { works: "Works", fix: "Fix this", talk: "Talk to us" };

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
  if (minutes < 2) return "Read just now";
  if (minutes < 90) return `Read ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `Read ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `Read ${days} ${days === 1 ? "day" : "days"} ago`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
 * What the audit found, before any score: the business, what it offers, where, who, counted in
 * the nouns the site uses. The moment the brief asks for is "it understood the shape of my
 * business", and a count of the right things says it faster than a score.
 */
export function foundLine(report: ReportRecord): { pages: number; parts: string[] } | null {
  const pages = report.contextGraph?.pages.length ?? 0;
  const entities = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted");
  if (pages === 0 || entities.length === 0) return null;
  const offerings = new Map<string, number>();
  let businesses = 0;
  let places = 0;
  let people = 0;
  for (const entity of entities) {
    const role = entityRole(entity);
    if (role === "business") businesses += 1;
    else if (role === "place") places += 1;
    else if (role === "person") people += 1;
    else if (role === "offering") {
      const label = entityTypeLabel(entity.types[0]);
      offerings.set(label, (offerings.get(label) ?? 0) + 1);
    }
  }
  const parts: string[] = [];
  if (businesses > 0) parts.push(pluralNoun(businesses, "business"));
  for (const [label, count] of [...offerings.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3)) parts.push(pluralNoun(count, label));
  if (places > 0) parts.push(pluralNoun(places, "place"));
  if (people > 0) parts.push(people === 1 ? "1 person" : `${people} people`);
  const expected = (report.capabilities ?? []).filter((capability) => capability.expected).length;
  if (expected > 0) parts.push(`${expected} ${expected === 1 ? "thing" : "things"} agents should be able to do here`);
  return parts.length > 0 ? { pages, parts } : null;
}

/**
 * The shape of the business in one line, from what its markup declares: the business, one thing
 * it offers, where that is. "AlpiNest → offers Samspitze 4 → in Mariapfarr". Nothing inferred
 * joins it, and a site whose markup declares no relation gets no line.
 */
export function relationChain(report: ReportRecord): string[] | null {
  const relations = report.contextGraph?.relations ?? [];
  const entities = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted");
  if (relations.length === 0 || entities.length === 0) return null;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const outgoing = (id: string, kind: string) => relations.filter((relation) => relation.from === id && relation.kind === kind && byId.has(relation.to));
  const businesses = entities
    .filter((entity) => entityRole(entity) === "business")
    .sort((left, right) => Number(right.humanPriority === "primary") - Number(left.humanPriority === "primary") || outgoing(right.id, "offers").length - outgoing(left.id, "offers").length || Number(left.origin === "inferred") - Number(right.origin === "inferred"));
  const business = businesses[0];
  if (!business) return null;
  const steps = [business.name];
  const offered = outgoing(business.id, "offers")[0];
  let last = business.id;
  if (offered) {
    steps.push(`offers ${byId.get(offered.to)!.name}`);
    last = offered.to;
  }
  const where = outgoing(last, "located-in")[0] ?? (last !== business.id ? outgoing(business.id, "located-in")[0] : undefined);
  if (where) steps.push(`in ${byId.get(where.to)!.name}`);
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
  const found = foundLine(report);
  const chain = relationChain(report);
  const archetype = !primary || primary === "other" ? "general" : primary.replaceAll("-", " / ");
  const score = report.score?.value;
  const ago = readAgo(report.collectedAt, now());
  const gap = gapLine(capabilities);

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
        <p className="section-kicker"><Bot size={16} /> Audit</p>
        <h1 id="first-screen-title">{headline(capabilities, host)}</h1>
        {gap && <p className="first-sentence">{gap}</p>}
        <p className="first-meta">
          {ago && <span className="read-when">{ago}</span>}
          {score !== undefined && (
            <span className="first-score">Agent readiness <b>{score}</b>/100</span>
          )}
          <span className="chip-arche">{archetype}</span>
          {report.publishedWith && (
            <a className="chip-arche chip-runs-on" href={publishUrl(report.id)} target="_blank" rel="noreferrer" title={`${runsOnLine(report)} ${report.publishedWith.evidence}. Own this site? Open your WordLift dashboard.`}>
              Runs on {report.publishedWith.name}
            </a>
          )}
          {ago && (
            <button type="button" className="run-again" onClick={() => void runAgain()} disabled={rerunning}>
              {rerunning ? "Reading again…" : "Run again"}
            </button>
          )}
        </p>
        {found && (
          <p className="first-found">
            From {found.pages} {found.pages === 1 ? "page" : "pages"}, WordLift found{" "}
            {found.parts.map((part, index) => (
              <span key={part}>
                {index > 0 && <span className="first-found-dot" aria-hidden="true"> · </span>}
                <b>{part}</b>
              </span>
            ))}
            . <a href="#understand">See what we understood</a>
          </p>
        )}
        {chain && (
          <p className="first-chain" aria-label="How the business fits together, as its markup declares it">
            {chain.map((step, index) => (
              <span key={step}>
                {index > 0 && <span className="first-chain-arrow" aria-hidden="true"> → </span>}
                <span className={index === 0 ? "first-chain-head" : undefined}>{step}</span>
              </span>
            ))}
          </p>
        )}
        {/* The deeper read, asked for where the counts are: one line that opens in place. */}
        <DeepScanOffer report={report} variant="inline" />
      </div>

      {three.length > 0 && (
        <ol className="three-actions" aria-label="The actions that matter">
          {three.map((capability) => {
            const word = plainWord(capability) ?? "fix";
            return (
              <li key={capability.actionId}>
                <button type="button" className={`three-action three-action-${word}`} onClick={() => setSelected(capability)}>
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

      {beyond > 0 && (
        <p className="discovery-line">
          <a href="#full-audit" onClick={openFullAudit}>All {beyond + three.length} actions a {archetype === "general" ? "site like this" : `${archetype} site`} should offer are in the full audit.</a>
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

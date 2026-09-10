import { Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { getVisits, startReport, type ReportVisits } from "../api/client";
import { ActionDetailDialog } from "./ActionDetailDialog";
import { DeepScanOffer } from "./DeepScanOffer";

/**
 * The first screen of a report, written for a person: the site, one sentence, the three actions
 * that matter for this kind of business, and one next step each in plain words. Every plain word
 * maps onto exactly one precise state, never two; the precise vocabulary lives one click below,
 * in the full audit, and in every file an agent reads.
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
      return capability.via === "sidecar" ? "Our agent did this on your site. Run by WordLift." : "Our agent did this on your site.";
    case "unverified":
      return "The site says an agent can do this, but when ours tried, nothing answered.";
    case "human-only":
      return "A person can do this here. An agent has no way in yet.";
    case "missing":
      return "Nothing here lets a person or an agent do this. We can run it for you.";
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

/** The sentence a report opens with: the things that matter for this kind of site, and how many work today. */
export function openingSentence(capabilities: CapabilityResult[], kind = "general"): string {
  const three = actionsThatMatter(capabilities);
  if (three.length === 0) return "No agent capabilities are expected for this kind of site yet.";
  const works = three.filter((capability) => capability.state === "agent-ready").length;
  const site = kind === "general" ? "a site like this" : `a ${kind} site`;
  return `Of the ${three.length} ${three.length === 1 ? "thing" : "things"} an AI agent should be able to do on ${site}, ${works} ${works === 1 ? "works" : "work"} today.`;
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

  const capabilities = report.capabilities ?? [];
  const three = actionsThatMatter(capabilities);
  const working = three.filter((capability) => capability.state === "agent-ready").length;
  const beyond = beyondTheThree(capabilities);
  const primary = report.classification?.primaryArchetype;
  const archetype = !primary || primary === "other" ? "general" : primary.replaceAll("-", " / ");
  const score = report.score?.value;
  const ago = readAgo(report.collectedAt, now());

  async function runAgain() {
    setRerunning(true);
    try {
      // The explicit re-verify: the site is read again even though a day-old crawl would have served.
      const started = startReport(report.requestedUrl, { fresh: true, surface: "web", depth: report.scanDepth });
      await started.accepted;
      navigate(`/reports/${started.reportId}`);
    } catch {
      setRerunning(false);
    }
  }

  return (
    <section className="first-screen" aria-labelledby="first-screen-title">
      <div className="first-screen-head">
        <p className="section-kicker"><Bot size={16} /> What an AI agent can do here</p>
        <h1 id="first-screen-title">{hostOf(report.canonicalUrl ?? report.requestedUrl)}</h1>
        <p className="first-sentence">
          {openingSentence(capabilities, archetype)}
          {three.length > 0 && (working < three.length ? " Here is what stops the others." : " Here is how.")}
        </p>
        <p className="first-meta">
          <span className="chip-arche">{archetype}</span>
          {score !== undefined && (
            <span className="first-score"><b>{score}</b> of 100 agent-ready</span>
          )}
          {ago && (
            <span className="read-when">
              {ago} ·{" "}
              <button type="button" onClick={() => void runAgain()} disabled={rerunning}>
                {rerunning ? "Reading again…" : "Run again"}
              </button>
            </span>
          )}
        </p>
      </div>

      {three.length > 0 && (
        <ol className="three-actions" aria-label="The actions that matter">
          {three.map((capability) => {
            const word = plainWord(capability) ?? "fix";
            return (
              <li key={capability.actionId}>
                <button type="button" className={`three-action three-action-${word}`} onClick={() => setSelected(capability)}>
                  <span className="three-action-name">{capability.label}</span>
                  <span className={`plain-word plain-word-${word}`}>{WORD_LABEL[word]}</span>
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

      {/* The deeper read, asked for where the person already is: one line that opens in place. */}
      <DeepScanOffer report={report} />

      <ActionDetailDialog
        reportId={report.id}
        capability={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </section>
  );
}

import { ArrowRight, Bot, ScanSearch } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEEP_SCAN_PAGES } from "../../shared/format/deepScan.js";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { startReport } from "../api/client";
import { ActionDetailDialog } from "./ActionDetailDialog";

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
      return capability.via === "sidecar" ? "Verified by calling it. Run by WordLift." : "Verified by calling it.";
    case "unverified":
      return "An interface is declared, but no agent call has been verified. Make it answer.";
    case "human-only":
      return "People can do this here and agents cannot. Expose it as an interface an agent can call.";
    case "missing":
      return "Nothing an agent or a person can use was found. We can run this for you.";
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

/** The sentence a report opens with. */
export function openingSentence(capabilities: CapabilityResult[]): string {
  const expected = capabilities.filter((capability) => capability.expected && capability.state !== "not-expected");
  if (expected.length === 0) return "No agent capabilities are expected for this kind of site yet.";
  const works = expected.filter((capability) => capability.state === "agent-ready").length;
  const rest = expected.length - works;
  return `Agents can discover ${expected.length} ${expected.length === 1 ? "capability" : "capabilities"} on this site. ${works} ${
    works === 1 ? "works" : "work"
  }. ${rest} ${rest === 1 ? "does" : "do"} not yet.`;
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

export function FirstScreen({ report, now = () => Date.now() }: { report: ReportRecord; now?: () => number }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<CapabilityResult | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const capabilities = report.capabilities ?? [];
  const three = actionsThatMatter(capabilities);
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
          {openingSentence(capabilities)}
          {three.length > 0 && " Here is what prevents them."}
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

      {report.agentDiscovery?.catalog === "missing" && (
        <p className="discovery-line">
          Agents cannot discover this site yet: nothing is published at <code>/.well-known/ai-catalog.json</code>. Activating it publishes one.
        </p>
      )}
      {report.agentDiscovery?.catalog === "found" && (
        <p className="discovery-line">Agents can discover this site: a catalog is published at its well-known path.</p>
      )}
      {report.markup && report.markup.inferredEntities > 0 && (
        <p className="discovery-line">
          {report.markup.inferredEntities === 1
            ? "1 entity appears on your pages and is not published as structured data."
            : `${report.markup.inferredEntities} entities appear on your pages and are not published as structured data.`}{" "}
          Fixing it publishes them.
        </p>
      )}

      {report.scanDepth !== "deep" && (
        <a className="deep-scan-strip" href="#deep-scan">
          <ScanSearch size={16} aria-hidden="true" /> Read up to {DEEP_SCAN_PAGES} pages instead of {report.contextGraph?.pages.length ?? 4} and get the report by email
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      )}

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

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Bot, ExternalLink, UserRound, Wrench, X } from "lucide-react";
import { useRef } from "react";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { CapabilityTest, testable } from "./CapabilityTest";
import { ContractViewer } from "./ContractViewer";
import { publishUrl, talkToUsUrl } from "./FixPanel";
import { OWN_WORDS } from "./OwnIt";
import { BOUNDARY_LABELS } from "./ServiceMapProvenance";

/**
 * One capability, as the object it is: first what needs to change for agents to do this, in the
 * person's words, with the one door that closes the gap; then who owns it and when it was last
 * verified; then the technical detail, exactly as an engineer or an auditor needs it. "Fix this"
 * on the first screen opens here, so the label is a door, and the door leads somewhere.
 */
export type RemedyCase = "works" | "inspect" | "agent-ready" | "talk";

export interface Remedy {
  case: RemedyCase;
  why: string;
  required: string;
  cta: { label: string; href?: string; inspect?: boolean } | null;
}

/** The diagnosed gap and its door, one per precise state. Never a technology to choose from. */
export function remedyFor(capability: CapabilityResult, reportId: string): Remedy {
  switch (capability.state) {
    case "agent-ready":
      return {
        case: "works",
        why: capability.via === "sidecar" ? "Our agent successfully used this, through the interface WordLift runs for you." : "Our agent successfully used this on your site.",
        required: "Nothing today. Keeping it agent-ready means keeping the interface answering, and knowing the day it stops.",
        cta: { label: "Keep it agent-ready", href: publishUrl(reportId, { action: capability.actionId, intent: "keep" }) },
      };
    case "unverified": {
      const failed = capability.evidence.some((item) => item.audience === "agent" && item.verification === "failed");
      return {
        case: "inspect",
        why: failed
          ? "Your site says agents can do this, but when our agent tried, the interface did not answer."
          : "Your site says agents can do this, but our agent could not complete it: what is declared could not be called.",
        required: "The declared interface has to answer an agent's call. The evidence below says exactly what happened.",
        cta: { label: failed ? "Inspect the failure" : "Inspect the declaration", inspect: true },
      };
    }
    case "human-only":
      return {
        case: "agent-ready",
        why: "A person can do this on your site, but there is no interface an AI agent can use.",
        required: "Expose an agent-readable interface for it. WordLift routes this to the product where one can be published, and to the team where one has to be built.",
        cta: { label: "Make this agent-ready", href: publishUrl(reportId, { action: capability.actionId, intent: "agent-ready" }) },
      };
    case "missing":
      return {
        case: "talk",
        why: "Your business should support this action, but there is currently no interface to expose, for people or for agents.",
        required: "An interface has to be designed before agents can use it. That is a conversation, not a button.",
        cta: { label: "Talk to us", href: talkToUsUrl(reportId, capability.actionId) },
      };
    default:
      return { case: "works", why: "This kind of site is not expected to offer it.", required: "Nothing.", cta: null };
  }
}

/** "Verified 14 minutes ago": when the invocation that made it work was recorded. */
export function verifiedAgo(capability: CapabilityResult, now = Date.now()): string | null {
  const invoked = capability.evidence.filter((item) => item.verification === "invoked").map((item) => new Date(item.collectedAt).getTime()).filter((time) => !Number.isNaN(time));
  if (invoked.length === 0) return null;
  const minutes = Math.max(0, Math.round((now - Math.max(...invoked)) / 60_000));
  if (minutes < 2) return "Verified just now";
  if (minutes < 90) return `Verified ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `Verified ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `Verified ${days} ${days === 1 ? "day" : "days"} ago`;
}

export function ActionDetailDialog({ reportId, report, capability, onOpenChange }: { reportId: string; report?: ReportRecord; capability: CapabilityResult | null; onOpenChange: (open: boolean) => void }) {
  const evidenceRef = useRef<HTMLElement | null>(null);
  const remedy = capability ? remedyFor(capability, reportId) : null;
  const verified = capability ? verifiedAgo(capability) : null;
  const owner = capability?.boundary ? OWN_WORDS[capability.boundary] : null;

  return (
    <Dialog.Root open={Boolean(capability)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          {capability && remedy && <>
            <Dialog.Title>{capability.label}</Dialog.Title>
            <Dialog.Close className="dialog-close" aria-label="Close capability details"><X /></Dialog.Close>

            <section className={`remedy remedy-${remedy.case}`} aria-label="What needs to change">
              <p className="section-kicker"><Wrench size={15} /> What needs to change for agents to do this?</p>
              <p className="remedy-why">{remedy.why}</p>
              <p className="remedy-required">{remedy.required}</p>
              <div className="remedy-facts">
                <span>
                  <small>Business owner</small>
                  {owner ? (
                    <b>{owner}{capability.boundaryPartner ? `: ${capability.boundaryPartner.name}` : ""}</b>
                  ) : (
                    <a href="#own-it" onClick={() => onOpenChange(false)}>Not answered yet. Answer 3 questions</a>
                  )}
                </span>
                {verified && <span><small>Evidence</small><b>{verified}</b></span>}
              </div>
              {remedy.cta && (
                remedy.cta.inspect ? (
                  <button type="button" className="fix-publish" onClick={() => evidenceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                    {remedy.cta.label}
                  </button>
                ) : (
                  <a className="fix-publish" href={remedy.cta.href} target="_blank" rel="noreferrer">
                    {remedy.cta.label} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                )
              )}
            </section>

            {/* Test it yourself: the audit's own call, with the person's inputs, when the site names something a server can reach. */}
            {report && testable(report, capability) && <CapabilityTest key={capability.actionId} report={report} capability={capability} />}

            <h3 className="dialog-section-title">Technical detail</h3>
            <p className="dialog-description">{capability.description}</p>
            <div className="dialog-state">
              <span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span>
              {capability.via === "sidecar" && <span className="via-chip">Run by WordLift</span>}
              {/* Whose expectation this is: the model inferred it from the site type, or a human decided. */}
              <span className="provenance-badge">
                {capability.expectationSource.some((source) => source.startsWith("human:")) ? "Human-provided" : "Machine-inferred"}
              </span>
              <span>{capability.intent} · importance {capability.importance}/3{!capability.expected && " · observed on the site, beyond this site type's expected actions"}</span>
            </div>
            {capability.boundary && (
              <section className="dialog-boundary" aria-label="Responsibility boundary">
                <h3>Responsibility</h3>
                <p>
                  <span className={`boundary-chip boundary-${capability.boundary}`}>{BOUNDARY_LABELS[capability.boundary]}</span>
                  <span className="provenance-badge">Human-provided</span>
                </p>
                {capability.boundaryPartner && (
                  <p className="boundary-partner">
                    Runs with{" "}
                    {capability.boundaryPartner.url ? (
                      <a href={capability.boundaryPartner.url} target="_blank" rel="noreferrer">{capability.boundaryPartner.name}</a>
                    ) : (
                      capability.boundaryPartner.name
                    )}
                  </p>
                )}
                {capability.boundaryRationale && <p className="boundary-rationale">{capability.boundaryRationale}</p>}
              </section>
            )}
            {capability.appliesTo.length > 0 && (
              <section className="dialog-entities">
                <h3>This action applies to</h3>
                <div>{capability.appliesTo.map((entity) => <span key={entity.id}><small>{entity.types[0]}</small>{entity.name}</span>)}</div>
              </section>
            )}
            <section className="evidence-columns" ref={evidenceRef}>
              <EvidenceColumn title="For humans" icon={<UserRound />} available={capability.humanSupport} evidence={capability.evidence.filter((item) => item.audience === "human")} />
              <EvidenceColumn title="For agents" icon={<Bot />} available={capability.agentSupport} evidence={capability.evidence.filter((item) => item.audience === "agent")} />
            </section>
            {capability.recommendation && <section className="recommendation"><h3>How to close the gap</h3><p>{capability.recommendation}</p></section>}
            {capability.contract && <ContractViewer reportId={reportId} actionId={capability.actionId} contract={capability.contract} />}
          </>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EvidenceColumn({ title, icon, available, evidence }: { title: string; icon: React.ReactNode; available: boolean; evidence: CapabilityResult["evidence"] }) {
  return <section><h3>{icon}{title}<span className={available ? "supported" : "unsupported"}>{available ? "Supported" : "Not ready"}</span></h3>{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><strong>{item.claim}</strong><small>{item.verification === "invoked" ? "Invocation-verified" : "Observed on site"} · {item.kind} · {item.verification} · {Math.round(item.confidence * 100)}%</small><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink /></a></li>)}</ul> : <p>No supporting evidence was found.</p>}</section>;
}

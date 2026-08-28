import * as Dialog from "@radix-ui/react-dialog";
import { Bot, ExternalLink, Hand, KeyRound, Plug, ShieldCheck, UserCheck, UserRound, X, Zap } from "lucide-react";
import { actionsForEntityType } from "../../domain/evidence/schemaActions.js";
import { explainExpectation } from "../../shared/format/explainExpectation.js";
import type { ActionContract, CapabilityResult, ClassificationResult, SiteEntity } from "../../shared/types/index.js";
import { ContractViewer } from "./ContractViewer";
import { offerLine } from "./KeyEntities";

export function ActionDetailDialog({ reportId, capability, classification, entities = [], onOpenChange }: { reportId: string; capability: CapabilityResult | null; classification?: ClassificationResult; entities?: SiteEntity[]; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={Boolean(capability)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          {capability && <>
            <Dialog.Title>{capability.label}</Dialog.Title>
            <Dialog.Close className="dialog-close" aria-label="Close capability details"><X /></Dialog.Close>
            <p className="dialog-description">{capability.description}</p>
            <div className="dialog-state"><span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span><span>{capability.intent} · importance {capability.importance}/3{freshness(capability)}</span></div>
            {capability.contract && <BoundaryStrip contract={capability.contract} />}
            <AppliesTo capability={capability} entities={entities} />
            <WhyExpected capability={capability} classification={classification} />
            <section className="evidence-columns">
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

const DELIVERY_LABELS: Record<ActionContract["recommendedDelivery"], string> = {
  "native-webmcp": "WebMCP tool in the page",
  "api-adapter": "API adapter",
  "approved-sidecar": "Approved read-only sidecar",
};

/**
 * The action's boundary, spelled out before anything else: what running it costs, what it needs,
 * and how it should be delivered. A verified action shows this exactly like a missing one.
 */
function BoundaryStrip({ contract }: { contract: ActionContract }) {
  const governance = contract.governance;
  const badges: Array<{ tone: "safe" | "caution" | "danger" | "neutral"; icon: React.ReactNode; text: string }> = [];

  badges.push(
    contract.intent === "informational"
      ? { tone: "safe", icon: <ShieldCheck />, text: "Read-only" }
      : { tone: "caution", icon: <Zap />, text: "Transaction" },
  );
  badges.push(
    governance.sideEffects === "none"
      ? { tone: "safe", icon: <ShieldCheck />, text: "No side effects" }
      : governance.sideEffects === "reversible"
        ? { tone: "caution", icon: <Zap />, text: "Reversible side effects" }
        : { tone: "danger", icon: <Zap />, text: "Irreversible" },
  );
  if (governance.requiresConfirmation) {
    badges.push({ tone: "danger", icon: <Hand />, text: "Explicit confirmation" });
  }
  if (governance.requiresAuthentication || governance.requiresAuthorization) {
    if (governance.requiresAuthentication) badges.push({ tone: "caution", icon: <KeyRound />, text: "Sign-in required" });
    if (governance.requiresAuthorization) badges.push({ tone: "caution", icon: <KeyRound />, text: "Authorization required" });
  } else {
    badges.push({ tone: "safe", icon: <UserCheck />, text: "No sign-in needed" });
  }
  badges.push({ tone: "neutral", icon: <Plug />, text: DELIVERY_LABELS[contract.recommendedDelivery] });

  return (
    <p className="boundary-strip" aria-label="Action boundary">
      {badges.map((badge) => (
        <span className={`boundary-badge boundary-${badge.tone}`} key={badge.text}>{badge.icon}{badge.text}</span>
      ))}
    </p>
  );
}

/** The entities this action applies to, so intent lands on a concrete offer. */
function AppliesTo({ capability, entities }: { capability: CapabilityResult; entities: SiteEntity[] }) {
  const relevant = entities.filter((entity) => actionsForEntityType(entity.type).includes(capability.actionId));
  if (relevant.length === 0) return null;
  return (
    <p className="applies-to" aria-label="Entities this action applies to">
      <span className="applies-to-label">Applies to</span>
      {relevant.map((entity) => {
        const offer = offerLine(entity);
        return <span className="category-chip" key={entity.id}>{entity.name}{offer ? ` — ${offer}` : ""}</span>;
      })}
    </p>
  );
}

/** The newest collection date across the action's evidence: how fresh this picture is. */
function freshness(capability: CapabilityResult): string {
  const latest = capability.evidence.map((item) => item.collectedAt).sort().at(-1);
  return latest ? ` · evidence from ${latest.slice(0, 10)}` : "";
}

function WhyExpected({ capability, classification }: { capability: CapabilityResult; classification?: ClassificationResult }) {
  const why = explainExpectation(classification, capability);
  return (
    <section className="why-expected">
      <h3>Why this action is expected here</h3>
      <p>{why.headline}{why.grounding ? ` ${why.grounding}` : ""}</p>
      {why.caveat && <p className="why-caveat">{why.caveat}</p>}
    </section>
  );
}

function EvidenceColumn({ title, icon, available, evidence }: { title: string; icon: React.ReactNode; available: boolean; evidence: CapabilityResult["evidence"] }) {
  return <section><h3>{icon}{title}<span className={available ? "supported" : "unsupported"}>{available ? "Supported" : "Not ready"}</span></h3>{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><strong>{item.claim}</strong><small>{item.kind} · {item.verification} · {Math.round(item.confidence * 100)}% · {item.collectedAt.slice(0, 10)}</small><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink /></a></li>)}</ul> : <p>No supporting evidence was found.</p>}</section>;
}

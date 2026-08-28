import * as Dialog from "@radix-ui/react-dialog";
import { Bot, ExternalLink, UserRound, X } from "lucide-react";
import { explainExpectation } from "../../shared/format/explainExpectation.js";
import type { CapabilityResult, ClassificationResult } from "../../shared/types/index.js";
import { ContractViewer } from "./ContractViewer";

export function ActionDetailDialog({ reportId, capability, classification, onOpenChange }: { reportId: string; capability: CapabilityResult | null; classification?: ClassificationResult; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={Boolean(capability)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          {capability && <>
            <Dialog.Title>{capability.label}</Dialog.Title>
            <Dialog.Close className="dialog-close" aria-label="Close capability details"><X /></Dialog.Close>
            <p className="dialog-description">{capability.description}</p>
            <div className="dialog-state"><span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span><span>{capability.intent} · importance {capability.importance}/3</span></div>
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
  return <section><h3>{icon}{title}<span className={available ? "supported" : "unsupported"}>{available ? "Supported" : "Not ready"}</span></h3>{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><strong>{item.claim}</strong><small>{item.kind} · {item.verification} · {Math.round(item.confidence * 100)}%</small><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink /></a></li>)}</ul> : <p>No supporting evidence was found.</p>}</section>;
}

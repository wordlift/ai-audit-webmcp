import * as Dialog from "@radix-ui/react-dialog";
import { Bot, ExternalLink, UserRound, X } from "lucide-react";
import type { CapabilityResult } from "../../shared/types/index.js";
import { ContractViewer } from "./ContractViewer";
import { BOUNDARY_LABELS } from "./ServiceMapProvenance";

export function ActionDetailDialog({ reportId, capability, onOpenChange }: { reportId: string; capability: CapabilityResult | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog.Root open={Boolean(capability)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content" aria-describedby={undefined}>
          {capability && <>
            <Dialog.Title>{capability.label}</Dialog.Title>
            <Dialog.Close className="dialog-close" aria-label="Close capability details"><X /></Dialog.Close>
            <p className="dialog-description">{capability.description}</p>
            <div className="dialog-state">
              <span className={`state-badge state-${capability.state}`}>{capability.state.replace("-", " ")}</span>
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
                {capability.boundaryRationale && <p className="boundary-rationale">{capability.boundaryRationale}</p>}
              </section>
            )}
            {capability.appliesTo.length > 0 && (
              <section className="dialog-entities">
                <h3>This action applies to</h3>
                <div>{capability.appliesTo.map((entity) => <span key={entity.id}><small>{entity.types[0]}</small>{entity.name}</span>)}</div>
              </section>
            )}
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

function EvidenceColumn({ title, icon, available, evidence }: { title: string; icon: React.ReactNode; available: boolean; evidence: CapabilityResult["evidence"] }) {
  return <section><h3>{icon}{title}<span className={available ? "supported" : "unsupported"}>{available ? "Supported" : "Not ready"}</span></h3>{evidence.length ? <ul>{evidence.map((item) => <li key={item.id}><strong>{item.claim}</strong><small>{item.verification === "invoked" ? "Invocation-verified" : "Observed on site"} · {item.kind} · {item.verification} · {Math.round(item.confidence * 100)}%</small><a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink /></a></li>)}</ul> : <p>No supporting evidence was found.</p>}</section>;
}

import { ArrowRight, ArrowUpRight, ChevronDown, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { CapabilityEvidence, CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { verifiedAgo } from "../components/ActionDetailDialog";
import { CapabilityTest, testable } from "../components/CapabilityTest";
import { ContractViewer } from "../components/ContractViewer";
import { publishUrl, talkToUsUrl } from "../components/FixPanel";
import { useReportEngine } from "../engine/EngineContext";
import { track } from "../engine/track";
import { DETECTION_LABEL, RESPONSIBILITY_LABEL, agentStatus, detection, hostOf, peopleStatus, plural, savedChoice, typeWords, whatWeKnow } from "./surface";
import { AgentMark, Inspector, PeopleMark } from "./ui";

/**
 * One capability, where its row was selected: what was seen for people and what was verified for
 * agents, kept apart; the entities it is about; the evidence, as the report holds it; then the one
 * next step that is useful, which is a decision about who handles it, or a test the product already
 * runs. Technical work is named and linked, never performed from here: a saved decision records
 * responsibility and leaves the endpoint, the catalog and the score exactly where they were.
 */
const VERIFICATION_WORDS: Record<CapabilityEvidence["verification"], string> = {
  observed: "Observed on the site",
  declared: "Declared by the site",
  invoked: "Called, and it answered",
  failed: "Called, and it did not answer",
};

function EvidenceList({ title, items }: { title: string; items: CapabilityEvidence[] }) {
  return (
    <section className="evidence-group">
      <h4>{title}</h4>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.claim}</span>
              <small>
                {VERIFICATION_WORDS[item.verification]} ·{" "}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={11} aria-hidden="true" /></a>
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>No evidence was returned.</p>
      )}
    </section>
  );
}

export function CapabilityInspector({
  report,
  capability,
  onClose,
  onReviewOwnership,
  ownershipTriggerRef,
}: {
  report: ReportRecord;
  capability: CapabilityResult;
  onClose: () => void;
  onReviewOwnership: () => void;
  ownershipTriggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const { engine } = useReportEngine();
  const [allEntities, setAllEntities] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const testRef = useRef<HTMLDivElement | null>(null);

  // A different row is a different question: nothing from the last one stays open.
  useEffect(() => {
    setAllEntities(false);
    setShowEvidence(false);
    setShowTest(false);
  }, [capability.actionId, report.id]);

  const status = agentStatus(capability);
  const decided = savedChoice(capability);
  const canTest = testable(report, capability);
  const action = capability.label.charAt(0).toLowerCase() + capability.label.slice(1);
  const shown = allEntities ? capability.appliesTo : capability.appliesTo.slice(0, 2);
  const invoked = capability.evidence.filter((item) => item.verification === "invoked");
  // A supported test is the useful step only where something was declared or verified; elsewhere it is who handles it.
  const testFirst = canTest && (capability.state === "unverified" || capability.state === "agent-ready") && Boolean(decided || capability.state === "unverified");

  function openTest() {
    setShowTest(true);
    window.setTimeout(() => testRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 0);
  }

  const ownershipButton = (primary: boolean) => (
    <button type="button" ref={ownershipTriggerRef} className={`button ${primary ? "button-primary" : "button-outline"} button-block`} onClick={onReviewOwnership}>
      {decided ? "Change ownership" : "Review ownership"} <ArrowRight size={16} aria-hidden="true" />
    </button>
  );

  return (
    <Inspector kicker="Selected capability" title={capability.label} onClose={onClose} labelId="inspector-title">
      <p className="inspector-status"><AgentMark status={status} /></p>

      <dl className="inspector-pair">
        <div>
          <dt>For people</dt>
          <dd><PeopleMark status={peopleStatus(capability)} /></dd>
        </div>
        <div>
          <dt>For agents</dt>
          <dd><AgentMark status={status} /></dd>
        </div>
      </dl>

      {decided && capability.boundary && (
        <section className="inspector-section inspector-saved" aria-label="Saved responsibility">
          <p className="kicker kicker-quiet">Responsibility · saved in a review</p>
          <p className="inspector-saved-line">
            <b>{RESPONSIBILITY_LABEL[capability.boundary]}</b>
            {capability.boundaryPartner && (
              <>
                {": "}
                {capability.boundaryPartner.url ? <a href={capability.boundaryPartner.url} target="_blank" rel="noreferrer">{capability.boundaryPartner.name}</a> : capability.boundaryPartner.name}
              </>
            )}
          </p>
          {capability.boundaryRationale && <p className="inspector-note">{capability.boundaryRationale}</p>}
          <p className="inspector-note">A person said this. It is not evidence that the action works.</p>
        </section>
      )}

      <section className="inspector-section" aria-labelledby="inspector-about">
        <h3 id="inspector-about">About these {capability.appliesTo.length === 1 ? "entity" : "entities"}</h3>
        {capability.appliesTo.length > 0 ? (
          <>
            <ul className="chips">
              {shown.map((entity) => (
                <li key={entity.id} title={typeWords(entity.types[0])}>{entity.name}</li>
              ))}
            </ul>
            {capability.appliesTo.length > 2 && (
              <button type="button" className="text-button" aria-expanded={allEntities} onClick={() => setAllEntities((current) => !current)}>
                {allEntities ? "Show fewer" : `+ ${capability.appliesTo.length - 2} more`}
              </button>
            )}
          </>
        ) : (
          <p className="inspector-note">No entity in this report is linked to this action.</p>
        )}
      </section>

      <section className="inspector-section" aria-labelledby="inspector-know">
        <h3 id="inspector-know">What we know</h3>
        <p>{whatWeKnow(capability)}</p>
        {verifiedAgo(capability) && <p className="inspector-note">{verifiedAgo(capability)}, by the audit's own call.</p>}
        {invoked.length > 0 && (
          <ul className="invoked-list" aria-label="Successful calls">
            {invoked.slice(0, 3).map((item) => (
              <li key={item.id}>
                <span>{item.claim}</span>
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">Source <ExternalLink size={11} aria-hidden="true" /></a>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="text-button text-button-strong" aria-expanded={showEvidence} onClick={() => setShowEvidence((current) => !current)}>
          {showEvidence ? "Hide evidence & contract" : "Inspect evidence & contract"} <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        {showEvidence && (
          <div className="inspector-evidence">
            <p className="inspector-note">{capability.description}</p>
            <EvidenceList title="For people" items={capability.evidence.filter((item) => item.audience === "human")} />
            <EvidenceList title="For agents" items={capability.evidence.filter((item) => item.audience === "agent")} />
            <p className="inspector-note">
              {capability.expectationSource.some((source) => source.startsWith("human:")) ? "Expected because a person said so." : "Expected of this kind of site by the action model."}
              {!capability.expected && " Observed on the site beyond what this kind of site is expected to offer."}
            </p>
            {capability.contract ? <ContractViewer reportId={report.id} actionId={capability.actionId} contract={capability.contract} /> : <p className="inspector-note">No machine contract was compiled for this action.</p>}
          </div>
        )}
      </section>

      <section className="inspector-section inspector-next" aria-labelledby="inspector-next">
        <p className="kicker">{testFirst ? "Next step" : "Next decision"}</p>
        {testFirst ? (
          <>
            <h3 id="inspector-next">{capability.state === "agent-ready" ? "Call it again with your own inputs" : "Try the declared interface yourself"}</h3>
            <p>
              {capability.state === "agent-ready"
                ? "The interface answered when the audit called it. You can call it again and see what it answers today."
                : "A first call can fail for reasons that are not the interface's: inputs the audit had to guess, a busy moment, a rate limit. Run the same call with your own inputs."}
            </p>
            <button type="button" className="button button-primary button-block" onClick={openTest}>
              Test it yourself <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className="inspector-note">Read-only calls only. Readiness moves only if you save an answer as evidence.</p>
            {ownershipButton(false)}
          </>
        ) : (
          <>
            <h3 id="inspector-next">{decided ? `You said who handles this` : `Who handles “${action}”?`}</h3>
            <p>
              {decided
                ? "The responsibility is saved on this version. The technical work, if any, is the next step and is listed below."
                : capability.state === "missing"
                  ? "Before any technical work: say whether this action applies to your business, and who would handle it."
                  : "Tell agents whether your team handles this action or passes it to a partner."}
            </p>
            {ownershipButton(!decided)}
            <p className="inspector-note">This defines responsibility. It does not verify execution.</p>
            {canTest && (
              <button type="button" className="text-button" onClick={openTest}>Test what the site declares</button>
            )}
          </>
        )}
        {showTest && canTest && (
          <div ref={testRef} className="inspector-test">
            <CapabilityTest key={capability.actionId} report={report} capability={capability} />
          </div>
        )}
      </section>

      <details className="inspector-section inspector-technical">
        <summary>
          Technical next steps <ChevronDown size={18} aria-hidden="true" />
        </summary>
        <p className="inspector-note">Available in the existing activation runbook. Nothing here installs an endpoint, publishes a catalog or changes the score.</p>
        {capability.recommendation && <p>{capability.recommendation}</p>}
        <ul className="link-list">
          <li>
            <Link to={`/reports/${report.id}/activate#runbook-title`}>Open the activation runbook <ArrowRight size={14} aria-hidden="true" /></Link>
          </li>
          {capability.state === "human-only" && (
            <li>
              <a href={publishUrl(report.id, { action: capability.actionId, intent: "agent-ready", engine: engine?.id })} onClick={() => track(report.id, "door_agent-ready")} target="_blank" rel="noreferrer">
                Make this agent-ready with WordLift <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          )}
          {capability.state === "agent-ready" && (
            <li>
              <a href={publishUrl(report.id, { action: capability.actionId, intent: "keep", engine: engine?.id })} onClick={() => track(report.id, "door_keep")} target="_blank" rel="noreferrer">
                Keep it agent-ready with WordLift <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          )}
          {capability.state === "missing" && (
            <li>
              <a href={talkToUsUrl(report.id, capability.actionId)} target="_blank" rel="noreferrer">
                Talk to us about designing the interface <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </li>
          )}
        </ul>
      </details>
    </Inspector>
  );
}

/** What the scan saw that says the site runs WordLift, and what that does not prove. */
export function DetectionInspector({ report, onClose }: { report: ReportRecord; onClose: () => void }) {
  const found = detection(report);
  const pages = report.contextGraph?.pages ?? [];
  const host = hostOf(report);
  return (
    <Inspector kicker="Detection evidence" title={DETECTION_LABEL[found.state]} onClose={onClose} labelId="inspector-title">
      {found.state === "detected" && (
        <>
          <section className="inspector-section">
            <h3>What was seen</h3>
            <p>{found.evidence.replace(/\.?$/, ".")}</p>
            <p className="inspector-note">
              Read from <a href={found.sourceUrl} target="_blank" rel="noreferrer">{found.sourceUrl}</a>
            </p>
          </section>
          <section className="inspector-section">
            <h3>Published entity IDs</h3>
            {found.publishedIds.length > 0 ? (
              <ul className="id-list">
                {found.publishedIds.map((id) => <li key={id}><code>{id}</code></li>)}
              </ul>
            ) : (
              <p className="inspector-note">No entity in this report carries an identifier published on data.wordlift.io.</p>
            )}
          </section>
        </>
      )}
      {found.state === "not-detected" && (
        <section className="inspector-section">
          <h3>What was checked</h3>
          <p>The structured data and markup of the {plural(pages.length, "page")} read on {host}. None names WordLift as the publishing platform.</p>
          <ul className="id-list">
            {pages.map((page) => <li key={page.url}><a href={page.url} target="_blank" rel="noreferrer">{page.url}</a></li>)}
          </ul>
          <p className="inspector-note">Scoped to this scan: a page that was not read may say otherwise.</p>
        </section>
      )}
      {found.state === "unavailable" && (
        <section className="inspector-section">
          <h3>Nothing to go on</h3>
          <p>No page of {host} was read in this scan, so detection has no answer. This is not a negative result.</p>
        </section>
      )}
      <section className="inspector-section">
        <h3>What this does not say</h3>
        <p>Detection reads the site. It is not an account connection, and it does not prove who owns {host}.</p>
      </section>
    </Inspector>
  );
}

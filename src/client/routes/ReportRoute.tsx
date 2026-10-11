import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { explainReportError, failureTitle, onlyFoundationMissing, unreadableReason, visibleErrors } from "../../shared/format/explainError.js";
import type { Archetype, ReportRecord } from "../../shared/types/index.js";
import { ApiError, getReport, recompileReport } from "../api/client";
import { ActionJourney } from "../components/ActionJourney";
import { AgentDiary } from "../components/AgentDiary";
import { BoundariesTable } from "../components/BoundariesTable";
import { AlpinaSidecarPanel } from "../components/AlpinaSidecarPanel";
import { ClassificationCard } from "../components/ClassificationCard";
import { ContextEngineMap, heroEntityId } from "../components/ContextEngineMap";
import { ExecutiveSummary } from "../components/ExecutiveSummary";
import { FoundationAuditDetails } from "../components/FoundationAuditDetails";
import { captureReviewToken } from "../engine/engineKeys";
import { EngineProvider } from "../engine/EngineContext";
import { ReportErrorState } from "../components/ReportErrorState";
import { ReportProgress } from "../components/ReportProgress";
import { deliveryAsked, SendMeTheReport } from "../components/SendMeTheReport";
import { ServiceMapProvenance } from "../components/ServiceMapProvenance";
import { SiteToolsBadge } from "../components/SiteToolsBadge";
import { AuditDoorway } from "../surface/AuditDoorway";
import { CapabilityInspector, DetectionInspector } from "../surface/CapabilityInspector";
import { EntityReviewModal } from "../surface/EntityReview";
import { FixView, parseFilter } from "../surface/FixView";
import { fixTab, reportHref, useReportNav } from "../surface/nav";
import { OwnershipModal } from "../surface/OwnershipModal";
import type { SavedNotice } from "../surface/surface";
import { AlpinaAvailabilityTool } from "../webmcp/AlpinaAvailabilityTool";
import { ExplainCapabilityTool } from "../webmcp/ExplainCapabilityTool";
import { ExplainFoundationAuditTool } from "../webmcp/ExplainFoundationAuditTool";
import { ExplainEntityTool } from "../webmcp/ExplainEntityTool";
import { InspectBusinessModelTool } from "../webmcp/InspectBusinessModelTool";
import { InspectServiceMapTool } from "../webmcp/InspectServiceMapTool";
import { RefineServiceMapTool } from "../webmcp/RefineServiceMapTool";

const SIDECAR_HOST = "alpina.travel";

/**
 * Below this, the progress screen was not on screen long enough for anyone to type an address: a
 * site read earlier that day lands at once, and the field it carried was never seen.
 */
const LATE_ASK_UNDER_MS = 6_000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The approved sidecar is offered only where its allowlisted endpoint actually applies. */
function sidecarApplies(report: ReportRecord): boolean {
  try {
    return new URL(report.canonicalUrl ?? report.requestedUrl).hostname.replace(/^www\./, "") === SIDECAR_HOST;
  } catch {
    return false;
  }
}

export function ReportRoute() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  // A page reached from "Audit my site" may ask for the record before the audit has filed it.
  const routeState = useLocation().state as { started?: boolean; saved?: SavedNotice } | null;
  const justStarted = Boolean(routeState?.started);
  const { mode, params, select, hash, search } = useReportNav();
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The two decisions that have Save and Cancel open over whatever is on screen, and close back onto it.
  const [review, setReview] = useState<{ entityId?: string; all?: boolean } | null>(null);
  const [ownershipFor, setOwnershipFor] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState<string | null>(null);
  const ownershipTrigger = useRef<HTMLButtonElement | null>(null);
  // What had focus when a modal opened: closing it without saving puts the keyboard back there.
  const opener = useRef<HTMLElement | null>(null);
  const rememberOpener = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const closeModals = useCallback(() => {
    setReview(null);
    setOwnershipFor(null);
    const back = opener.current;
    window.setTimeout(() => (back?.isConnected ? back : ownershipTrigger.current)?.focus(), 0);
  }, []);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  // A review link from the holder carries a day-long token: kept for this tab, taken off the address.
  useState(() => captureReviewToken());
  // When the progress screen first showed, if it did: the person who started an audit and saw it
  // for less than a few seconds never had time to give an address, so the report asks once instead.
  const progressShownAt = useRef<number | null>(null);
  const [askLate, setAskLate] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    let notFoundRetries = 0;
    let timer: number | undefined;

    const load = async () => {
      try {
        const record = await getReport(reportId);
        if (cancelled) return;
        setReport(record);
        setError(null);
        // The map arrives with its best story already lit: the entity with the most bound actions.
        if (record.status !== "running" && record.contextGraph) {
          const graph = record.contextGraph;
          setSelectedEntityId((current) => current ?? heroEntityId(graph));
        }
        // A running report is watched until it lands; the page fills in as the audit works.
        if (record.status === "running") timer = window.setTimeout(load, 1_500);
      } catch (caught) {
        if (cancelled) return;
        // Right after starting an audit the record may not exist yet; give it a moment. A link
        // opened cold gets one retry, then the truth.
        if (caught instanceof ApiError && caught.status === 404 && notFoundRetries < (justStarted ? 12 : 1)) {
          notFoundRetries += 1;
          timer = window.setTimeout(load, 700);
          return;
        }
        setError(
          caught instanceof ApiError && caught.status === 404
            ? "This report has expired or never existed. Reports stay for 30 days at their link; audit the site again for a new one."
            : caught instanceof Error
              ? caught.message
              : "Report unavailable",
        );
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reportId, justStarted]);

  async function override(archetype: Archetype) {
    if (!report) return;
    const child = await recompileReport(report.id, archetype);
    navigate(`/reports/${child.id}`);
  }

  // Each view starts at its top; an anchor inside the evidence is still honoured.
  useEffect(() => {
    const target = hash.startsWith("#audit-") ? document.getElementById(hash.slice(1)) : null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo?.({ top: 0 });
  }, [mode, hash, reportId]);

  const selectedActionId = params.get("action");
  const inspecting = params.get("inspect");

  /** Closing detail restores the surface it was opened from, filters untouched, focus back on the row. */
  const closeInspector = useCallback(() => {
    const row = selectedActionId ? document.querySelector<HTMLElement>(`[data-action-id="${CSS.escape(selectedActionId)}"] button, button[data-action-id="${CSS.escape(selectedActionId)}"]`) : document.querySelector<HTMLElement>(".detection button, .detection-chip");
    select({ action: null, inspect: null });
    window.setTimeout(() => row?.focus(), 0);
  }, [select, selectedActionId]);

  /** A save answers with a reviewed version: that is where the page goes, with the same view and selection. */
  const openReviewed = useCallback(
    (child: ReportRecord, notice: SavedNotice) => {
      setReview(null);
      setOwnershipFor(null);
      setReport(child);
      setNoticeDismissed(null);
      navigate(reportHref(child.id, mode, search), { state: { saved: notice } });
    },
    [navigate, mode, search],
  );

  // The tools register the moment the route mounts — before the report has loaded, exactly when
  // an agent driving the page starts looking for them. Their handlers fetch the report on demand.
  const tools = (
    <>
      <InspectServiceMapTool reportId={reportId} report={report} />
      <InspectBusinessModelTool reportId={reportId} report={report} />
      <ExplainEntityTool reportId={reportId} report={report} />
      <ExplainCapabilityTool reportId={reportId} report={report} />
      <ExplainFoundationAuditTool reportId={reportId} report={report} />
      <RefineServiceMapTool reportId={reportId} report={report} />
    </>
  );

  if (error) return <>{tools}<ReportErrorState title="Report unavailable" message={error} /></>;
  if (!report) return <>{tools}<div className="report-loading" role="status">Loading the capability map…</div></>;
  if (report.status === "running") {
    progressShownAt.current ??= Date.now();
    return <>{tools}<ReportProgress report={report} /></>;
  }
  if (askLate === null) {
    const seenLongEnough = progressShownAt.current !== null && Date.now() - progressShownAt.current >= LATE_ASK_UNDER_MS;
    setAskLate(justStarted && report.status !== "failed" && !seenLongEnough && !deliveryAsked(report.id));
  }
  if (report.status === "failed") {
    return (
      <>
        {tools}
        <ReportErrorState
          title={failureTitle(report.errors)}
          message={visibleErrors(report.errors).map(explainReportError).join(" ") || "No usable evidence was collected."}
        />
      </>
    );
  }

  const capability = selectedActionId ? report.capabilities?.find((candidate) => candidate.actionId === selectedActionId) ?? null : null;
  const ownershipCapability = ownershipFor ? report.capabilities?.find((candidate) => candidate.actionId === ownershipFor) ?? null : null;
  const saved = routeState?.saved && report.refinement && noticeDismissed !== report.id ? routeState.saved : null;
  const inspector = capability ? (
    <CapabilityInspector report={report} capability={capability} onClose={closeInspector} onReviewOwnership={() => { rememberOpener(); setOwnershipFor(capability.actionId); }} ownershipTriggerRef={ownershipTrigger} />
  ) : inspecting === "wordlift" ? (
    <DetectionInspector report={report} onClose={closeInspector} />
  ) : null;
  const inspectDetection = () => select({ inspect: "wordlift", action: null });

  return (
    <EngineProvider report={report}>
    <div className={`report-page report-mode-${mode}${inspector ? " has-inspector" : ""}`}>
      {tools}
      <AlpinaAvailabilityTool reportId={report.id} enabled={sidecarApplies(report)} />
      {report.status === "partial" && !onlyFoundationMissing(report.errors) && !unreadableReason(report.errors) && (
        <div className="partial-banner" role="status">Partial report: {visibleErrors(report.errors).map(explainReportError).join(" ")}</div>
      )}
      {/* What a save sent, said back once on the version it returned, with whatever the server could not apply. */}
      {saved && (
        <div className="saved-banner" role="status">
          <div>
            <p><b>Reviewed version saved.</b> {saved.summary} Agent readiness is unchanged: a review says who is responsible, evidence says what works.</p>
            {report.refinement!.conflicts.length > 0 && (
              <div className="saved-banner-unapplied">
                <p>Not applied:</p>
                <ul>{report.refinement!.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>
              </div>
            )}
          </div>
          <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => setNoticeDismissed(report.id)}><X size={18} aria-hidden="true" /></button>
        </div>
      )}
      {/* The one field, once, for whoever never saw the progress screen long enough to answer it. */}
      {askLate && mode === "audit" && <SendMeTheReport reportId={report.id} host={hostOf(report.canonicalUrl ?? report.requestedUrl)} variant="late" onDismiss={() => setAskLate(false)} />}

      {mode === "audit" && (
        <div className="surface-layout">
          <AuditDoorway
            key={`audit-${report.id}`}
            report={report}
            selectedActionId={selectedActionId}
            onInspectAction={(actionId) => select({ action: actionId, inspect: null })}
            onInspectDetection={inspectDetection}
            onReviewEntities={(options) => { rememberOpener(); setReview(options ?? {}); }}
          />
          {inspector}
        </div>
      )}

      {mode === "fix" && (
        <div className="surface-layout surface-layout-docked">
          <FixView
            report={report}
            tab={fixTab(params.get("view"), hash)}
            filter={parseFilter(params.get("filter"))}
            showOthers={params.get("others") === "1"}
            selectedActionId={selectedActionId}
            onSelect={select}
            onInspectDetection={inspectDetection}
            onSaved={openReviewed}
          />
          {inspector}
        </div>
      )}

      {mode === "evidence" && <EvidenceView report={report} selectedEntityId={selectedEntityId} onSelectEntity={setSelectedEntityId} onOverride={override} />}

      {review && <EntityReviewModal key={`review-${report.id}`} report={report} initialEntityId={review.entityId ?? null} initialAll={Boolean(review.all)} onClose={closeModals} onSaved={openReviewed} />}
      {ownershipCapability && <OwnershipModal key={`own-${report.id}-${ownershipCapability.actionId}`} report={report} capability={ownershipCapability} onClose={closeModals} onSaved={openReviewed} />}
    </div>
    </EngineProvider>
  );
}

/**
 * The precise layer, as engineers, agencies, auditors and agents read it: every entity, term,
 * action, boundary and piece of evidence the report holds, with the foundation audit as the
 * technical ground. It is reachable from every screen and fills none of them.
 */
function EvidenceView({
  report,
  selectedEntityId,
  onSelectEntity,
  onOverride,
}: {
  report: ReportRecord;
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  onOverride: (archetype: Archetype) => Promise<void>;
}) {
  return (
    <section className="full-audit evidence-view" id="full-audit" aria-labelledby="evidence-title">
      <header className="fix-head">
        <p className="kicker"><span>{hostOf(report.canonicalUrl ?? report.requestedUrl)}</span><span>Model &amp; evidence</span></p>
        <h1 id="evidence-title">Model &amp; evidence</h1>
        <p className="fix-lead">Entities, terminology, actions, Terms of Action and the evidence behind every state.</p>
      </header>
      <div className="full-audit-body">
        <div className="full-audit-tools"><SiteToolsBadge /></div>
        <nav className="full-audit-nav" aria-label="Model and evidence sections">
          <a href="#audit-entities">Entities</a>
          <a href="#audit-terminology">Terminology</a>
          <a href="#audit-actions">Actions</a>
          <a href="#audit-boundaries">Business boundaries</a>
          <a href="#audit-terms">Terms of Action</a>
          <a href="#audit-evidence">Evidence &amp; provenance</a>
        </nav>
        <ExecutiveSummary report={report} />
        {/* Keyed by report so a recompile that lands on the child report hands back a fresh form. */}
        {report.classification && <ClassificationCard key={report.id} classification={report.classification} onOverride={onOverride} />}

        <section className="audit-section" id="audit-entities" aria-labelledby="audit-entities-title">
          <h2 id="audit-entities-title" className="audit-section-title">Entities <span>what the organisation is, offers, owns and refers to</span></h2>
          <p className="audit-section-lead" id="audit-terminology">
            With the terminology beside them: the words this organisation uses, and what it means by them. The map below draws entities,
            terms and actions together, declared in blue and inferred marked as such.
          </p>
          {report.contextGraph && report.classification && (
            <ContextEngineMap
              context={report.contextGraph}
              classification={report.classification}
              capabilities={report.capabilities ?? []}
              selectedEntityId={selectedEntityId}
              onSelectEntity={onSelectEntity}
            />
          )}
        </section>

        <section className="audit-section" id="audit-actions" aria-labelledby="audit-actions-title">
          <h2 id="audit-actions-title" className="audit-section-title">Actions <span>every expected action, its state, its interface and its evidence</span></h2>
          <ActionJourney reportId={report.id} capabilities={report.capabilities ?? []} selectedEntityId={selectedEntityId} />
          {/* The proof behind the states, in the audit's own words: what its agent actually did. */}
          <AgentDiary report={report} />
        </section>

        <section className="audit-section" id="audit-boundaries">
          <BoundariesTable report={report} />
        </section>

        <section className="audit-section" id="audit-terms" aria-labelledby="audit-terms-title">
          <h2 id="audit-terms-title" className="audit-section-title">Terms of Action <span>the consolidated contract agents load</span></h2>
          <p className="audit-section-lead">
            Machine-drafted from the evidence, refined by the decisions above, and rendered as{" "}
            <a href={`/api/reports/${report.id}/publish/skill.md`} target="_blank" rel="noreferrer">the file an agent reads before acting</a>. It states
            boundaries and cites this report for readiness; it never claims an action works.
          </p>
          <ServiceMapProvenance report={report} />
        </section>

        <section className="audit-section" id="audit-evidence" aria-labelledby="audit-evidence-title">
          <h2 id="audit-evidence-title" className="audit-section-title">Evidence &amp; provenance <span>why each readiness state was given</span></h2>
          <p className="audit-section-lead">
            Every action above opens on its evidence: what was observed, declared, invoked or failed, with the source, the time and the
            provenance of each claim. Readiness moves only on a verified invocation. The foundation audit below is the technical ground.
          </p>
          {report.foundationAudit ? <FoundationAuditDetails audit={report.foundationAudit} /> : <p className="empty-note">No foundation audit was returned for this report.</p>}
        </section>

        {/* Labs: a contained technical proof, deliberately out of the product's primary story. */}
        {sidecarApplies(report) && (
          <details className="labs-fold">
            <summary>Labs — approved-adapter reference (alpina.travel)</summary>
            <AlpinaSidecarPanel
              reportId={report.id}
              verified={
                report.capabilities?.some(
                  (capability) => capability.actionId === "availability.check" && capability.state === "agent-ready" && capability.via === "sidecar",
                ) ?? false
              }
            />
          </details>
        )}
      </div>
    </section>
  );
}

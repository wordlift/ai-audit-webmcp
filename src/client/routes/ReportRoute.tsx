import { ArrowLeft, ArrowRight, Rocket, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { explainReportError, failureTitle, visibleErrors } from "../../shared/format/explainError.js";
import type { Archetype, ReportRecord } from "../../shared/types/index.js";
import { ApiError, getReport, recompileReport } from "../api/client";
import { ActionJourney } from "../components/ActionJourney";
import { AgentSurfaces } from "../components/AgentSurfaces";
import { AlpinaSidecarPanel } from "../components/AlpinaSidecarPanel";
import { ClassificationCard } from "../components/ClassificationCard";
import { ContextEngineMap, heroEntityId } from "../components/ContextEngineMap";
import { ExecutiveSummary } from "../components/ExecutiveSummary";
import { FirstScreen } from "../components/FirstScreen";
import { FoundationAuditDetails } from "../components/FoundationAuditDetails";
import { OwnIt } from "../components/OwnIt";
import { ReportErrorState } from "../components/ReportErrorState";
import { ReportProgress } from "../components/ReportProgress";
import { ServiceMapProvenance } from "../components/ServiceMapProvenance";
import { UnderstandPanel } from "../components/UnderstandPanel";
import { SiteToolsBadge } from "../components/SiteToolsBadge";
import { AlpinaAvailabilityTool } from "../webmcp/AlpinaAvailabilityTool";
import { ExplainCapabilityTool } from "../webmcp/ExplainCapabilityTool";
import { ExplainFoundationAuditTool } from "../webmcp/ExplainFoundationAuditTool";
import { InspectServiceMapTool } from "../webmcp/InspectServiceMapTool";
import { RefineServiceMapTool } from "../webmcp/RefineServiceMapTool";

const SIDECAR_HOST = "alpina.travel";

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
  const justStarted = Boolean((useLocation().state as { started?: boolean } | null)?.started);
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

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

  async function share() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  // The tools register the moment the route mounts — before the report has loaded, exactly when
  // an agent driving the page starts looking for them. Their handlers fetch the report on demand.
  const tools = (
    <>
      <InspectServiceMapTool reportId={reportId} report={report} />
      <ExplainCapabilityTool reportId={reportId} report={report} />
      <ExplainFoundationAuditTool reportId={reportId} report={report} />
      <RefineServiceMapTool reportId={reportId} report={report} />
    </>
  );

  if (error) return <>{tools}<ReportErrorState title="Report unavailable" message={error} /></>;
  if (!report) return <>{tools}<div className="report-loading" role="status">Loading the capability map…</div></>;
  if (report.status === "running") return <>{tools}<ReportProgress report={report} /></>;
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

  return (
    <div className="report-page">
      {tools}
      <AlpinaAvailabilityTool reportId={report.id} enabled={sidecarApplies(report)} />
      <nav className="report-toolbar" aria-label="Report actions">
        <Link to="/"><ArrowLeft size={17} /> New audit</Link>
        <button type="button" onClick={share}><Share2 size={17} /> {copied ? "Copied" : "Share report"}</button>
      </nav>
      {report.status === "partial" && (
        <div className="partial-banner" role="status">Partial report: {visibleErrors(report.errors).map(explainReportError).join(" ")}</div>
      )}
      {/* The first screen speaks three plain words. Everything precise is one click below. */}
      <FirstScreen key={`first-${report.id}`} report={report} />
      {/* Understand, then Fix: every entity the audit read, and the button that publishes the ones agents cannot see. */}
      <UnderstandPanel report={report} />
      {/* Own it: who runs each of the three actions, answered in a minute. Readiness never moves on a word. */}
      <OwnIt key={`own-${report.id}`} report={report} />
      {/* Activate: one screen away, so the report stays three words and their fixes. */}
      <section className="activate-strip" aria-labelledby="activate-strip-title">
        <p className="section-kicker"><Rocket size={16} /> Activate</p>
        <h2 id="activate-strip-title">Activate your business for agents</h2>
        <p>Publish what agents need to discover, understand and use your business, and see who reads it.</p>
        <Link className="activate-link" to={`/reports/${report.id}/activate`}>
          Activate <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>
      <details className="full-audit" id="full-audit">
        <summary>
          Full audit <span>Entities · Terminology · Actions · Terms of Action · Evidence</span>
          <small className="full-audit-hint">
            Evidence, entities, terminology, actions, governance and agent-readiness details: the precise layer, the way engineers,
            agencies, auditors and agents read it.
          </small>
        </summary>
        <div className="full-audit-body">
          <div className="full-audit-tools"><SiteToolsBadge /></div>
          <ServiceMapProvenance report={report} />
          <ExecutiveSummary report={report} />
          {/* Keyed by report so a recompile that lands on the child report hands back a fresh form. */}
          {report.classification && <ClassificationCard key={report.id} classification={report.classification} onOverride={override} />}
          {report.contextGraph && report.classification && (
            <ContextEngineMap
              context={report.contextGraph}
              classification={report.classification}
              capabilities={report.capabilities ?? []}
              selectedEntityId={selectedEntityId}
              onSelectEntity={setSelectedEntityId}
            />
          )}
          <ActionJourney
            reportId={report.id}
            capabilities={report.capabilities ?? []}
            selectedEntityId={selectedEntityId}
          />
          {report.foundationAudit && <FoundationAuditDetails audit={report.foundationAudit} />}
          <AgentSurfaces report={report} />
          {/* Labs: a contained technical proof, deliberately out of the product's primary story. */}
          {sidecarApplies(report) && (
            <details className="labs-fold">
              <summary>Labs — approved-adapter reference (alpina.travel)</summary>
              <AlpinaSidecarPanel
                reportId={report.id}
                verified={
                  report.capabilities?.some(
                    (capability) =>
                      capability.actionId === "availability.check" && capability.state === "agent-ready" && capability.via === "sidecar",
                  ) ?? false
                }
              />
            </details>
          )}
        </div>
      </details>
    </div>
  );
}

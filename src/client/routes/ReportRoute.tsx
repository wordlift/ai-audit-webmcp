import { ArrowLeft, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Archetype, ReportRecord } from "../../shared/types/index.js";
import { ApiError, getReport, recompileReport } from "../api/client";
import { AlpinaSidecarPanel } from "../components/AlpinaSidecarPanel";
import { Chapter, JourneyRail, type ChapterSpec } from "../components/Chapter";
import { ExecutiveSummary } from "../components/ExecutiveSummary";
import { ReportErrorState } from "../components/ReportErrorState";
import { ReportProgress } from "../components/ReportProgress";
import { ServiceMap } from "../components/ServiceMap";
import { AlpinaAvailabilityTool } from "../webmcp/AlpinaAvailabilityTool";
import { ExplainCapabilityTool } from "../webmcp/ExplainCapabilityTool";

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
  const [report, setReport] = useState<ReportRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
        // A running report is watched until it lands; the page fills in as the audit works.
        if (record.status === "running") timer = window.setTimeout(load, 1_500);
      } catch (caught) {
        if (cancelled) return;
        // Right after starting an audit the record may not exist yet; give it a moment.
        if (caught instanceof ApiError && caught.status === 404 && notFoundRetries < 12) {
          notFoundRetries += 1;
          timer = window.setTimeout(load, 700);
          return;
        }
        setError(caught instanceof Error ? caught.message : "Report unavailable");
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reportId]);

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

  if (error) return <ReportErrorState title="Report unavailable" message={error} />;
  if (!report) return <div className="report-loading" role="status">Loading the capability map…</div>;
  if (report.status === "running") return <ReportProgress report={report} />;
  if (report.status === "failed") return <ReportErrorState title="We could not understand this site" message={report.errors[0]?.message ?? "No usable evidence was collected."} />;

  return (
    <div className="report-page">
      <ExplainCapabilityTool report={report} />
      <AlpinaAvailabilityTool reportId={report.id} enabled={sidecarApplies(report)} />
      <nav className="report-toolbar" aria-label="Report actions">
        <Link to="/"><ArrowLeft size={17} /> New audit</Link>
        <button type="button" onClick={share}><Share2 size={17} /> {copied ? "Copied" : "Share report"}</button>
      </nav>
      {report.status === "partial" && <div className="partial-banner" role="status">Partial report: {report.errors[0]?.message}</div>}
      <JourneyRail chapters={journeyChapters(report)} />
      <div id="chapter-audit" className="chapter">
        <ExecutiveSummary report={report} />
      </div>
      <ServiceMap report={report} onOverride={override} />
      <Chapter
        id="chapter-invocation"
        step={5}
        title="WebMCP invocation"
        lede={
          sidecarApplies(report)
            ? "The map ends in a call: run the approved read-only sidecar and watch this report gain a verified revision."
            : "The map ends in a call: this report's own tools are registered in the page through navigator.modelContext."
        }
      >
        {sidecarApplies(report) ? (
          <AlpinaSidecarPanel
            reportId={report.id}
            verified={
              report.capabilities?.some(
                (capability) => capability.actionId === "availability.check" && capability.state === "sidecar-enabled",
              ) ?? false
            }
          />
        ) : (
          <div className="invocation-card">
            <p>
              <strong>audit-website</strong> — run this audit for any public site, from any
              WebMCP-enabled agent.
            </p>
            <p>
              <strong>explain-capability</strong> — ask about any action on this map: its state, the
              entities it applies to, the evidence, the boundary, and the machine-readable contract.
            </p>
            <p className="invocation-note">
              Open this page where WebMCP is available and the tools register automatically — the
              badge in the header shows when they are live.
            </p>
          </div>
        )}
      </Chapter>
    </div>
  );
}

function journeyChapters(report: ReportRecord): ChapterSpec[] {
  return [
    { id: "chapter-audit", label: "Audit summary" },
    { id: "chapter-entities", label: "Key entities" },
    ...(report.classification ? [{ id: "chapter-meaning", label: "Meaning & provenance" }] : []),
    { id: "chapter-actions", label: "Key actions" },
    { id: "chapter-invocation", label: "WebMCP invocation" },
  ];
}

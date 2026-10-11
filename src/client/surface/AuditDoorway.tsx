import { AlertCircle, AppWindow, ArrowRight, ArrowUpRight, Box, Building2, CalendarDays, Check, FileText, MapPin, Minus, Play, Search, Settings, Tag, UserRound, CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { explainReportError, onlyFoundationMissing, unreadableReason } from "../../shared/format/explainError.js";
import { siteKind } from "../../shared/format/modelView.js";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { retryFoundation } from "../api/client";
import { ownWords } from "../components/FirstScreen";
import { track } from "../engine/track";
import { reportHref } from "./nav";
import {
  DETECTION_LABEL,
  PROVENANCE_LABEL,
  RESPONSIBILITY_LABEL,
  STAGES,
  agentStatus,
  detection,
  doorwayEntities,
  entityCounts,
  hostOf,
  identity,
  listedCapabilities,
  otherDetected,
  plural,
  sector,
  typeWords,
  verifiedCount,
  type CoreEntity,
} from "./surface";
import { AgentMark } from "./ui";

/**
 * Audit, the doorway: the business comes first. The audited host is the title, because it is the
 * one thing nobody has to take on trust; what the audit understood follows, each thing marked with
 * where the knowledge came from; then what agents can do, as the four-stage map. Evidence is one
 * click from everything and fills nothing. A business the scan could not settle is said to need
 * review, never promoted into a headline.
 */
const RELATION_WORDS: Record<string, string> = { offers: "offers", "located-in": "is in", "provided-by": "is provided by", "part-of": "is part of", serves: "serves", brand: "carries the brand" };

function EntityIcon({ core }: { core: CoreEntity }) {
  const type = core.entity.types[0] ?? "";
  const props = { size: 26, strokeWidth: 1.4, "aria-hidden": true } as const;
  if (core.view.role === "business") return <Building2 {...props} />;
  if (core.view.role === "place") return <MapPin {...props} />;
  if (core.view.role === "person") return <UserRound {...props} />;
  if (core.view.role === "content") return <FileText {...props} />;
  if (type === "SoftwareApplication" || type === "WebApplication") return <AppWindow {...props} />;
  if (type === "Service") return <Settings {...props} />;
  if (type === "Event") return <CalendarDays {...props} />;
  if (type === "Offer") return <Tag {...props} />;
  return <Box {...props} />;
}

const STAGE_ICON: Record<string, ReactNode> = {
  discover: <Search size={20} strokeWidth={1.5} aria-hidden="true" />,
  "understand-decide": <FileText size={20} strokeWidth={1.5} aria-hidden="true" />,
  act: <Play size={20} strokeWidth={1.5} aria-hidden="true" />,
  manage: <UserRound size={20} strokeWidth={1.5} aria-hidden="true" />,
};

export function AuditDoorway({
  report,
  selectedActionId,
  onInspectAction,
  onInspectDetection,
  onReviewEntities,
  afterRecognition,
}: {
  report: ReportRecord;
  selectedActionId: string | null;
  onInspectAction: (actionId: string) => void;
  onInspectDetection: () => void;
  onReviewEntities: (options?: { entityId?: string; all?: boolean }) => void;
  /** What is optional and can wait until the business has been recognised: shown after that block. */
  afterRecognition?: ReactNode;
}) {
  const [wholeQuote, setWholeQuote] = useState(false);

  const host = hostOf(report);
  const pages = report.contextGraph?.pages.length ?? 0;
  const kind = sector(siteKind(report));
  const found = detection(report);
  const who = identity(report);
  const shown = doorwayEntities(report);
  const counts = entityCounts(report);
  const relations = report.contextGraph?.relations ?? [];
  const names = new Map((report.contextGraph?.entities ?? []).map((entity) => [entity.id, entity.name]));
  const listed = listedCapabilities(report);
  const others = otherDetected(report);
  const verified = verifiedCount(listed);
  const quote = ownWords(report);
  const unreadable = pages === 0 || counts.total === 0 ? unreadableReason(report.errors) : null;
  const checked = report.capabilities !== undefined;

  return (
    <section className="doorway" id="step-audit" aria-labelledby="doorway-title">
      {/* 1. Recognition: the site, its sector, and whether it already runs WordLift. */}
      <div className="doorway-hero">
        <div className="doorway-identity">
          <p className="kicker">
            {report.classification ? kind.label : "Sector not classified"}
            {report.classification?.provisional && " (provisional)"}
            {pages > 0 && <> · {plural(pages, "page")} analyzed</>}
          </p>
          <h1 id="doorway-title">{host}</h1>
          {quote && (
            <p className={`doorway-quote${wholeQuote ? " is-open" : ""}`}>
              <q>{quote}</q>
              <span>
                Language found on your site.
                {quote.length > 110 && (
                  <button type="button" className="text-button" aria-expanded={wholeQuote} onClick={() => setWholeQuote((current) => !current)}>
                    {wholeQuote ? "Show less" : "Show all of it"}
                  </button>
                )}
              </span>
            </p>
          )}
          {unreadable && (
            <p className="doorway-unreadable" role="status">
              WordLift could not read {host}. {explainReportError(unreadable)} Nothing below is about the business yet.
            </p>
          )}
        </div>
        <div className={`detection detection-${found.state}`}>
          <span className="detection-badge" aria-hidden="true">
            {found.state === "detected" ? <Check size={22} strokeWidth={2.4} /> : found.state === "not-detected" ? <Minus size={22} /> : <CircleHelp size={22} />}
          </span>
          <div>
            <h2>{DETECTION_LABEL[found.state]}</h2>
            {found.state === "detected" && <p>Your site already uses WordLift. {found.evidence.replace(/\.?$/, ".")}</p>}
            {found.state === "not-detected" && <p>Nothing on the {plural(pages, "page")} read names WordLift as the site's publishing platform.</p>}
            {found.state === "unavailable" && <p>The scan did not read enough of the site to say whether it uses WordLift.</p>}
            <button type="button" className="text-button text-button-strong" onClick={onInspectDetection}>
              View detection evidence <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. What the audit understood: a compact set from the model's own order, provenance on every one. */}
      <div className="doorway-section" aria-labelledby="understood-title">
        <div className="section-head">
          <div>
            <h2 id="understood-title">What we understood about your business</h2>
            <p className="section-lead">A first reading of the products and services on your site.</p>
            {/* Uncertainty about who the business is sits beside the heading it qualifies, with the way to settle it. */}
            {who.state === "needs-review" && (
              <p className="identity-review" role="status">
                <AlertCircle size={20} strokeWidth={1.6} aria-hidden="true" />
                <span>
                  <b>Business identity needs review</b>
                  <span>{who.why}</span>
                </span>
                <button type="button" className="text-button text-button-strong" onClick={() => onReviewEntities(who.entity ? { entityId: who.entity.id } : { all: true })}>
                  Review identity <ArrowRight size={15} aria-hidden="true" />
                </button>
              </p>
            )}
          </div>
          {counts.total > 0 && (
            <button type="button" className="button button-outline" onClick={() => onReviewEntities()}>
              Review core entities <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Two groups, never mixed: what the report can stand behind, and candidates read from the text. */}
        {shown.confirmed.length > 0 && (
          <EntityGroup id="core-entities-label" label="Core entities" note="Declared by the site or marked core in a review." entities={shown.confirmed} onOpen={(id) => onReviewEntities({ entityId: id })} />
        )}
        {shown.candidates.length > 0 && (
          <EntityGroup
            id="candidate-entities-label"
            label={shown.confirmed.length > 0 ? "Additional candidates" : "Candidate core entities"}
            note="Read from your content and not confirmed. Review them to say which define the business."
            entities={shown.candidates}
            onOpen={(id) => onReviewEntities({ entityId: id })}
          />
        )}
        {shown.confirmed.length === 0 && shown.candidates.length === 0 && (
          <p className="empty-note">
            {counts.total === 0
              ? pages > 0
                ? `No entities were found on the ${plural(pages, "page")} read. That says what these pages state, not what the business offers.`
                : "No pages were read, so there are no entities to show."
              : "Nothing the site declares, and nothing it is visibly built around, stood out among what was found. The full list is one click away."}
          </p>
        )}

        <div className="doorway-counts">
          {counts.total > 0 && (
            <p>
              <span>{plural(counts.total, "entity", "entities")} found</span>
              <span>{counts.declared} declared</span>
              <span>{counts.inferred} inferred</span>
              {counts.core > 0 && <span>{counts.core} marked core</span>}
              {counts.peripheral > 0 && <span>{counts.peripheral} marked peripheral</span>}
              <button type="button" className="text-button text-button-strong" onClick={() => onReviewEntities({ all: true })}>
                Explore all entities <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            </p>
          )}
          {shown.others > 0 && <p className="quiet">{plural(shown.others, "other mention")} on these pages, including other organizations and products the site names, {shown.others === 1 ? "is" : "are"} in the full list and not shown here.</p>}
        </div>

        {/* Relations only as returned, each with where it comes from. None returned: no connecting claim is drawn. */}
        {counts.total > 0 && (
          relations.length > 0 ? (
            <div className="relations-line">
              <p className="kicker kicker-quiet">{plural(relations.length, "relationship")} returned</p>
              <ul>
                {relations.filter((relation) => names.has(relation.from) && names.has(relation.to)).slice(0, 3).map((relation) => (
                  <li key={`${relation.from}|${relation.kind}|${relation.to}`}>
                    {names.get(relation.from)} {RELATION_WORDS[relation.kind] ?? relation.kind} {names.get(relation.to)}
                    <span className={`provenance provenance-${relation.provenance === "confirmed" ? "human-confirmed" : relation.provenance}`}><i aria-hidden="true" />{relation.provenance}</span>
                  </li>
                ))}
              </ul>
              {relations.length > 3 && <Link className="text-button" to={reportHref(report.id, "fix", "view=model")}>All {relations.length} in the business model</Link>}
            </div>
          ) : (
            <p className="empty-note empty-note-quiet">No relationships between these entities were returned in this scan, so none are shown.</p>
          )
        )}
      </div>

      {afterRecognition}

      {/* 3. What agents can do: the four stages, every applicable action, readiness beside it and second to it. */}
      <div className="doorway-section" aria-labelledby="capabilities-title">
        <div className="section-head">
          <div>
            <h2 id="capabilities-title">What can agents do here?</h2>
            <p className="section-lead">
              {checked ? <>{plural(listed.length, `expected ${kind.noun ? `${kind.noun} ` : ""}action`)} · Evidence from this scan</> : "Capabilities were not checked in this scan."}
            </p>
          </div>
          {checked && listed.length > 0 && (
            <p className="readiness">
              <b>{verified} / {listed.length} verified</b>
              {report.score ? <span>Agent readiness {report.score.value}/100</span> : <span>Agent readiness not scored</span>}
            </p>
          )}
        </div>

        {checked && listed.length > 0 && (
          <div className="stage-map">
            {STAGES.map((stage, index) => {
              const actions = listed.filter((capability) => capability.stage === stage.id);
              return (
                <section key={stage.id} className="stage" aria-labelledby={`stage-${stage.id}`}>
                  <header>
                    <span className="stage-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 id={`stage-${stage.id}`}>{stage.label}</h3>
                      <p>{stage.hint}</p>
                    </div>
                  </header>
                  {actions.length > 0 ? (
                    <ul>
                      {actions.map((capability) => (
                        <li key={capability.actionId}>
                          <StageAction capability={capability} icon={STAGE_ICON[stage.id]} selected={capability.actionId === selectedActionId} onOpen={() => { track(report.id, "capability_opened"); onInspectAction(capability.actionId); }} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="stage-empty">No action expected at this stage.</p>
                  )}
                </section>
              );
            })}
          </div>
        )}
        {checked && listed.length === 0 && <p className="empty-note">No agent capabilities are expected for this kind of site.</p>}
        {report.status === "partial" && onlyFoundationMissing(report.errors) && !report.foundationAudit && <FoundationRetry report={report} />}
        {others.length > 0 && (
          <p className="others-line">
            <Link className="text-button" to={reportHref(report.id, "fix", "view=capabilities&others=1")}>
              {plural(others.length, "other detected action")} <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <span>Seen on the site beyond what this kind of site is expected to offer.</span>
          </p>
        )}
      </div>

      <div className="doorway-foot">
        <p>
          {!checked
            ? "Capabilities were not checked, so nothing is said about what agents can do."
            : verified === 0
              ? "Nothing in this scan is verified as callable by an agent."
              : `${verified} of ${plural(listed.length, "expected action")} ${verified === 1 ? "is" : "are"} verified as callable by an agent.`}
        </p>
        <Link className="text-button text-button-strong" to={reportHref(report.id, "evidence")}>
          Full model &amp; evidence <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
        <Link className="button button-primary" to={reportHref(report.id, "fix", "view=model")}>
          Review the model <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function EntityGroup({ id, label, note, entities, onOpen }: { id: string; label: string; note: string; entities: CoreEntity[]; onOpen: (entityId: string) => void }) {
  return (
    <div className="core-group">
      <p className="kicker" id={id}>{label}</p>
      <p className="core-group-note">{note}</p>
      <ul className="core-entities" aria-labelledby={id}>
        {entities.map((core) => (
          <li key={core.entity.id} className="core-entity">
            <span className="core-entity-icon"><EntityIcon core={core} /></span>
            <div className="core-entity-text">
              <span className="core-entity-name">
                <b>{core.entity.name}</b>
                {core.wikidata && (
                  <a className="wikidata-link" href={core.wikidata.url} target="_blank" rel="noreferrer" aria-label={`${core.entity.name} on Wikidata (${core.wikidata.qid}), opens wikidata.org`}>
                    Wikidata <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                )}
              </span>
              <span className="core-entity-type">
                {typeWords(core.view.type)} · <span className={`provenance provenance-${core.view.provenance}`}><i aria-hidden="true" />{PROVENANCE_LABEL[core.view.provenance].toLowerCase()}</span>
              </span>
              <span className="core-entity-seen">{core.seen}</span>
            </div>
            <button type="button" className="icon-button core-entity-open" aria-label={`Details for ${core.entity.name}`} onClick={() => onOpen(core.entity.id)}>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The foundation audit is a separate service, and sometimes it does not answer in time. The report
 * says so, and offers to ask for that one component again: nothing else is read or called, and the
 * capability map and its readiness stay as they are.
 */
function FoundationRetry({ report }: { report: ReportRecord }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const child = await retryFoundation(report.id);
      navigate(reportHref(child.id, "audit"), { state: { saved: { kind: "model", summary: `The foundation audit answered: ${child.foundationAudit?.score ?? "–"} of 100. Nothing else was read again.` } } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The foundation audit did not answer.");
      setBusy(false);
    }
  }
  return (
    <p className="empty-note empty-note-quiet foundation-retry" role="status">
      No foundation score this time: WordLift's foundation audit did not answer. The rest of this report is complete.{" "}
      <button type="button" className="text-button text-button-strong" onClick={() => void retry()} disabled={busy}>
        {busy ? "Asking the foundation audit again…" : "Retry the foundation audit"}
      </button>
      {error && <span className="form-error" role="alert"> {error}</span>}
    </p>
  );
}

function StageAction({ capability, icon, selected, onOpen }: { capability: CapabilityResult; icon: ReactNode; selected: boolean; onOpen: () => void }) {
  const decided = capability.boundarySource === "human-provided" && capability.boundary ? RESPONSIBILITY_LABEL[capability.boundary] : null;
  return (
    <button type="button" className={`stage-action${selected ? " is-selected" : ""}`} data-action-id={capability.actionId} aria-expanded={selected} aria-controls="inspector" onClick={onOpen}>
      <span className="stage-action-icon">{icon}</span>
      <span className="stage-action-text">
        <span className="stage-action-name">{capability.label}</span>
        <AgentMark status={agentStatus(capability)} />
        {decided && <span className="stage-action-owner">Handled by: {decided}</span>}
      </span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

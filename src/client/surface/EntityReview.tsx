import { AppWindow, ArrowRight, ArrowUpRight, Box, Building2, CalendarDays, FileText, MapPin, Search, Settings, Tag, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { entityDetail, entityProvenance, entityRole, RELATION_PHRASES } from "../../shared/format/businessModel.js";
import { siteKind } from "../../shared/format/modelView.js";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { reportPageUrl } from "../api/client";
import { useReportEngine } from "../engine/EngineContext";
import { track } from "../engine/track";
import { fileReview, reviewFailure } from "./review";
import {
  AGENT_STATUS_LABEL,
  PROVENANCE_LABEL,
  PROVENANCE_LONG,
  agentStatus,
  focusEntities,
  hostOf,
  plural,
  priorityAssertions,
  savedPriority,
  sector,
  seenOn,
  shownPriority,
  sourceLinks,
  stagePriority,
  typeWords,
  wikidataOf,
  type Priority,
  type PriorityDraft,
  type SavedNotice,
} from "./surface";
import { DecisionModal, Segmented } from "./ui";

/**
 * What belongs at the core. A person places entities the report already holds: core, peripheral,
 * or as the report has them. Nothing here renames an entity, changes its type or the sector, or
 * creates a business the scan did not find; the refinement has no such operation and this screen
 * invents none. Peripheral keeps the mention and moves it out of the business's focus. A linked
 * identity is shown as it was returned and opening it reviews nothing.
 */
const PRIORITY_OPTIONS: ReadonlyArray<{ value: Priority; label: string; title: string }> = [
  { value: "core", label: "Core", title: "Central to this business" },
  { value: "keep", label: "Keep", title: "Keep the report's current priority" },
  { value: "peripheral", label: "Peripheral", title: "Mentioned, not central to this business" },
];

function EntityGlyph({ entity }: { entity: DomainEntity }) {
  const role = entityRole(entity);
  const type = entity.types[0] ?? "";
  const props = { size: 24, strokeWidth: 1.4, "aria-hidden": true } as const;
  if (role === "business") return <Building2 {...props} />;
  if (role === "place") return <MapPin {...props} />;
  if (role === "person") return <UserRound {...props} />;
  if (role === "content") return <FileText {...props} />;
  if (type === "SoftwareApplication" || type === "WebApplication") return <AppWindow {...props} />;
  if (type === "Service") return <Settings {...props} />;
  if (type === "Event") return <CalendarDays {...props} />;
  if (type === "Offer") return <Tag {...props} />;
  return <Box {...props} />;
}

const PRIORITY_MEANS: Record<Priority, { title: string; text: string }> = {
  core: { title: "Core means", text: "This defines the business. It leads the model agents read." },
  keep: { title: "Keep means", text: "The report's current priority stays as it is. Nothing is sent for this entity." },
  peripheral: { title: "Peripheral means", text: "Keep this mention without making it central to your business. It stays in the evidence; it is not deleted." },
};

/** One entity's evidence, as the report holds it: where it was read, what it is linked to, what it answers for. */
export function EntityEvidence({ report, entity, priority }: { report: ReportRecord; entity: DomainEntity; priority: Priority }) {
  const detail = entityDetail(entity, report, reportPageUrl(report.id));
  const provenance = entityProvenance(entity);
  const wikidata = wikidataOf(entity);
  const sources = sourceLinks(entity, report);
  const saved = savedPriority(entity);
  return (
    <div className="entity-evidence" aria-label={`Evidence for ${entity.name}`}>
      <p className={`kicker kicker-${provenance}`}>{PROVENANCE_LONG[provenance]}</p>
      <h3>Why {entity.name}?</h3>
      <p className="entity-evidence-why">
        {seenOn(entity, report).replace(/^Seen/, "Found")} and classified as {typeWords(entity.types[0]).toLowerCase()}.
        {saved !== "keep" && ` A review marked it ${saved}.`}
      </p>
      {entity.description && <p className="entity-evidence-note">{entity.description}</p>}

      <section>
        <h4>Linked entity</h4>
        {wikidata ? (
          <>
            <a className="entity-evidence-link" href={wikidata.url} target="_blank" rel="noreferrer" aria-label={`${entity.name} on Wikidata, opens wikidata.org`}>
              {entity.name} on Wikidata <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <code className="qid">{wikidata.qid}</code>
            <p className="entity-evidence-note">The link identifies the entity. You review its role here.</p>
          </>
        ) : (
          <p className="entity-evidence-note">No Wikidata identity was returned for this entity.</p>
        )}
      </section>

      <section>
        <h4>{sources.length === 1 ? "Source" : "Sources"}</h4>
        <ul className="link-list">
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer">{source.label} <ArrowUpRight size={13} aria-hidden="true" /></a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Related actions</h4>
        {detail.answersFor.length > 0 ? (
          <ul className="plain-list">
            {detail.answersFor.slice(0, 6).map((action) => (
              <li key={action.actionId}>{action.label} <span className="quiet">· {AGENT_STATUS_LABEL[agentStatus({ state: action.state as never })].toLowerCase()}</span></li>
            ))}
          </ul>
        ) : (
          <p className="entity-evidence-note">No expected action is linked to this entity.</p>
        )}
      </section>

      <section>
        <h4>Relationships</h4>
        {detail.relations.length > 0 ? (
          <ul className="plain-list">
            {detail.relations.map((relation) => (
              <li key={`${relation.from}|${relation.kind}|${relation.to}`}>
                {relation.fromName} {RELATION_PHRASES[relation.kind]} {relation.toName} <span className="quiet">· {relation.provenance}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="entity-evidence-note">No relationship was returned for this entity.</p>
        )}
      </section>

      <section>
        <h4>{PRIORITY_MEANS[priority].title}</h4>
        <p className="entity-evidence-note">{PRIORITY_MEANS[priority].text}</p>
      </section>
    </div>
  );
}

/**
 * The working list and the evidence beside it. The list opens on the report's focus set; "browse
 * all" opens every entity the report holds, and the number on that link is the number of rows it opens.
 */
export function EntityReviewBoard({
  report,
  draft,
  onDraft,
  disabled = false,
  initialEntityId = null,
  initialAll = false,
}: {
  report: ReportRecord;
  draft: PriorityDraft;
  onDraft: (next: PriorityDraft) => void;
  disabled?: boolean;
  initialEntityId?: string | null;
  initialAll?: boolean;
}) {
  const everything = useMemo(() => report.contextGraph?.entities ?? [], [report]);
  const focus = useMemo(() => focusEntities(report), [report]);
  const startsOutside = Boolean(initialEntityId) && !focus.some((entity) => entity.id === initialEntityId);
  const [all, setAll] = useState(initialAll || startsOutside || focus.length === 0);
  const [query, setQuery] = useState("");
  const pool = all ? everything : focus;
  const wanted = query.trim().toLowerCase();
  const rows = wanted ? pool.filter((entity) => entity.name.toLowerCase().includes(wanted) || entity.types.some((type) => typeWords(type).toLowerCase().includes(wanted))) : pool;
  const [selectedId, setSelectedId] = useState<string | null>(() => (initialEntityId && everything.some((entity) => entity.id === initialEntityId) ? initialEntityId : null));
  const selected = everything.find((entity) => entity.id === selectedId) ?? rows[0] ?? null;

  if (everything.length === 0) {
    return <p className="empty-note">This report holds no entities, so there is nothing to place. Run the audit again to read the site.</p>;
  }

  return (
    <div className="entity-board">
      <div className="entity-board-list">
        <div className="entity-board-bar">
          <p role="status">{plural(rows.length, "entity", "entities")} in this view</p>
          <label className="search-field">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search entities</span>
            <input type="search" placeholder="Search entities" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="entity-table" role="table" aria-label="Entities and their priority">
          <div className="entity-table-head" role="row">
            <span role="columnheader">Entity</span>
            <span role="columnheader">Priority</span>
          </div>
          {rows.map((entity) => {
            const wikidata = wikidataOf(entity);
            const shown = shownPriority(draft, entity);
            const staged = draft[entity.id] !== undefined;
            return (
              <div key={entity.id} role="row" className={`entity-row${selected?.id === entity.id ? " is-selected" : ""}${staged ? " is-staged" : ""}`} data-entity-id={entity.id}>
                <div role="cell" className="entity-row-main">
                  <span className="entity-row-icon"><EntityGlyph entity={entity} /></span>
                  <span className="entity-row-text">
                    <span className="entity-row-name">
                      <button type="button" className="entity-row-select" aria-pressed={selected?.id === entity.id} onClick={() => setSelectedId(entity.id)}>
                        {entity.name}
                      </button>
                      {wikidata && (
                        <a className="wikidata-link" href={wikidata.url} target="_blank" rel="noreferrer" aria-label={`${entity.name} on Wikidata (${wikidata.qid}), opens wikidata.org`}>
                          Wikidata <ArrowUpRight size={12} aria-hidden="true" />
                        </a>
                      )}
                    </span>
                    <span className="entity-row-meta">
                      {typeWords(entity.types[0])} · {PROVENANCE_LABEL[entityProvenance(entity)]} · {seenOn(entity, report).replace(/^Seen on (the )?/, "").replace(/^\w/, (letter) => letter.toUpperCase())}
                      {staged && <span className="staged-tag"> · changed</span>}
                    </span>
                  </span>
                </div>
                <div role="cell">
                  <Segmented
                    label={`Priority for ${entity.name}`}
                    name={`priority-${entity.id}`}
                    value={shown}
                    options={PRIORITY_OPTIONS}
                    disabled={disabled}
                    onChange={(choice) => {
                      setSelectedId(entity.id);
                      onDraft(stagePriority(draft, entity, choice));
                    }}
                  />
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p className="empty-note">No entity matches “{query}” in this view.</p>}
        </div>
        {everything.length > focus.length && (
          <button type="button" className="text-button text-button-strong" onClick={() => { setAll((current) => !current); setQuery(""); }}>
            {all ? `Show the ${plural(focus.length, "focus entity", "focus entities")}` : `Browse all ${plural(everything.length, "entity", "entities")}`} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="entity-board-detail">
        {selected ? <EntityEvidence report={report} entity={selected} priority={shownPriority(draft, selected)} /> : <p className="empty-note">Select an entity to see where it was read.</p>}
      </div>
    </div>
  );
}

/** "2 marked core, 1 marked peripheral": what a save sent, said back on the reviewed version. */
export function prioritySummary(draft: PriorityDraft): string {
  const core = Object.values(draft).filter((value) => value === "core").length;
  const peripheral = Object.values(draft).filter((value) => value === "peripheral").length;
  return [core > 0 ? `${plural(core, "entity", "entities")} marked core` : null, peripheral > 0 ? `${plural(peripheral, "entity", "entities")} marked peripheral` : null].filter(Boolean).join(", ") + ".";
}

export function EntityReviewModal({
  report,
  initialEntityId = null,
  initialAll = false,
  onClose,
  onSaved,
}: {
  report: ReportRecord;
  initialEntityId?: string | null;
  initialAll?: boolean;
  onClose: () => void;
  onSaved: (child: ReportRecord, notice: SavedNotice) => void;
}) {
  const { key: engineKey } = useReportEngine();
  // The review opens on what the report holds: nothing is staged until the person changes something.
  const [draft, setDraft] = useState<PriorityDraft>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staged = Object.keys(draft).length;
  const pages = report.contextGraph?.pages.length ?? 0;

  async function save() {
    if (saving || staged === 0) return;
    setSaving(true);
    setError(null);
    try {
      const { child } = await fileReview(report, priorityAssertions(draft, report), engineKey);
      track(report.id, "model_corrected");
      onSaved(child, { kind: "entities", summary: prioritySummary(draft) });
    } catch (caught) {
      // The draft stays exactly as it was: a failed save costs a click, never the work.
      setError(reviewFailure(caught, "Your review could not be saved."));
      setSaving(false);
    }
  }

  return (
    <DecisionModal
      open
      wide
      onClose={onClose}
      kicker="Review your business"
      title="What belongs at the core?"
      lead={
        <>
          <p>Choose the entities that should define this business.</p>
          <p className="modal-context">
            <span>{hostOf(report)}</span>
            <span>{sector(siteKind(report)).label}</span>
            <span>{plural(pages, "page")}</span>
          </p>
        </>
      }
      dirty={staged > 0}
      busy={saving}
      footer={
        <>
          <div className="modal-foot-status" role="status">
            <p className={staged > 0 ? "staged-count is-staged" : "staged-count"}>
              <i aria-hidden="true" />
              {staged > 0 ? `${plural(staged, "change")} staged` : "No changes yet"}
            </p>
            <p className="modal-foot-note">Saving creates a reviewed version. Agent readiness stays unchanged.</p>
            {error && <p className="form-error" role="alert">{error} Your changes are still here.</p>}
          </div>
          <button type="button" className="button button-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="button button-primary" onClick={() => void save()} disabled={saving || staged === 0}>
            {saving ? "Saving…" : error ? "Retry" : "Save review"} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </>
      }
    >
      <EntityReviewBoard report={report} draft={draft} onDraft={setDraft} disabled={saving} initialEntityId={initialEntityId} initialAll={initialAll} />
    </DecisionModal>
  );
}

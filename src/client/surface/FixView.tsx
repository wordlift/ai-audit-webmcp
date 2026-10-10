import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { siteKind } from "../../shared/format/modelView.js";
import type { CapabilityResult, EntityRelation, HumanAssertion, LexicalEntry, ReportRecord } from "../../shared/types/index.js";
import { AgentDoors } from "../components/AgentDoors";
import { OwnershipPanel } from "../components/OwnershipPanel";
import { holds, useReportEngine } from "../engine/EngineContext";
import { track } from "../engine/track";
import { EntityReviewBoard, prioritySummary } from "./EntityReview";
import type { FixTab } from "./nav";
import { fileReview, reviewFailure } from "./review";
import {
  DETECTION_LABEL,
  FILTER_LABEL,
  RESPONSIBILITY_LABEL,
  STAGES,
  agentStatus,
  detection,
  hostOf,
  isFilter,
  listedCapabilities,
  matchesFilter,
  otherDetected,
  peopleStatus,
  plural,
  priorityAssertions,
  sector,
  verifiedCount,
  type CapabilityFilter,
  type PriorityDraft,
  type SavedNotice,
} from "./surface";
import { AgentMark, PeopleMark, Segmented } from "./ui";

/**
 * Fix: what needs a person's judgment, and what needs technical work, kept apart. Three views over
 * the same report. Capabilities is the working table: one row per action, what was seen for people
 * and what was verified for agents in separate columns, and a row opens the inspector. Business
 * model and Vocabulary are the same reviews the refinement always took, each sending only what the
 * person staged. None of it moves readiness.
 */
const TABS: ReadonlyArray<{ id: FixTab; label: string }> = [
  { id: "model", label: "Business model" },
  { id: "capabilities", label: "Capabilities" },
  { id: "vocabulary", label: "Vocabulary" },
];

export function FixView({
  report,
  tab,
  filter,
  showOthers,
  selectedActionId,
  onSelect,
  onInspectDetection,
  onSaved,
}: {
  report: ReportRecord;
  tab: FixTab;
  filter: CapabilityFilter;
  showOthers: boolean;
  selectedActionId: string | null;
  onSelect: (changes: Record<string, string | null>) => void;
  onInspectDetection: () => void;
  onSaved: (child: ReportRecord, notice: SavedNotice) => void;
}) {
  const host = hostOf(report);
  const kind = sector(siteKind(report));
  const found = detection(report);
  const listed = listedCapabilities(report);

  return (
    <section className="fix" id="step-fix" aria-labelledby="fix-title">
      <header className="fix-head">
        <p className="kicker">
          <span>{host}</span>
          {report.classification && <span>{kind.label}</span>}
          <button type="button" className={`detection-chip detection-chip-${found.state}`} onClick={onInspectDetection}>
            {found.state === "detected" && <Check size={13} strokeWidth={3} aria-hidden="true" />}
            {DETECTION_LABEL[found.state]}
          </button>
        </p>
        <h1 id="fix-title">Make your business actionable.</h1>
        <p className="fix-lead">Review the model. Define who handles each action.</p>
      </header>

      <div className="tabs" role="tablist" aria-label="Fix views">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`fix-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            aria-controls="fix-panel"
            tabIndex={tab === entry.id ? 0 : -1}
            className={tab === entry.id ? "is-current" : undefined}
            onClick={() => onSelect({ view: entry.id })}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              const index = TABS.findIndex((candidate) => candidate.id === tab);
              const next = TABS[(index + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]!;
              onSelect({ view: next.id });
              window.setTimeout(() => document.getElementById(`fix-tab-${next.id}`)?.focus(), 0);
            }}
          >
            {entry.label}
            {entry.id === "capabilities" && report.capabilities && <span className="tab-count">{listed.length}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="fix-panel" aria-labelledby={`fix-tab-${tab}`}>
        {tab === "capabilities" && (
          <CapabilityTable report={report} filter={filter} showOthers={showOthers} selectedActionId={selectedActionId} onSelect={onSelect} sectorNoun={kind.noun} />
        )}
        {tab === "model" && <BusinessModelPanel key={`model-${report.id}`} report={report} onSaved={onSaved} />}
        {tab === "vocabulary" && <VocabularyPanel key={`vocabulary-${report.id}`} report={report} onSaved={onSaved} />}
      </div>

      <footer className="fix-foot">
        <p>Review decisions create a new report version.</p>
        <Link className="text-button text-button-strong text-button-large" to={`/reports/${report.id}/activate`}>
          Continue to Activate <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </footer>
    </section>
  );
}

// ---------- Capabilities ----------

function CapabilityRow({ capability, selected, onOpen }: { capability: CapabilityResult; selected: boolean; onOpen: () => void }) {
  const decided = capability.boundarySource === "human-provided" && capability.boundary ? RESPONSIBILITY_LABEL[capability.boundary] : null;
  return (
    <tr className={selected ? "is-selected" : undefined} data-action-id={capability.actionId} aria-selected={selected}>
      <th scope="row">
        <button type="button" className="row-open" aria-pressed={selected} onClick={onOpen}>
          {capability.label}
        </button>
        {decided && <span className="row-owner">Handled by: {decided}{capability.boundaryPartner ? ` (${capability.boundaryPartner.name})` : ""}</span>}
      </th>
      <td><PeopleMark status={peopleStatus(capability)} /></td>
      <td><AgentMark status={agentStatus(capability)} /></td>
      <td className="row-arrow" aria-hidden="true"><ArrowUpRight size={17} /></td>
    </tr>
  );
}

function CapabilityTable({
  report,
  filter,
  showOthers,
  selectedActionId,
  onSelect,
  sectorNoun,
}: {
  report: ReportRecord;
  filter: CapabilityFilter;
  showOthers: boolean;
  selectedActionId: string | null;
  onSelect: (changes: Record<string, string | null>) => void;
  sectorNoun: string;
}) {
  const listed = listedCapabilities(report);
  const others = otherDetected(report);
  const rows = listed.filter((capability) => matchesFilter(capability, filter));
  const open = (capability: CapabilityResult) => {
    track(report.id, "capability_opened");
    onSelect({ action: capability.actionId, inspect: null });
  };

  // Unknown stays unknown: a report without capabilities was not checked, and says so instead of a table of failures.
  if (!report.capabilities) {
    return <p className="empty-note">Not checked: this scan returned no capability map, so nothing is said about what agents can do.</p>;
  }

  return (
    <div className="capabilities">
      <div className="capabilities-bar">
        <p>{plural(listed.length, `expected ${sectorNoun ? `${sectorNoun} ` : ""}action`)}</p>
        <p className="capabilities-verified">{verifiedCount(listed)} verified for agents</p>
        <label className="select-field">
          <span className="sr-only">Show</span>
          <select value={filter} onChange={(event) => onSelect({ filter: event.target.value === "all" ? null : event.target.value })}>
            {(Object.keys(FILTER_LABEL) as CapabilityFilter[]).map((value) => (
              <option key={value} value={value}>{FILTER_LABEL[value]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="capability-table">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">For people</th>
              <th scope="col">For agents</th>
              <th scope="col"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          {STAGES.map((stage) => {
            const inStage = rows.filter((capability) => capability.stage === stage.id);
            if (inStage.length === 0) return null;
            return (
              <tbody key={stage.id}>
                <tr className="stage-row">
                  <th scope="rowgroup" colSpan={4}>{stage.label}</th>
                </tr>
                {inStage.map((capability) => (
                  <CapabilityRow key={capability.actionId} capability={capability} selected={capability.actionId === selectedActionId} onOpen={() => open(capability)} />
                ))}
              </tbody>
            );
          })}
          {showOthers && others.length > 0 && (
            <tbody>
              <tr className="stage-row">
                <th scope="rowgroup" colSpan={4}>Other detected actions</th>
              </tr>
              {others.map((capability) => (
                <CapabilityRow key={capability.actionId} capability={capability} selected={capability.actionId === selectedActionId} onOpen={() => open(capability)} />
              ))}
            </tbody>
          )}
        </table>
        {rows.length === 0 && (
          <p className="empty-note">
            {listed.length === 0 ? "No agent capabilities are expected for this kind of site." : `No action matches “${FILTER_LABEL[filter]}”.`}{" "}
            {listed.length > 0 && <button type="button" className="text-button" onClick={() => onSelect({ filter: null })}>Show all actions</button>}
          </p>
        )}
      </div>

      <div className="capabilities-foot">
        <p>Observed on the pages checked. Agent status requires execution evidence. “Not found” is scoped to this scan.</p>
        {others.length > 0 && (
          <button type="button" className="text-button text-button-strong" aria-expanded={showOthers} onClick={() => onSelect({ others: showOthers ? null : "1" })}>
            {showOthers ? "Hide other detected actions" : plural(others.length, "other detected action")} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

export function parseFilter(value: string | null): CapabilityFilter {
  return isFilter(value) ? value : "all";
}

// ---------- Business model ----------

const relationKey = (relation: Pick<EntityRelation, "from" | "kind" | "to">) => `${relation.from}|${relation.kind}|${relation.to}`;
const RELATION_WORDS: Record<EntityRelation["kind"], string> = { offers: "offers", "located-in": "is in", "provided-by": "is provided by", "part-of": "is part of", serves: "serves", brand: "carries the brand" };

function BusinessModelPanel({ report, onSaved }: { report: ReportRecord; onSaved: (child: ReportRecord, notice: SavedNotice) => void }) {
  const { engine, key: engineKey } = useReportEngine();
  const savedRole = report.classification?.businessRole ?? "";
  const [role, setRole] = useState(savedRole);
  const [priorities, setPriorities] = useState<PriorityDraft>({});
  const [relationDraft, setRelationDraft] = useState<Record<string, "confirm" | "reject">>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entities = report.contextGraph?.entities ?? [];
  const names = useMemo(() => new Map(entities.map((entity) => [entity.id, entity.name])), [entities]);
  const relations = (report.contextGraph?.relations ?? []).filter((relation) => names.has(relation.from) && names.has(relation.to));
  const roleValue = role.trim();
  const roleChanged = roleValue !== savedRole.trim() && roleValue.length >= 2;
  const roleInvalid = roleValue.length === 1;
  const staged = Object.keys(priorities).length + Object.keys(relationDraft).length + (roleChanged ? 1 : 0);

  async function save() {
    if (saving || staged === 0 || roleInvalid) return;
    setSaving(true);
    setError(null);
    const relationDecisions = relations.filter((relation) => relationDraft[relationKey(relation)]).map((relation) => ({ from: relation.from, kind: relation.kind, to: relation.to, decision: relationDraft[relationKey(relation)]! }));
    const assertions: HumanAssertion = {
      ...(roleChanged ? { businessRole: roleValue.slice(0, 120) } : {}),
      ...priorityAssertions(priorities, report),
      ...(relationDecisions.length > 0 ? { relationDecisions } : {}),
    };
    try {
      const { child } = await fileReview(report, assertions, engineKey);
      track(report.id, "model_corrected");
      const parts = [
        Object.keys(priorities).length > 0 ? prioritySummary(priorities).replace(/\.$/, "") : null,
        relationDecisions.length > 0 ? `${plural(relationDecisions.length, "relationship")} reviewed` : null,
        roleChanged ? `operating role set to “${roleValue}”` : null,
      ].filter(Boolean);
      onSaved(child, { kind: "model", summary: `${parts.join(", ")}.` });
    } catch (caught) {
      setError(reviewFailure(caught, "Your review could not be saved."));
      setSaving(false);
    }
  }

  return (
    <div className="model-panel">
      <section className="panel-section" aria-labelledby="role-title">
        <h2 id="role-title">How the business operates</h2>
        <p className="section-lead">
          The sector is read from the site and is not edited here. The operating role is yours to say: what the business is to its customers, in a few words.
        </p>
        <label className="text-field">
          Operating role
          <input type="text" value={role} maxLength={120} placeholder="for example: destination organization, marketplace, software vendor" disabled={saving} aria-invalid={roleInvalid} onChange={(event) => setRole(event.target.value)} />
        </label>
        {roleInvalid && <p className="form-hint" role="status">Use at least two characters, or leave it as it was.</p>}
      </section>

      <section className="panel-section" aria-labelledby="core-title">
        <h2 id="core-title">What belongs at the core?</h2>
        <p className="section-lead">Choose the entities that should define this business. Types and names are shown as returned; they are not edited here.</p>
        <EntityReviewBoard report={report} draft={priorities} onDraft={setPriorities} disabled={saving} />
      </section>

      <section className="panel-section" aria-labelledby="relations-title">
        <h2 id="relations-title">How they relate</h2>
        {relations.length > 0 ? (
          <>
            <p className="section-lead">Only the relationships this report returned. Confirm one the text suggested, or reject one that is wrong.</p>
            <ul className="relation-list">
              {relations.map((relation) => {
                const key = relationKey(relation);
                const staged = relationDraft[key];
                const options = [
                  // Declared and confirmed relations are already settled; only a suggestion can be confirmed.
                  ...(relation.provenance === "inferred" ? [{ value: "confirm" as const, label: "Confirm" }] : []),
                  { value: "keep" as const, label: "Keep" },
                  { value: "reject" as const, label: "Reject" },
                ];
                return (
                  <li key={key} className={staged ? "is-staged" : undefined}>
                    <span className="relation-text">
                      <b>{names.get(relation.from)}</b> {RELATION_WORDS[relation.kind]} <b>{names.get(relation.to)}</b>
                      <span className={`provenance provenance-${relation.provenance === "confirmed" ? "human-confirmed" : relation.provenance}`}><i aria-hidden="true" />{relation.provenance}</span>
                      {relation.evidence && <q>{relation.evidence}</q>}
                    </span>
                    <Segmented
                      label={`${names.get(relation.from)} ${RELATION_WORDS[relation.kind]} ${names.get(relation.to)}`}
                      name={`relation-${key}`}
                      value={staged ?? "keep"}
                      options={options}
                      disabled={saving}
                      onChange={(choice) =>
                        setRelationDraft((current) => {
                          const next = { ...current };
                          if (choice === "keep") delete next[key];
                          else next[key] = choice;
                          return next;
                        })
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="empty-note">No relationships were returned in this scan, so there is nothing to confirm or reject. None are invented here.</p>
        )}
      </section>

      <SaveBar staged={staged} saving={saving} error={error} onSave={() => void save()} onDiscard={() => { setPriorities({}); setRelationDraft({}); setRole(savedRole); setError(null); }} disabled={roleInvalid} />

      <section className="panel-section panel-section-quiet">
        <AgentDoors reportId={report.id} host={holds(engine) ? engine!.host : null} engineKey={engineKey} />
        <OwnershipPanel report={report} />
      </section>
    </div>
  );
}

function SaveBar({ staged, saving, error, onSave, onDiscard, disabled = false }: { staged: number; saving: boolean; error: string | null; onSave: () => void; onDiscard: () => void; disabled?: boolean }) {
  return (
    <div className={`save-bar${staged > 0 ? " is-staged" : ""}`}>
      <div role="status">
        <p className={staged > 0 ? "staged-count is-staged" : "staged-count"}>
          <i aria-hidden="true" />
          {staged > 0 ? `${plural(staged, "change")} staged` : "No changes yet"}
        </p>
        <p className="modal-foot-note">Saving creates a reviewed version. Agent readiness stays unchanged.</p>
        {error && <p className="form-error" role="alert">{error} Your changes are still here.</p>}
      </div>
      {staged > 0 && <button type="button" className="button button-outline" onClick={onDiscard} disabled={saving}>Discard</button>}
      <button type="button" className="button button-primary" onClick={onSave} disabled={saving || staged === 0 || disabled}>
        {saving ? "Saving…" : error ? "Retry" : "Save review"} <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------- Vocabulary ----------

type TermChoice = "keep" | "confirm" | "replace" | "reject";
const TERM_OPTIONS: ReadonlyArray<{ value: TermChoice; label: string; title: string }> = [
  { value: "confirm", label: "Confirm", title: "This is a word the business uses" },
  { value: "keep", label: "Keep", title: "Leave it as the report has it" },
  { value: "replace", label: "Replace", title: "Say what it means for this business" },
  { value: "reject", label: "Reject", title: "Not a word of this business" },
];
const TERMS_SHOWN = 12;
const TERM_KIND: Record<LexicalEntry["kind"], string> = { category: "Category", "entity-name": "Name", topic: "Topic" };

function VocabularyPanel({ report, onSaved }: { report: ReportRecord; onSaved: (child: ReportRecord, notice: SavedNotice) => void }) {
  const { key: engineKey } = useReportEngine();
  const terms = report.contextGraph?.lexicalEntries ?? [];
  const [choices, setChoices] = useState<Record<string, TermChoice>>({});
  const [meanings, setMeanings] = useState<Record<string, string>>({});
  const [all, setAll] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wanted = query.trim().toLowerCase();
  const matching = wanted ? terms.filter((term) => term.label.toLowerCase().includes(wanted)) : terms;
  const rows = all || wanted ? matching : matching.slice(0, TERMS_SHOWN);
  const staged = Object.keys(choices);
  // A replacement without a meaning is not a decision the contract accepts.
  const incomplete = staged.filter((label) => choices[label] === "replace" && !(meanings[label] ?? "").trim());

  function choose(term: LexicalEntry, choice: TermChoice) {
    setError(null);
    setChoices((current) => {
      const next = { ...current };
      if (choice === "keep") delete next[term.label];
      else next[term.label] = choice;
      return next;
    });
  }

  async function save() {
    if (saving || staged.length === 0 || incomplete.length > 0) return;
    setSaving(true);
    setError(null);
    const terminologyDecisions = staged.map((label) => {
      const decision = choices[label] as Exclude<TermChoice, "keep">;
      return { term: label, decision, ...(decision === "replace" ? { meaning: meanings[label]!.trim().slice(0, 300) } : {}) };
    });
    try {
      const { child } = await fileReview(report, { terminologyDecisions }, engineKey);
      onSaved(child, { kind: "vocabulary", summary: `${plural(terminologyDecisions.length, "term")} reviewed.` });
    } catch (caught) {
      setError(reviewFailure(caught, "Your review could not be saved."));
      setSaving(false);
    }
  }

  if (terms.length === 0) {
    return <p className="empty-note">No vocabulary was returned in this scan, so there are no terms to review.</p>;
  }

  return (
    <div className="vocabulary-panel">
      <section className="panel-section" aria-labelledby="vocabulary-title">
        <div className="section-head">
          <div>
            <h2 id="vocabulary-title">The words this business uses</h2>
            <p className="section-lead">Read from the site's pages. Confirm a word that is yours, say what it means for you, or reject one that is not.</p>
          </div>
          <label className="search-field">
            <span className="sr-only">Search terms</span>
            <input type="search" placeholder="Search terms" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <ul className="term-list">
          {rows.map((term) => {
            const choice = choices[term.label] ?? "keep";
            const human = term.provenance === "human-provided";
            return (
              <li key={term.id} className={choice !== "keep" ? "is-staged" : undefined}>
                <div className="term-text">
                  <b>{term.label}</b>
                  <span className="quiet">
                    {TERM_KIND[term.kind]} · {human ? "Confirmed in a review" : "Read from the site"}
                  </span>
                  {term.meaning && <span className="term-meaning">Means: {term.meaning}</span>}
                </div>
                <Segmented label={`Decision for ${term.label}`} name={`term-${term.id}`} value={choice} options={TERM_OPTIONS} disabled={saving} onChange={(next) => choose(term, next)} />
                {choice === "replace" && (
                  <label className="text-field term-meaning-field">
                    What “{term.label}” means for this business
                    <input type="text" value={meanings[term.label] ?? ""} maxLength={300} required aria-invalid={!(meanings[term.label] ?? "").trim()} disabled={saving} onChange={(event) => setMeanings((current) => ({ ...current, [term.label]: event.target.value }))} />
                  </label>
                )}
              </li>
            );
          })}
        </ul>
        {rows.length === 0 && <p className="empty-note">No term matches “{query}”.</p>}
        {!wanted && terms.length > TERMS_SHOWN && (
          <button type="button" className="text-button text-button-strong" aria-expanded={all} onClick={() => setAll((current) => !current)}>
            {all ? `Show the first ${TERMS_SHOWN}` : `Browse all ${plural(terms.length, "term")}`} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        )}
        {incomplete.length > 0 && <p className="form-hint" role="status">A replacement needs a meaning: {incomplete.join(", ")}.</p>}
      </section>
      <SaveBar staged={staged.length} saving={saving} error={error} onSave={() => void save()} onDiscard={() => { setChoices({}); setMeanings({}); setError(null); }} disabled={incomplete.length > 0} />
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { DomainEntity, ActionBoundary, CapabilityResult, HumanAssertion, ReportRecord } from "../../shared/types/index.js";
import { entityRole } from "../../shared/format/businessModel.js";
import { refineReport } from "../api/client";
import { actionsThatMatter } from "./FirstScreen";

/**
 * "Own it", lightly: one question per action of the three, answered in a minute. The answers go
 * through the same refinement as the full interview an agent runs in ChatGPT or Claude, as
 * `actionDecisions` alone, and land in an immutable child report. Nothing here moves readiness:
 * a decision says who is responsible; only an interface that answers says it works.
 */
export type OwnAnswer = ActionBoundary;

/** The plain words for who runs an action. The precise boundary stays in the full audit and in every file an agent reads. */
export const OWN_WORDS: Record<ActionBoundary, string> = {
  owned: "Ours",
  "partner-handoff": "A partner runs it",
  "informational-only": "Described only",
  "not-applicable": "Not relevant",
};

const OPTIONS: ReadonlyArray<{ value: OwnAnswer; label: string; means: string }> = [
  { value: "owned", label: "We do", means: "Published as your action, with its entry point once one answers." },
  { value: "partner-handoff", label: "A partner does", means: "Published with the partner named as the provider." },
  { value: "informational-only", label: "We only describe it", means: "Published as information: the entity, no action." },
  { value: "not-applicable", label: "Not relevant", means: "Nothing is published for it, and agents are told not to try." },
];

export interface OwnAnswers {
  [actionId: string]: { boundary?: OwnAnswer; partnerName: string; partnerUrl: string };
}

/** The actions a person already answered for, on this report. */
export function answeredAlready(capabilities: CapabilityResult[]): CapabilityResult[] {
  return capabilities.filter((capability) => capability.boundarySource === "human-provided" && Boolean(capability.boundary));
}

/** A partner's site the way a person types it, made into a URL; the server still validates it. */
function asUrl(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

/** The decisions the answers amount to: confirm with a boundary, and the partner when one was named. Unanswered actions are left alone. */
export function decisionsFrom(answers: OwnAnswers): NonNullable<HumanAssertion["actionDecisions"]> {
  return Object.entries(answers).flatMap(([actionId, answer]) => {
    if (!answer.boundary) return [];
    const name = answer.partnerName.trim();
    const url = answer.partnerUrl.trim();
    const partner = answer.boundary === "partner-handoff" && name ? { name, ...(url ? { url: asUrl(url) } : {}) } : null;
    return [{ actionId, decision: "confirm" as const, boundary: answer.boundary, ...(partner ? { partner } : {}) }];
  });
}

function initialAnswers(capabilities: CapabilityResult[]): OwnAnswers {
  return Object.fromEntries(
    capabilities.map((capability) => [
      capability.actionId,
      {
        ...(capability.boundarySource === "human-provided" && capability.boundary ? { boundary: capability.boundary } : {}),
        partnerName: capability.boundaryPartner?.name ?? "",
        partnerUrl: capability.boundaryPartner?.url ?? "",
      },
    ]),
  );
}

/** The things WordLift read that a person can own or disown: the business, what it offers, where. Never a page, never a person. */
export function entityChoices(report: ReportRecord, limit = 8): DomainEntity[] {
  const order: Record<string, number> = { business: 0, offering: 1, place: 2 };
  return (report.contextGraph?.entities ?? [])
    .filter((entity) => entity.humanPriority !== "demoted" && entityRole(entity) in order)
    .sort((left, right) => order[entityRole(left)]! - order[entityRole(right)]! || Number(left.origin === "inferred") - Number(right.origin === "inferred") || right.confidence - left.confidence)
    .slice(0, limit);
}

type EntityAnswer = "primary" | "demoted" | "";
const ENTITY_OPTIONS: ReadonlyArray<{ value: EntityAnswer; label: string }> = [
  { value: "primary", label: "Matters" },
  { value: "demoted", label: "Not ours" },
  { value: "", label: "As read" },
];

/** The type in a person's words: "Lodging business", "Apartment", "Place". */
function typeWord(type: string | undefined): string {
  if (!type) return "Thing";
  return type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (first) => first.toUpperCase());
}

export function OwnIt({ report }: { report: ReportRecord }) {
  const navigate = useNavigate();
  const three = actionsThatMatter(report.capabilities ?? []);
  const said = answeredAlready(three);
  const choices = entityChoices(report, 5);
  const owned = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority);
  const [editing, setEditing] = useState(said.length === 0 && owned.length === 0);
  const [answers, setAnswers] = useState<OwnAnswers>(() => initialAnswers(three));
  const [entityAnswers, setEntityAnswers] = useState<Record<string, EntityAnswer>>(() => Object.fromEntries(choices.map((entity) => [entity.id, entity.humanPriority === "primary" ? "primary" : ""])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (three.length === 0) return null;

  const decisions = decisionsFrom(answers);
  // Only what changed: an entity the report already lists as primary is not said again.
  const primaryEntityIds = choices.filter((entity) => entityAnswers[entity.id] === "primary" && entity.humanPriority !== "primary").map((entity) => entity.id);
  const demotedEntityIds = choices.filter((entity) => entityAnswers[entity.id] === "demoted").map((entity) => entity.id);
  const anything = decisions.length > 0 || primaryEntityIds.length > 0 || demotedEntityIds.length > 0;

  const answer = (actionId: string, patch: Partial<OwnAnswers[string]>) =>
    setAnswers((current) => ({ ...current, [actionId]: { ...current[actionId]!, ...patch } }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!anything) return;
    setSaving(true);
    setError(null);
    try {
      // The same call the interview ends with; here it carries the decisions made on this page alone.
      const child = await refineReport(report.id, {
        ...(decisions.length > 0 ? { actionDecisions: decisions } : {}),
        ...(primaryEntityIds.length > 0 ? { primaryEntityIds } : {}),
        ...(demotedEntityIds.length > 0 ? { demotedEntityIds } : {}),
      });
      navigate(`/reports/${child.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your answers could not be saved.");
      setSaving(false);
    }
  }

  return (
    <section className="own-it" id="own-it" aria-labelledby="own-it-title">
      <h2 id="own-it-title">Who actually performs these actions?</h2>
      <p className="own-it-lead">
        These answers determine what your site tells AI agents they can do. They do not change the readiness score; only working
        interfaces do.
      </p>

      {!editing ? (
        <>
          <ul className="own-it-answers" aria-label="What you said">
            {three.map((capability) => {
              const human = capability.boundarySource === "human-provided" && capability.boundary ? capability.boundary : null;
              return (
                <li key={capability.actionId}>
                  <span className="own-it-action">{capability.label}</span>
                  <span className="own-it-word">
                    {human ? OWN_WORDS[human] : "Not answered"}
                    {human === "partner-handoff" && capability.boundaryPartner ? `: ${capability.boundaryPartner.name}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {owned.length > 0 && (
            <p className="own-it-owned" aria-label="What you said about the things we found">
              {owned.some((entity) => entity.humanPriority === "primary") && <span><small>Matters</small> {owned.filter((entity) => entity.humanPriority === "primary").map((entity) => entity.name).join(", ")}</span>}
              {owned.some((entity) => entity.humanPriority === "demoted") && <span><small>Not yours</small> {owned.filter((entity) => entity.humanPriority === "demoted").map((entity) => entity.name).join(", ")}</span>}
            </p>
          )}
          <button type="button" className="own-it-change" onClick={() => setEditing(true)}>Change my answers</button>
        </>
      ) : (
        <form className="own-it-form" onSubmit={(event) => void save(event)}>
          {three.map((capability) => {
            const current = answers[capability.actionId]!;
            return (
              <fieldset key={capability.actionId} className="own-it-question">
                <legend>{capability.label}</legend>
                <div className="own-it-options">
                  {OPTIONS.map((option) => {
                    const id = `own-${capability.actionId}-${option.value}`;
                    return (
                      <div key={option.value} className={`own-it-option${current.boundary === option.value ? " is-chosen" : ""}`}>
                        <label htmlFor={id}>
                          <input
                            id={id}
                            type="radio"
                            name={`own-${capability.actionId}`}
                            value={option.value}
                            checked={current.boundary === option.value}
                            onChange={() => answer(capability.actionId, { boundary: option.value })}
                          />
                          {option.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
                {current.boundary && (
                  <p className="own-it-means">{OPTIONS.find((option) => option.value === current.boundary)?.means}</p>
                )}
                {current.boundary === "partner-handoff" && (
                  <div className="own-it-partner">
                    <label>
                      Partner name
                      <input type="text" value={current.partnerName} maxLength={120} onChange={(event) => answer(capability.actionId, { partnerName: event.target.value })} />
                    </label>
                    <label>
                      Partner website (optional)
                      <input type="text" value={current.partnerUrl} maxLength={2_048} onChange={(event) => answer(capability.actionId, { partnerUrl: event.target.value })} />
                    </label>
                  </div>
                )}
              </fieldset>
            );
          })}
          {choices.length > 0 && (
            <details className="own-it-more">
            <summary>Also tell us what matters <span className="entity-count">{choices.length}</span></summary>
            <fieldset className="own-it-question own-it-entities">
              <legend>What we found. Is it yours?</legend>
              <p className="own-it-means">Mark what matters most, and what is not yours. What you leave stays as read; the rest of what we found is in the full audit. Nothing here moves readiness.</p>
              <ul className="own-it-entity-list">
                {choices.map((entity) => (
                  <li key={entity.id}>
                    <span className="own-it-entity">
                      <b>{entity.name}</b>
                      <small>{typeWord(entity.types[0])}{entity.origin === "inferred" ? " · read from the text" : ""}</small>
                    </span>
                    <span className="own-it-options" role="radiogroup" aria-label={`Is ${entity.name} yours?`}>
                      {ENTITY_OPTIONS.map((option) => {
                        const id = `own-entity-${entity.id}-${option.value || "as-read"}`;
                        const chosen = (entityAnswers[entity.id] ?? "") === option.value;
                        return (
                          <div key={option.value} className={`own-it-option${chosen ? " is-chosen" : ""}`}>
                            <label htmlFor={id}>
                              <input id={id} type="radio" name={`own-entity-${entity.id}`} value={option.value} checked={chosen} onChange={() => setEntityAnswers((current) => ({ ...current, [entity.id]: option.value }))} />
                              {option.label}
                            </label>
                          </div>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </fieldset>
            </details>
          )}
          <div className="own-it-actions">
            <button type="submit" disabled={saving || !anything}>{saving ? "Saving…" : "Save my answers"}</button>
            {said.length > 0 && <button type="button" onClick={() => setEditing(false)}>Keep what I said</button>}
            <span>Your answers create a new version of this report. The score stays where the evidence put it.</span>
          </div>
          {error && <p role="alert" className="own-it-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ActionBoundary, CapabilityResult, HumanAssertion, ReportRecord } from "../../shared/types/index.js";
import { claimEngine, refineReport } from "../api/client";
import { keyForReview } from "../engine/engineKeys";
import { announceEngineChange } from "../engine/useEngine";
import { WORD_LABEL, actionsThatMatter, plainWord } from "./FirstScreen";

/**
 * "Own it", lightly: one question per action of the three, answered in a minute. The answers go
 * through the same refinement as the full interview an agent runs in ChatGPT or Claude, as
 * `actionDecisions` alone, and land in an immutable child report. What the model holds, and how it
 * fits together, is decided on the first screen's cards and diagram, not here. Nothing here moves readiness:
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


export function OwnIt({ report }: { report: ReportRecord }) {
  const navigate = useNavigate();
  const three = actionsThatMatter(report.capabilities ?? []);
  const said = answeredAlready(three);
  const [editing, setEditing] = useState(said.length === 0);
  const [answers, setAnswers] = useState<OwnAnswers>(() => initialAnswers(three));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (three.length === 0) return null;

  const decisions = decisionsFrom(answers);
  const anything = decisions.length > 0;

  const answer = (actionId: string, patch: Partial<OwnAnswers[string]>) =>
    setAnswers((current) => ({ ...current, [actionId]: { ...current[actionId]!, ...patch } }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!anything) return;
    setSaving(true);
    setError(null);
    try {
      // The same call the interview ends with; here it carries the decisions made on this page alone.
      const child = await refineReport(report.id, { actionDecisions: decisions }, await keyForReview(report, claimEngine));
      announceEngineChange();
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
        What your site tells AI agents about each action starts here. Nothing here moves readiness; only an interface that answers does.
      </p>

      {!editing ? (
        <>
          <ul className="own-it-answers" aria-label="What you said">
            {three.map((capability) => {
              const human = capability.boundarySource === "human-provided" && capability.boundary ? capability.boundary : null;
              const word = plainWord(capability) ?? "fix";
              return (
                <li key={capability.actionId}>
                  <span className="own-it-action">
                    {capability.label} <span className={`plain-word plain-word-${word}`}>{WORD_LABEL[word]}</span>
                  </span>
                  <span className="own-it-word">
                    {human ? OWN_WORDS[human] : "Not answered"}
                    {human === "partner-handoff" && capability.boundaryPartner ? `: ${capability.boundaryPartner.name}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="own-it-change" onClick={() => setEditing(true)}>Change my answers</button>
        </>
      ) : (
        <form className="own-it-form" onSubmit={(event) => void save(event)}>
          {three.map((capability) => {
            const current = answers[capability.actionId]!;
            const word = plainWord(capability) ?? "fix";
            return (
              <fieldset key={capability.actionId} className="own-it-question">
                {/* The legend names the group for a screen reader; the row shows the action with its state today. */}
                <legend className="sr-only">{capability.label}</legend>
                <div className="own-it-row">
                  <span className="own-it-row-name" aria-hidden="true">
                    <b>{capability.label}</b>
                    <span className={`plain-word plain-word-${word}`}>{WORD_LABEL[word]}</span>
                  </span>
                  <div className="own-it-options">
                    {OPTIONS.map((option) => {
                      const id = `own-${capability.actionId}-${option.value}`;
                      return (
                        <label key={option.value} htmlFor={id} className={`own-it-option${current.boundary === option.value ? " is-chosen" : ""}`}>
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
                      );
                    })}
                  </div>
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
          <div className={`own-it-actions${anything ? " is-ready" : ""}`} role={anything ? "status" : undefined}>
            <span>
              {anything
                ? `${decisions.length} ${decisions.length === 1 ? "answer" : "answers"} ready. Saving creates a new version of this report, kept on your Context Engine for every later read.`
                : "Pick an answer for each action you know. Your answers create a new version of this report; the score stays where the evidence put it."}
            </span>
            <button type="submit" className="review-cta review-cta-primary" disabled={saving || !anything}>{saving ? "Saving…" : "Save my answers"}</button>
            {said.length > 0 && <button type="button" className="own-it-keep" onClick={() => setEditing(false)}>Keep what I said</button>}
          </div>
          {error && <p role="alert" className="own-it-error">{error}</p>}
        </form>
      )}
    </section>
  );
}

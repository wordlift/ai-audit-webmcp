import { Copy, UserRoundCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ActionBoundary, CapabilityResult, HumanAssertion, ReportRecord } from "../../shared/types/index.js";
import { refineReport } from "../api/client";
import { reviewPrompt } from "./reviewPrompt";
import { actionsThatMatter } from "./FirstScreen";

/**
 * "Own it", lightly: one question per action of the three, answered in a minute. The answers go
 * through the same refinement as the full interview an agent runs in ChatGPT or Claude, as
 * `actionDecisions` alone, and land in an immutable child report. Nothing here moves readiness:
 * a decision says who is responsible; only an interface that answers says it works.
 */
export type OwnAnswer = Exclude<ActionBoundary, "not-applicable">;

/** The plain words for who runs an action. The precise boundary stays in the full audit and in every file an agent reads. */
export const OWN_WORDS: Record<ActionBoundary, string> = {
  owned: "Ours",
  "partner-handoff": "A partner runs it",
  "informational-only": "Described only",
  "not-applicable": "Not ours",
};

const OPTIONS: ReadonlyArray<{ value: OwnAnswer; label: string; means: string }> = [
  { value: "owned", label: "We do", means: "Published as your action, with its entry point once one answers." },
  { value: "partner-handoff", label: "A partner does", means: "Published with the partner named as the provider." },
  { value: "informational-only", label: "We only describe it", means: "Published as information: the entity, no action." },
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
        ...(capability.boundarySource === "human-provided" && capability.boundary && capability.boundary !== "not-applicable"
          ? { boundary: capability.boundary }
          : {}),
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
  const [copied, setCopied] = useState(false);
  if (three.length === 0) return null;

  // The other door: the same questions, and more, asked by ChatGPT in a conversation, filed here.
  async function copyReview() {
    await navigator.clipboard.writeText(reviewPrompt(report.id));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }
  const decisions = decisionsFrom(answers);

  const answer = (actionId: string, patch: Partial<OwnAnswers[string]>) =>
    setAnswers((current) => ({ ...current, [actionId]: { ...current[actionId]!, ...patch } }));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (decisions.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      // The same call the interview ends with; here it carries the action decisions alone.
      const child = await refineReport(report.id, { actionDecisions: decisions });
      navigate(`/reports/${child.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your answers could not be saved.");
      setSaving(false);
    }
  }

  return (
    <section className="own-it" id="own-it" aria-labelledby="own-it-title">
      <p className="section-kicker"><UserRoundCheck size={16} /> Own it</p>
      <h2 id="own-it-title">Three questions only you can answer</h2>
      <p className="own-it-lead">Who runs each of these? Your answer shapes what the site publishes. It never changes the score; only an interface that answers does.</p>

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
          <div className="own-it-actions">
            <button type="submit" disabled={saving || decisions.length === 0}>{saving ? "Saving…" : "Save my answers"}</button>
            {said.length > 0 && <button type="button" onClick={() => setEditing(false)}>Keep what I said</button>}
            <span>Your answers create a new version of this report. The score stays where the evidence put it.</span>
          </div>
          {error && <p role="alert" className="own-it-error">{error}</p>}
        </form>
      )}
      <div className="own-it-alt">
        <p>
          Prefer to talk it through? ChatGPT can interview you about the business, its vocabulary and who runs each action, and file the
          answers here. Copy the prompt and paste it into ChatGPT.
        </p>
        <button type="button" className="review-cta" onClick={() => void copyReview()}>
          <Copy size={15} aria-hidden="true" /> {copied ? "Prompt copied. Paste it into ChatGPT" : "Review with ChatGPT"}
        </button>
      </div>
    </section>
  );
}

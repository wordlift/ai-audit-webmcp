import { ArrowRight, Ban, ChevronDown, FileText, Handshake, Users } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { useReportEngine } from "../engine/EngineContext";
import { fileReview, reviewFailure } from "./review";
import {
  AGENT_STATUS_LABEL,
  OWNERSHIP_CHOICES,
  PEOPLE_STATUS_LABEL,
  agentStatus,
  agentsWillRead,
  hostOf,
  initialOwnershipDraft,
  ownershipDecision,
  ownershipProblem,
  peopleStatus,
  sameOwnershipDraft,
  savedChoice,
  type OwnershipChoice,
  type OwnershipDraft,
  type SavedNotice,
} from "./surface";
import { DecisionModal } from "./ui";

/**
 * Who handles one action: four choices, one contract. The modal opens on what a review already
 * saved, or on nothing when nobody has said; it never guesses "our team". Saving sends one
 * actionDecisions entry through the refinement the product has and opens the reviewed version that
 * comes back. It records responsibility. It does not verify, authenticate or make anything callable,
 * and the report's readiness is the evidence's to move.
 */
const ICONS: Record<OwnershipChoice, ReactNode> = {
  team: <Users size={24} strokeWidth={1.5} aria-hidden="true" />,
  partner: <Handshake size={24} strokeWidth={1.5} aria-hidden="true" />,
  information: <FileText size={24} strokeWidth={1.5} aria-hidden="true" />,
  "not-relevant": <Ban size={24} strokeWidth={1.5} aria-hidden="true" />,
};

export function OwnershipModal({
  report,
  capability,
  onClose,
  onSaved,
}: {
  report: ReportRecord;
  capability: CapabilityResult;
  onClose: () => void;
  onSaved: (child: ReportRecord, notice: SavedNotice) => void;
}) {
  const formId = useId();
  const { key: engineKey } = useReportEngine();
  const [initial] = useState<OwnershipDraft>(() => initialOwnershipDraft(capability));
  const [draft, setDraft] = useState<OwnershipDraft>(initial);
  const [noteOpen, setNoteOpen] = useState(Boolean(initial.note));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unapplied, setUnapplied] = useState<string[] | null>(null);

  const host = hostOf(report);
  const dirty = !sameOwnershipDraft(draft, initial);
  const problem = ownershipProblem(draft);
  const preview = agentsWillRead(capability.label, draft, host);
  const action = capability.label.charAt(0).toLowerCase() + capability.label.slice(1);
  const change = (patch: Partial<OwnershipDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
    setUnapplied(null);
  };

  async function save(event?: FormEvent) {
    event?.preventDefault();
    // One submission at a time, and never one the form itself can see is wrong.
    if (saving) return;
    const decision = ownershipDecision(capability.actionId, draft);
    if (!decision || !dirty) return;
    setSaving(true);
    setError(null);
    setUnapplied(null);
    try {
      const { child, unapplied: reasons } = await fileReview(report, { actionDecisions: [decision] }, engineKey);
      const landed = child.capabilities?.find((candidate) => candidate.actionId === capability.actionId);
      // The reviewed version is the authority: a decision it does not carry was not applied, whatever was sent.
      if (!landed || landed.boundary !== decision.boundary || landed.boundarySource !== "human-provided") {
        setUnapplied(reasons.length > 0 ? reasons : ["The reviewed version does not carry this decision."]);
        setSaving(false);
        return;
      }
      const chosen = OWNERSHIP_CHOICES.find((choice) => choice.id === draft.choice)!;
      onSaved(child, {
        kind: "ownership",
        actionId: capability.actionId,
        summary: `“${capability.label}” is handled by: ${chosen.label.toLowerCase()}${draft.choice === "partner" ? ` (${draft.partnerName.trim()})` : ""}.`,
      });
    } catch (caught) {
      setError(reviewFailure(caught, "Your decision could not be saved."));
      setSaving(false);
    }
  }

  return (
    <DecisionModal
      open
      onClose={onClose}
      kicker="Fix / Action ownership"
      title={`Who handles “${action}”?`}
      lead={<p>Define the handoff an agent should expect.</p>}
      dirty={dirty}
      busy={saving}
      footer={
        <>
          <p className="modal-foot-note">
            Creates a reviewed version.
            <br />
            Readiness stays unchanged.
          </p>
          <button type="button" className="button button-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={formId} className="button button-primary" disabled={saving || !dirty || Boolean(problem)}>
            {saving ? "Saving…" : error ? "Retry" : "Save decision"} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </>
      }
    >
      <form id={formId} className="ownership-form" onSubmit={(event) => void save(event)} noValidate>
        <div className="ownership-subject">
          <b>{capability.label}</b>
          <span>{host}</span>
        </div>
        <p className="ownership-observed">
          <span>People: {PEOPLE_STATUS_LABEL[peopleStatus(capability)].toLowerCase()}</span>
          <span>Agent interface: {AGENT_STATUS_LABEL[agentStatus(capability)].toLowerCase()}</span>
        </p>

        <fieldset className="choice-list" disabled={saving}>
          <legend className="sr-only">Who handles {action}?</legend>
          {OWNERSHIP_CHOICES.map((choice) => {
            const on = draft.choice === choice.id;
            return (
              <div key={choice.id} className={`choice${on ? " is-on" : ""}`}>
                <label>
                  <input type="radio" name={`${formId}-choice`} value={choice.id} checked={on} onChange={() => change({ choice: choice.id })} />
                  <span className="choice-icon">{ICONS[choice.id]}</span>
                  <span className="choice-text">
                    <b>{choice.label}</b>
                    <span>{choice.means}</span>
                  </span>
                </label>
                {/* The partner is asked for only when a partner is the answer. */}
                {on && choice.id === "partner" && (
                  <div className="choice-fields">
                    <label>
                      Partner name
                      <input
                        type="text"
                        value={draft.partnerName}
                        maxLength={120}
                        required
                        aria-invalid={!draft.partnerName.trim()}
                        onChange={(event) => change({ partnerName: event.target.value })}
                      />
                    </label>
                    <label>
                      Partner website (optional)
                      <input
                        type="text"
                        inputMode="url"
                        value={draft.partnerUrl}
                        maxLength={2_048}
                        placeholder="partner.example"
                        aria-invalid={Boolean(draft.partnerUrl.trim()) && Boolean(problem) && Boolean(draft.partnerName.trim())}
                        onChange={(event) => change({ partnerUrl: event.target.value })}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </fieldset>

        {noteOpen ? (
          <label className="ownership-note">
            Note (optional)
            <textarea value={draft.note} maxLength={500} rows={2} disabled={saving} onChange={(event) => change({ note: event.target.value })} placeholder="Why this is the right answer, in your words." />
          </label>
        ) : (
          <button type="button" className="text-button text-button-strong" onClick={() => setNoteOpen(true)}>
            Add a note (optional) <ChevronDown size={16} aria-hidden="true" />
          </button>
        )}

        <div className="ownership-preview">
          <p className="kicker kicker-quiet">What agents will read</p>
          <p className="ownership-preview-line" aria-live="polite">{preview ?? "Choose who handles this action to see the line."}</p>
          {savedChoice(capability) === "not-relevant" || draft.choice === "not-relevant" ? (
            <p className="modal-foot-note">The evidence stays on the report this version was made from.</p>
          ) : null}
        </div>

        {draft.choice && problem && <p className="form-hint" role="status">{problem}</p>}
        {error && <p className="form-error" role="alert">{error} Nothing was saved; your answer is still here.</p>}
        {unapplied && (
          <div className="form-error" role="alert">
            <p>The decision was not applied.</p>
            <ul>{unapplied.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </div>
        )}
      </form>
    </DecisionModal>
  );
}

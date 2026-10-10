import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { AGENT_STATUS_LABEL, PEOPLE_STATUS_LABEL, type AgentStatus, type PeopleStatus } from "./surface";

/**
 * The few primitives every screen shares: a status that is always a word beside its colour, a
 * modal for a decision that has Save and Cancel, and the inspector a selected row opens. Blue is
 * for action and selection, green for verified evidence, amber for what is uncertain; what was
 * seen for people is neutral, so an observation never reads as a verified call.
 */
export function AgentMark({ status }: { status: AgentStatus }) {
  return (
    <span className={`mark mark-${status}`}>
      <i aria-hidden="true" />
      {AGENT_STATUS_LABEL[status]}
    </span>
  );
}

export function PeopleMark({ status }: { status: PeopleStatus }) {
  return (
    <span className={`mark mark-people mark-people-${status}`}>
      <i aria-hidden="true" />
      {PEOPLE_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * A focused decision. Escape, the backdrop and the close button all follow one rule: a form the
 * person changed asks before it is thrown away, and nothing closes while a save is in flight.
 * Focus is trapped inside and goes back to whatever opened it.
 */
export function DecisionModal({
  open,
  onClose,
  kicker,
  title,
  lead,
  dirty = false,
  busy = false,
  wide = false,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: string;
  lead?: ReactNode;
  dirty?: boolean;
  busy?: boolean;
  wide?: boolean;
  children: ReactNode;
  footer: ReactNode;
}) {
  function requestClose() {
    if (busy) return;
    if (dirty && !window.confirm("Discard the changes you have not saved?")) return;
    onClose();
  }
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal${wide ? " modal-wide" : ""}`} aria-describedby={undefined}>
          <header className="modal-head">
            <p className="kicker">{kicker}</p>
            <Dialog.Title className="modal-title">{title}</Dialog.Title>
            {lead && <div className="modal-lead">{lead}</div>}
            <button type="button" className="icon-button modal-close" aria-label="Close" onClick={requestClose} disabled={busy}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className="modal-body">{children}</div>
          <footer className="modal-foot">{footer}</footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * What a selected row opens: beside the table where there is room, a drawer where there is less, the
 * whole screen on a phone. It takes focus when it opens so a keyboard lands on what was asked for,
 * and Escape closes it; the caller puts focus back on the row.
 */
export function Inspector({ kicker, title, onClose, children, labelId }: { kicker: string; title: string; onClose: () => void; children: ReactNode; labelId: string }) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <aside
      className="inspector"
      aria-labelledby={labelId}
      onKeyDown={(event) => {
        // A modal opened from here handles its own Escape first.
        if (event.key === "Escape" && !event.defaultPrevented) onClose();
      }}
    >
      <div className="inspector-inner">
        <header className="inspector-head">
          <p className="kicker kicker-quiet">{kicker}</p>
          <h2 id={labelId} ref={headingRef} tabIndex={-1}>{title}</h2>
          <button type="button" className="icon-button inspector-close" aria-label={`Close ${title}`} onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {children}
      </div>
    </aside>
  );
}

/** One of a few: a real radio group, so arrow keys and a screen reader both know what it is. */
export function Segmented<T extends string>({ label, name, value, options, onChange, disabled = false }: { label: string; name: string; value: T; options: ReadonlyArray<{ value: T; label: string; title?: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  return (
    <span className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className={`segmented-option${value === option.value ? " is-on" : ""}`} title={option.title}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={disabled} onChange={() => onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </span>
  );
}

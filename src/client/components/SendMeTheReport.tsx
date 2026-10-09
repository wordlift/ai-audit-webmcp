import { Mail } from "lucide-react";
import { type FormEvent, useState } from "react";
import { maskEmail } from "../../shared/format/deepScan.js";
import { ApiError, claimEngine, requestDelivery } from "../api/client";
import { engineKeyFor, saveEngineKey } from "../engine/engineKeys";
import { announceEngineChange } from "../engine/useEngine";

/**
 * The one field the audit asks for, asked while the audit runs: an address the finished report is
 * sent to. Skippable — the report is public at its own link whether or not one is given — and
 * asked once, here, never again on the report. The audit does not change; delivery is what the
 * address buys, and the same address claims the site's Context Engine for this browser, so the
 * person's later corrections are kept across reads.
 */
/** Remembered per report in this tab, so a reload does not ask a second time. */
const askedKey = (reportId: string) => `delivery-asked:${reportId}`;

export function deliveryAsked(reportId: string): boolean {
  try {
    return window.sessionStorage.getItem(askedKey(reportId)) !== null;
  } catch {
    return false;
  }
}

function rememberAsked(reportId: string): void {
  try {
    window.sessionStorage.setItem(askedKey(reportId), "1");
  } catch {
    // A tab without storage is asked again on reload, which is the lesser harm.
  }
}

/**
 * `progress` is the field while the audit runs. `late` is the same field once, on the report, for
 * the person who never had time to answer: a site read earlier that day lands at once, and the
 * progress screen is gone before it is seen. It can be dismissed, and either way it is not shown
 * again for this report in this tab.
 */
export function SendMeTheReport({ reportId, host, variant = "progress", onDismiss }: { reportId: string; host: string; variant?: "progress" | "late"; onDismiss?: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [masked, setMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function dismiss() {
    rememberAsked(reportId);
    onDismiss?.();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const accepted = await requestDelivery(reportId, address, "web");
      rememberAsked(reportId);
      setMasked(accepted.maskedEmail ?? maskEmail(address));
      setEmail("");
      setState("sent");
      // The claim rides on the address: this browser keeps the key, so its reviews are kept on the
      // engine. A pending key never replaces one it already holds; a server without engines says so.
      claimEngine(reportId)
        .then((result) => {
          if (result.standing === "holder" || !engineKeyFor(result.engine.host)) saveEngineKey(result.engine.host, result.key);
          announceEngineChange();
        })
        .catch(() => undefined);
    } catch (caught) {
      setState("idle");
      setError(caught instanceof ApiError ? caught.message : "The address could not be saved. Try again in a moment.");
    }
  }

  if (state === "sent" && masked) {
    return (
      <p className={`send-report send-report-sent${variant === "late" ? " send-report-late" : ""}`} role="status">
        <Mail size={16} aria-hidden="true" />{" "}
        {variant === "late" ? <>The report goes to <strong>{masked}</strong>. It stays readable here too, public and free.</> : <>The report goes to <strong>{masked}</strong> when it lands. It stays readable here too, public and free.</>}
      </p>
    );
  }

  return (
    <form className={`send-report${variant === "late" ? " send-report-late" : ""}`} onSubmit={submit} aria-label="Report delivery">
      <label htmlFor="send-report-email">
        <Mail size={16} aria-hidden="true" /> {variant === "late" ? `This one landed fast. Want the report for ${host} by email too?` : `Send me the report for ${host} when it is ready`}
      </label>
      <div className="input-row">
        <input
          id="send-report-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={state === "sending"}
        />
        <button type="submit" disabled={state === "sending" || !email.trim()}>
          {state === "sending" ? "Saving…" : "Send it"}
        </button>
        {variant === "late" && (
          <button type="button" className="send-report-dismiss" onClick={dismiss}>
            No thanks
          </button>
        )}
      </div>
      <p className="send-report-note">{variant === "late" ? "Optional. The report is public at its own link either way." : "Optional. The audit runs either way, and the report is public at its own link."}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

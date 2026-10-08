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
export function SendMeTheReport({ reportId, host }: { reportId: string; host: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [masked, setMasked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address || state === "sending") return;
    setState("sending");
    setError(null);
    try {
      const accepted = await requestDelivery(reportId, address, "web");
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
      <p className="send-report send-report-sent" role="status">
        <Mail size={16} aria-hidden="true" /> The report goes to <strong>{masked}</strong> when it lands. It stays readable here too, public and free.
      </p>
    );
  }

  return (
    <form className="send-report" onSubmit={submit} aria-label="Report delivery">
      <label htmlFor="send-report-email">
        <Mail size={16} aria-hidden="true" /> Send me the report for {host} when it is ready
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
      </div>
      <p className="send-report-note">Optional. The audit runs either way, and the report is public at its own link.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

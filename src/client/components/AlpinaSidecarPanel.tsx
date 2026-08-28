import { Plug, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { checkAlpinaAvailability, type AlpinaAvailabilityResponse } from "../api/client";
import { describeAvailability } from "../webmcp/AlpinaAvailabilityTool";

/**
 * The human control for the same approved sidecar an agent calls. It exists so the before/after
 * transformation can be demonstrated in any browser, with or without WebMCP.
 */
export function AlpinaSidecarPanel({ reportId, verified }: { reportId: string; verified: boolean }) {
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState("2026-09-12");
  const [checkOut, setCheckOut] = useState("2026-09-15");
  const [adults, setAdults] = useState(2);
  const [result, setResult] = useState<AlpinaAvailabilityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await checkAlpinaAvailability({ reportId, checkIn, checkOut, adults });
      setResult(response);
      if (response.updatedReportUrl) {
        window.setTimeout(() => navigate(response.updatedReportUrl as string), 1_200);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The availability lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sidecar-panel" aria-labelledby="sidecar-title">
      <div className="sidecar-heading">
        <p className="section-kicker"><Plug size={16} /> Approved sidecar</p>
        <h2 id="sidecar-title">
          {verified ? "This capability is now a verified agent function" : "Turn one unverified capability into an agent function"}
        </h2>
        <p>
          {verified
            ? "A successful agent call is recorded as evidence in this revision, so the availability check reads sidecar-enabled. Run it again for new dates; each verified call creates its own revision."
            : "People can check dates here and an availability interface is declared, but no agent call has been verified. Run the approved read-only sidecar to prove it; the result becomes a new immutable revision of this report."}
        </p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="sidecar-checkin">Check in
          <input id="sidecar-checkin" type="date" value={checkIn} onChange={(event) => setCheckIn(event.target.value)} required />
        </label>
        <label htmlFor="sidecar-checkout">Check out
          <input id="sidecar-checkout" type="date" value={checkOut} onChange={(event) => setCheckOut(event.target.value)} required />
        </label>
        <label htmlFor="sidecar-adults">Adults
          <input id="sidecar-adults" type="number" min={1} max={6} value={adults} onChange={(event) => setAdults(Number(event.target.value))} required />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Checking…" : "Run agent function"}</button>
      </form>
      <p className="sidecar-guardrail"><ShieldCheck size={15} /> Read-only and source-backed. Answers are time-sensitive and expire. No booking, no hold, no guest data, no payment.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <pre className="sidecar-result" role="status">{describeAvailability(result)}</pre>
      )}
    </section>
  );
}

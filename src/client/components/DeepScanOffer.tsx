import { ArrowRight, Mail, ScanSearch } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BASIC_SCAN_PAGES, DEEP_SCAN_PAGES, maskEmail } from "../../shared/format/deepScan.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { ApiError, claimEngine, startReport } from "../api/client";
import { hostOf as engineHost, saveEngineKey } from "../engine/engineKeys";
import { announceEngineChange } from "../engine/useEngine";

/**
 * Claim your Context Engine: the one thing the audit asks for, where the person already is.
 *
 * Everything else here is free and anonymous. What an address buys is the engine growing past the
 * first pages, sent to the person, and a note when what agents can do there moves (the
 * Observer re-reads it); underneath, it is the deep scan, and the lead goes where it always went.
 * It is asked for after the reader has seen what the free scan understood, never before. Claiming
 * here saves nothing else yet: review decisions stay on the report they were filed on. It sits on the first screen as one
 * line and opens in place, so nobody is sent to the bottom of the page to find a form.
 *
 * The address is submitted and then forgotten by the page: it is never put in the report, and the
 * confirmation shows it masked, because a shared report link must not carry the address of whoever
 * asked for it.
 */
/** How long a refusal gets to arrive before the scan is announced as running. A live audit answers only when it is done. */
const ACCEPT_GRACE_MS = 2_500;

export function DeepScanOffer({ report, graceMs = ACCEPT_GRACE_MS, variant = "strip", claimed = false }: { report: ReportRecord; graceMs?: number; variant?: "strip" | "inline"; claimed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<{ reportId: string; masked: string } | null>(null);
  const [standing, setStanding] = useState<"holder" | "pending" | null>(null);

  if (report.scanDepth === "deep") return null;

  const pagesRead = report.contextGraph?.pages.length ?? BASIC_SCAN_PAGES;
  const target = report.canonicalUrl ?? report.requestedUrl;

  async function requestDeepScan(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setState("sending");
    setError(null);
    // The claim itself: this browser keeps the key, so its reviews are kept on the engine. A server
    // without engines, or a refusal, still runs the expansion the address was given for.
    claimEngine(report.id)
      .then((claim) => {
        saveEngineKey(engineHost(report.canonicalUrl ?? report.requestedUrl), claim.key);
        setStanding(claim.standing);
        announceEngineChange();
      })
      .catch(() => undefined);
    try {
      const audit = startReport(target, { depth: "deep", email: address, surface: "web" });
      // A refused address or a rate limit comes back at once and must not be announced as a scan
      // in progress. A live audit answers only when it is done, a minute or more later, so after a
      // moment without a refusal the scan is running, and the report page follows it live.
      audit.ready.catch(() => undefined);
      const accepted = audit.accepted.then(() => "accepted" as const);
      const outcome = await Promise.race([accepted, new Promise<"running">((resolve) => setTimeout(() => resolve("running"), graceMs))]);
      setStarted({ reportId: audit.reportId, masked: maskEmail(address) });
      setEmail("");
      setState("sent");
      if (outcome === "running") {
        accepted.catch((caught) => {
          setStarted(null);
          setState("idle");
          setError(caught instanceof ApiError ? caught.message : "The deep scan could not be started. Try again in a moment.");
        });
      }
    } catch (caught) {
      setState("idle");
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The deep scan could not be started. Try again in a moment.",
      );
    }
  }

  if (state === "sent" && started) {
    return (
      <section className="deep-scan-offer deep-scan-offer-sent" id="deep-scan" aria-live="polite">
        <p className="section-kicker"><ScanSearch size={18} /> Context Engine claimed</p>
        <h2>Expanding it now.</h2>
        <p>
          We are expanding your Context Engine from {pagesRead} to up to {DEEP_SCAN_PAGES} representative pages of {hostOf(target)}. The finished report goes to{" "}
          <strong>{started.masked}</strong>, and lives at its own link — public and free, like this one.
        </p>
        {standing === "pending" && (
          <p className="deep-scan-pending">
            Someone else claimed this Context Engine first. <a href="#ownership">Verify you own {hostOf(target)}</a> to take it over.
          </p>
        )}
        <Link className="deep-scan-follow" to={`/reports/${started.reportId}`} state={{ started: true }}>
          Follow it live →
        </Link>
      </section>
    );
  }

  return (
    <section className={`deep-scan-offer deep-scan-inline deep-scan-${variant}`} id="deep-scan" aria-label="Claim your Context Engine">
      <button type="button" className={variant === "inline" ? "deep-scan-inline-link" : "deep-scan-strip"} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {variant === "strip" && <ScanSearch size={16} aria-hidden="true" />} {claimed ? "Expand your Context Engine" : "Claim your Context Engine and expand it"} beyond {pagesRead === 1 ? "this page" : `these ${pagesRead} pages`}
        <ArrowRight size={14} aria-hidden="true" className={open ? "is-open" : ""} />
      </button>
      {open && (
        <div className="deep-scan-form">
          <p>
            This Context Engine was built from {pagesRead} representative {pagesRead === 1 ? "page" : "pages"}. Claim it and we expand it to up to{" "}
            {DEEP_SCAN_PAGES}, send you the result, and write when what agents can do there changes.
          </p>
          <form className="input-row" onSubmit={requestDeepScan}>
            <label className="sr-only" htmlFor="deep-scan-email">Email address to claim this Context Engine</label>
            <input
              id="deep-scan-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={state === "sending"}
            />
            <button type="submit" disabled={state === "sending" || email.trim().length === 0}>
              <Mail size={17} aria-hidden="true" /> {state === "sending" ? "Starting…" : "Claim & expand"}
            </button>
          </form>
          {error && <p className="deep-scan-error" role="alert">{error}</p>}
          <small>
            Your address is used to send the expanded report and notes about changes, and is never written into it. The report itself stays
            public at its own link. <a href="/privacy">How your data is handled</a>.
          </small>
        </div>
      )}
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

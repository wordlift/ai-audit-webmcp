import { Mail, ScanSearch } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BASIC_SCAN_PAGES, DEEP_SCAN_PAGES, maskEmail } from "../../shared/format/deepScan.js";
import type { ReportRecord } from "../../shared/types/index.js";
import { ApiError, startReport } from "../api/client";

/**
 * The one thing the audit asks for.
 *
 * Everything else here is free and anonymous. Reading further into a site costs real crawl budget
 * and produces a report worth sending on, so this is where an address is exchanged for it — after
 * the reader has seen what the free scan found, never before.
 *
 * The address is submitted and then forgotten by the page: it is never put in the report, and the
 * confirmation shows it masked, because a shared report link must not carry the address of whoever
 * asked for it.
 */
export function DeepScanOffer({ report }: { report: ReportRecord }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<{ reportId: string; masked: string } | null>(null);

  if (report.scanDepth === "deep") return null;

  const pagesRead = report.contextGraph?.pages.length ?? BASIC_SCAN_PAGES;
  const target = report.canonicalUrl ?? report.requestedUrl;

  async function requestDeepScan(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setState("sending");
    setError(null);
    try {
      const audit = startReport(target, { depth: "deep", email: address, surface: "web" });
      // Wait for the service to accept it — a refused address or a rate limit must not be
      // announced as a scan in progress — but not for the audit, which takes about a minute.
      audit.ready.catch(() => undefined);
      await audit.accepted;
      setStarted({ reportId: audit.reportId, masked: maskEmail(address) });
      setEmail("");
      setState("sent");
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
      <section className="deep-scan-offer deep-scan-offer-sent" aria-live="polite">
        <p className="section-kicker"><ScanSearch size={18} /> Deep scan running</p>
        <h2>Reading the whole site now.</h2>
        <p>
          We are reading up to {DEEP_SCAN_PAGES} pages of {hostOf(target)}. The finished report goes to{" "}
          <strong>{started.masked}</strong>, and lives at its own link — public and free, like this one.
        </p>
        <Link className="deep-scan-follow" to={`/reports/${started.reportId}`}>
          Follow it live →
        </Link>
      </section>
    );
  }

  return (
    <section className="deep-scan-offer" aria-labelledby="deep-scan-heading">
      <p className="section-kicker"><ScanSearch size={18} /> Read the whole site</p>
      <h2 id="deep-scan-heading">This report read {pagesRead} representative {pagesRead === 1 ? "page" : "pages"}.</h2>
      <p>
        A deep scan reads up to {DEEP_SCAN_PAGES} of them — more entities, more actions, more of what an
        agent would actually meet. Tell us where to send it and we will run it now.
      </p>
      <form className="input-row" onSubmit={requestDeepScan}>
        <label className="sr-only" htmlFor="deep-scan-email">Email address for the deep scan report</label>
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
          <Mail size={17} aria-hidden="true" /> {state === "sending" ? "Starting…" : "Send me the deep scan"}
        </button>
      </form>
      {error && <p className="deep-scan-error" role="alert">{error}</p>}
      <small>
        Your address is used to send this report and is never written into it. The report itself stays
        public at its own link.
      </small>
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

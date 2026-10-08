import { Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { ReportRecord } from "../../shared/types/index.js";
import { ApiError, getEngineVerification, verifyEngine, type EngineVerification } from "../api/client";
import { useReportEngine } from "../engine/EngineContext";
import { announceEngineChange } from "../engine/useEngine";
import { publishUrl } from "./FixPanel";
import { track } from "../engine/track";

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * The difference between a reviewer and the business. Anyone can claim a draft; what the engine
 * publishes as the business's own word waits for the site to prove it: a code on the home page or
 * at a well-known path, read by the server, never by the page.
 */
export function OwnershipPanel({ report }: { report: ReportRecord }) {
  const { engine, host, key } = useReportEngine();
  const [verification, setVerification] = useState<EngineVerification | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!engine) return null;

  async function showCode() {
    if (!key) return;
    track(report.id, "ownership_started");
    setMessage(null);
    try {
      setVerification(await getEngineVerification(host, key));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "The code could not be prepared.");
    }
  }

  async function check() {
    if (!key) return;
    setChecking(true);
    setMessage(null);
    try {
      await verifyEngine(host, key);
      announceEngineChange();
    } catch (caught) {
      setMessage(caught instanceof ApiError || caught instanceof Error ? caught.message : "The site could not be read.");
    } finally {
      setChecking(false);
    }
  }

  async function copy() {
    if (!verification) return;
    await navigator.clipboard.writeText(verification.metaTag);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  const verified = engine.owner.state === "verified";
  const holds = engine.standing === "reviewer" || engine.standing === "owner" || engine.standing === "pending";

  return (
    <section className="ownership" id="ownership" aria-labelledby="ownership-title">
      <h3 id="ownership-title">{verified ? <><ShieldCheck size={16} aria-hidden="true" /> Owner verified</> : `Is ${host} yours?`}</h3>
      {verified && engine.standing === "owner" && (
        <>
          <p>
            You proved {host} is yours{engine.owner.verifiedAt ? ` on ${longDate(engine.owner.verifiedAt)}` : ""}. What you decide here is kept as the business's own word, and no reviewer's decision overrides it.
          </p>
          <p>
            <a href={publishUrl(report.id, { intent: "claim-context", engine: engine.id })} onClick={() => track(report.id, "door_claim-context")} target="_blank" rel="noreferrer">Connect it to your WordLift account</a>, where it becomes your live knowledge graph.
          </p>
        </>
      )}
      {verified && engine.standing !== "owner" && (
        <p>The owner of {host} verified this. Their decisions are the business's own word; a review from anyone else stays on its report.</p>
      )}
      {!verified && !holds && (
        <p>
          {engine.claimed
            ? `Someone claimed this, and nobody has proved ${host} is theirs yet. If it is yours, answer who runs an action above and this browser holds it; then verify it to take it over.`
            : "Your first correction, above or in the answers, is kept in this browser across reads of the site. Verify you own the site afterwards to make your decisions the business's own word."}{" "}
          <a href="#own-it">Answer who runs each action</a>
        </p>
      )}
      {!verified && holds && (
        <>
          <p>
            {engine.standing === "pending"
              ? `Someone else claimed this first. Prove ${host} is yours to take it over.`
              : `Your decisions are kept as a reviewer's until you prove ${host} is yours. Then they are the business's own word.`}
          </p>
          {!verification ? (
            <button type="button" className="review-cta" onClick={() => void showCode()}>Verify ownership</button>
          ) : (
            <div className="ownership-steps">
              <p>Add this tag to the <code>&lt;head&gt;</code> of your home page, or put the code alone in <code>{verification.wellKnownUrl}</code>:</p>
              <figure className="fix-sample">
                <figcaption>
                  <span>Verification tag</span>
                  <button type="button" onClick={() => void copy()}><Copy size={13} /> {copied ? "Copied" : "Copy"}</button>
                </figcaption>
                <pre>{verification.metaTag}</pre>
              </figure>
              <button type="button" className="review-cta" onClick={() => void check()} disabled={checking}>
                {checking ? "Reading the site…" : "Check now"}
              </button>
            </div>
          )}
        </>
      )}
      {message && <p className="ownership-error" role="alert">{message}</p>}
    </section>
  );
}

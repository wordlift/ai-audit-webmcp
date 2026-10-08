import { ArrowUpRight, BookOpen, Check, Copy, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { Publication } from "../../shared/types/activate.js";
import type { PublishedDoc } from "./DocDialog";
import { track } from "../engine/track";

/** The one line a person pastes to an agent that has the site's code: fetch the runbook, follow it. */
export function runbookPrompt(publication: Publication): string {
  return `Read ${publication.documents.runbook} and follow it step by step on this site's codebase or hosting. It puts four documents WordLift AI Audit compiled for ${publication.host} where agents look (${publication.sitePaths.catalog}, ${publication.sitePaths.skill}, ${publication.sitePaths.llms}, and JSON-LD on the home page). Add nothing that is not in those documents, and finish with the verification step so we can prove it from outside.`;
}

/**
 * Activate, the way it ends for a site nobody runs WordLift on: a runbook an agent applies. Shown
 * first, before the documents, because it is what turns four readable files into an activated site.
 * The plugin and Cloud JS do the same without a runbook; this is for everyone else.
 */
export function ActivateRunbook({ publication, onRead }: { publication: Publication; onRead: (doc: PublishedDoc) => void }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const doc: PublishedDoc = {
    kind: "For an agent with your code",
    title: "Runbook",
    note: "What an agent does to put the documents on the site, and how it proves they are there.",
    text: publication.runbook,
    href: publication.documents.runbook,
    format: "markdown",
  };
  async function copy() {
    track(publication.reportId, "runbook_prompt_copied");
    try {
      await navigator.clipboard.writeText(runbookPrompt(publication));
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <section className="activate-section activate-runbook" aria-labelledby="runbook-title">
      <h2 id="runbook-title"><TerminalSquare size={18} aria-hidden="true" /> Copy the files to your site</h2>
      <p className="activate-lead">
        Four files, each at a fixed path on your site, plus one block in your home page's <code>&lt;head&gt;</code>. Hand the runbook to an agent that can change your site, such as Claude Code or Codex, or do it by hand from the table. Either way it publishes only what is in these files, and ends by reading the site again so what the page declares, what the catalog registers and what an agent could call agree.
      </p>
      <table className="activate-files">
        <thead><tr><th>File</th><th>Put it at</th><th></th></tr></thead>
        <tbody>
          <tr><td>Discovery catalog</td><td><code>{publication.sitePaths.catalog}</code></td><td><a href={publication.documents.siteCatalog} target="_blank" rel="noreferrer">Download <ArrowUpRight size={12} aria-hidden="true" /></a></td></tr>
          <tr><td>Terms of Action</td><td><code>{publication.sitePaths.skill}</code></td><td><a href={publication.documents.skill} target="_blank" rel="noreferrer">Download <ArrowUpRight size={12} aria-hidden="true" /></a></td></tr>
          <tr><td>llms.txt</td><td><code>{publication.sitePaths.llms}</code></td><td><a href={publication.documents.llms} target="_blank" rel="noreferrer">Download <ArrowUpRight size={12} aria-hidden="true" /></a></td></tr>
          <tr><td>Business data (JSON-LD)</td><td>the <code>&lt;head&gt;</code> of your home page</td><td><a href={publication.documents.pageJsonLd} target="_blank" rel="noreferrer">Download <ArrowUpRight size={12} aria-hidden="true" /></a></td></tr>
        </tbody>
      </table>
      <div className="publish-actions">
        <button type="button" className="doc-read" onClick={copy}>
          {state === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {state === "copied" ? "Copied — paste it to your agent" : "Copy the prompt for your agent"}
        </button>
        <button type="button" className="doc-read" onClick={() => onRead(doc)}>
          <BookOpen size={14} aria-hidden="true" /> Read the runbook
        </button>
        <a href={publication.documents.runbook} target="_blank" rel="noreferrer">Raw <ArrowUpRight size={12} aria-hidden="true" /></a>
      </div>
      {state === "failed" && <p className="form-error" role="alert">The prompt could not be copied. Open the runbook and share its link instead.</p>}
    </section>
  );
}

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
      <h2 id="runbook-title"><TerminalSquare size={18} aria-hidden="true" /> Put it on your site with an agent</h2>
      <p className="activate-lead">
        Hand the runbook to an agent that can change your site, such as Claude Code or Codex. It serves the catalog, the Terms of Action and llms.txt
        at <code>{publication.sitePaths.catalog}</code>, <code>{publication.sitePaths.skill}</code> and <code>{publication.sitePaths.llms}</code>, adds the JSON-LD to your home page, and ends by reading the site again so the three agree. It publishes only what is in these files.
      </p>
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

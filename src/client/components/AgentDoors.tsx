import { Copy, MessageSquare } from "lucide-react";
import { useState } from "react";
import { getReviewToken } from "../api/client";
import { askAgentPrompt, reviewPrompt } from "./reviewPrompt";
import { track } from "../engine/track";

/** Where a copied prompt goes. The page's tools run in ChatGPT's Work mode today, not in a regular chat. */
export const CHATGPT_URL = "https://chatgpt.com/";

/**
 * Beside the Context Engine, the two things to do with it in ChatGPT. Both need ChatGPT's Work mode,
 * which is on paid plans: the tools on this page are reachable there and not in a regular chat, so
 * the door says so before the click and says where to paste after it. Review makes the model
 * better: ChatGPT says what WordLift understood, asks the few questions that matter, and files the
 * answers here, where they show. Ask proves the model is usable: an agent answers about the business
 * from it. Each copies one prompt; the mechanism stays behind the page.
 */
/**
 * Writes text that is still being prepared. Safari refuses a clipboard write that happens after an
 * await, so where the page can hand the clipboard a promise it does, inside the click; elsewhere the
 * text is awaited first.
 */
async function writeClipboard(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": text.then((value) => new Blob([value], { type: "text/plain" })) })]);
      return;
    } catch {
      // A browser without promised items falls through to the plain write.
    }
  }
  await navigator.clipboard.writeText(await text);
}

export function AgentDoors({ reportId, host = null, engineKey = null }: { reportId: string; host?: string | null; engineKey?: string | null }) {
  const [copied, setCopied] = useState<"ask" | "review" | null>(null);
  const [failed, setFailed] = useState(false);
  async function copy(which: "ask" | "review") {
    track(reportId, which === "ask" ? "ask_prompt_copied" : "review_prompt_copied");
    setFailed(false);
    // The holder's review carries a day-long token in its link, so what ChatGPT files is kept on the engine.
    const text =
      which === "review" && host && engineKey
        ? getReviewToken(host, engineKey).then((answer) => reviewPrompt(reportId, answer.token)).catch(() => reviewPrompt(reportId))
        : Promise.resolve(which === "ask" ? askAgentPrompt(reportId) : reviewPrompt(reportId));
    try {
      await writeClipboard(text);
      setCopied(which);
      // Long enough to read where to paste it, and to click through.
      window.setTimeout(() => setCopied(null), 20_000);
    } catch {
      setFailed(true);
    }
  }
  return (
    <section className="agent-doors" aria-labelledby="agent-doors-title">
      <p className="agent-doors-lead">
        <b id="agent-doors-title">Review the understanding with ChatGPT.</b> It tells you what WordLift understood, asks what is right, and files your answers here{host ? ", kept on your Context Engine" : ""}. Needs a paid ChatGPT plan and its Work mode.
      </p>
      <div className="agent-doors-buttons">
        <button type="button" className="review-cta review-cta-primary" onClick={() => void copy("review")}>
          <MessageSquare size={15} aria-hidden="true" /> {copied === "review" ? "Prompt copied" : "Review with ChatGPT"}
        </button>
        <button type="button" className="review-cta" onClick={() => void copy("ask")}>
          <Copy size={15} aria-hidden="true" /> {copied === "ask" ? "Prompt copied" : "Ask ChatGPT about this business"}
        </button>
      </div>
      {copied && (
        <p className="agent-doors-next" role="status">
          Prompt copied. In ChatGPT, switch to <b>Work</b>, then paste it: the page's tools do not run in a regular chat.{" "}
          <a href={CHATGPT_URL} target="_blank" rel="noreferrer">Open ChatGPT</a>
        </p>
      )}
      {failed && <p className="agent-doors-failed" role="alert">The prompt could not be copied here. Allow clipboard access, or try another browser.</p>}
    </section>
  );
}

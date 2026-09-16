import { Copy, MessageSquare } from "lucide-react";
import { useState } from "react";
import { getReviewToken } from "../api/client";
import { askAgentPrompt, reviewPrompt } from "./reviewPrompt";
import { track } from "../engine/track";

/**
 * Beside the Context Engine, the two things to do with it in ChatGPT. Review makes the model
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
      window.setTimeout(() => setCopied(null), 2_500);
    } catch {
      setFailed(true);
    }
  }
  return (
    <section className="agent-doors" aria-labelledby="agent-doors-title">
      <p className="agent-doors-lead">
        <b id="agent-doors-title">Review the understanding.</b> ChatGPT tells you what WordLift understood, asks what is right, and files your answers here{host ? ", kept on your Context Engine" : ""}.
      </p>
      <div className="agent-doors-buttons">
        <button type="button" className="review-cta review-cta-primary" onClick={() => void copy("review")}>
          <MessageSquare size={15} aria-hidden="true" /> {copied === "review" ? "Prompt copied. Paste it into ChatGPT" : "Review with ChatGPT"}
        </button>
        <button type="button" className="review-cta" onClick={() => void copy("ask")}>
          <Copy size={15} aria-hidden="true" /> {copied === "ask" ? "Prompt copied. Paste it into ChatGPT" : "Ask ChatGPT about this business"}
        </button>
      </div>
      {failed && <p className="agent-doors-failed" role="alert">The prompt could not be copied here. Allow clipboard access, or try another browser.</p>}
    </section>
  );
}

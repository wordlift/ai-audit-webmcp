import { Copy, MessageSquare } from "lucide-react";
import { useState } from "react";
import { askAgentPrompt, reviewPrompt } from "./reviewPrompt";

/**
 * Beside the Context Engine, the two things to do with it in ChatGPT. Review makes the model
 * better: ChatGPT says what WordLift understood, asks the few questions that matter, and files the
 * answers here, where they show. Ask proves the model is usable: an agent answers about the business
 * from it. Each copies one prompt; the mechanism stays behind the page.
 */
export function AgentDoors({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState<"ask" | "review" | null>(null);
  async function copy(which: "ask" | "review") {
    await navigator.clipboard.writeText(which === "ask" ? askAgentPrompt(reportId) : reviewPrompt(reportId));
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2_500);
  }
  return (
    <section className="agent-doors" aria-labelledby="agent-doors-title">
      <p className="agent-doors-lead">
        <b id="agent-doors-title">Review the understanding.</b> ChatGPT tells you what WordLift understood, asks what is right, and files your answers here.
      </p>
      <div className="agent-doors-buttons">
        <button type="button" className="review-cta review-cta-primary" onClick={() => void copy("review")}>
          <MessageSquare size={15} aria-hidden="true" /> {copied === "review" ? "Prompt copied. Paste it into ChatGPT" : "Review with ChatGPT"}
        </button>
        <button type="button" className="review-cta" onClick={() => void copy("ask")}>
          <Copy size={15} aria-hidden="true" /> {copied === "ask" ? "Prompt copied. Paste it into ChatGPT" : "Ask ChatGPT about this business"}
        </button>
      </div>
    </section>
  );
}

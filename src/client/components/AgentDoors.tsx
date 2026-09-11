import { Bot, Copy } from "lucide-react";
import { useState } from "react";
import { askAgentPrompt, reviewPrompt } from "./reviewPrompt";

/**
 * Both ways to work with an agent, in one place under Fix: read the model this report built, or
 * let ChatGPT interview the team and file the answers here. One fold, two prompts, each copied
 * with one button; the mechanism stays behind the page.
 */
export function AgentDoors({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState<"ask" | "review" | null>(null);
  async function copy(which: "ask" | "review") {
    await navigator.clipboard.writeText(which === "ask" ? askAgentPrompt(reportId) : reviewPrompt(reportId));
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2_500);
  }
  return (
    <details className="agent-doors">
      <summary><Bot size={15} aria-hidden="true" /> Work with an agent</summary>
      <div className="agent-doors-body">
        <div className="agent-door">
          <p><b>Ask what it understood.</b> An agent reads the model this report built, through the tools on this page: what the business offers, which entities matter, which are only inferred, and what it can do here today.</p>
          <button type="button" className="review-cta" onClick={() => void copy("ask")}>
            <Copy size={15} aria-hidden="true" /> {copied === "ask" ? "Prompt copied. Paste it into ChatGPT" : "Ask ChatGPT about this business"}
          </button>
        </div>
        <div className="agent-door">
          <p><b>Let it interview your team.</b> ChatGPT asks about your business, its terminology, its entities and who owns each action, and files the answers here, in the same model.</p>
          <button type="button" className="review-cta" onClick={() => void copy("review")}>
            <Copy size={15} aria-hidden="true" /> {copied === "review" ? "Prompt copied. Paste it into ChatGPT" : "Review with ChatGPT"}
          </button>
        </div>
      </div>
    </details>
  );
}

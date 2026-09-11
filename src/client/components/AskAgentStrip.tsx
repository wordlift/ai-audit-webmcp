import { Bot, Copy } from "lucide-react";
import { useState } from "react";
import { askAgentPrompt } from "./reviewPrompt";

/**
 * The second aha the brief asks for: WordLift understood the business, and an AI agent can now use
 * that understanding. The mechanism is the page's own tools; the person never has to learn it.
 */
export function AskAgentStrip({ reportId }: { reportId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(askAgentPrompt(reportId));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_500);
  }
  return (
    <section className="ask-agent" aria-labelledby="ask-agent-title">
      <div>
        <p className="section-kicker" id="ask-agent-title"><Bot size={15} /> Try the model with an AI agent</p>
        <p>
          Ask what this business offers, which entities matter, which are only inferred, and what an agent can do here today.
          The answer comes from the model this report built, through the tools on this page. Copy the prompt and paste it into ChatGPT, or any agent with a browser.
        </p>
      </div>
      <button type="button" className="review-cta" onClick={() => void copy()}>
        <Copy size={15} aria-hidden="true" /> {copied ? "Prompt copied. Paste it into ChatGPT" : "Ask ChatGPT about this business"}
      </button>
    </section>
  );
}

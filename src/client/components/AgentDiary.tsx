import { Footprints } from "lucide-react";
import type { CapabilityEvidence, CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { actionsThatMatter } from "./FirstScreen";

/**
 * What the audit's agent actually did on the site, told as a person would tell it: searched for
 * this and got results, called that and nothing answered, looked for a way to book and found none.
 * Every line is one piece of invocation evidence, or one of the three actions that matter with
 * nothing to call. Nothing here is inferred; it is the audit's own diary, folded under the three
 * words as the proof behind them.
 */
export interface DiaryLine {
  text: string;
  tone: "did" | "failed" | "looked";
}

const quoted = (claim: string) => /"([^"]*)"/.exec(claim)?.[1];
const noteOf = (claim: string) => {
  const note = /(?:executed it|the call failed|did not answer)[^:]*: (.+)$/.exec(claim)?.[1]?.trim();
  return note ? ` (${note.replace(/\.$/, "")})` : "";
};
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

function lineFor(evidence: CapabilityEvidence, capability: CapabilityResult): DiaryLine | null {
  const { id, claim, verification } = evidence;
  if (id === "search-action-executed") {
    const query = quoted(claim);
    return { tone: "did", text: query ? `Searched the site for “${query}” and got results.` : "Searched the site and got results." };
  }
  if (id === "search-action-failed") return { tone: "failed", text: `Tried the site's search: it did not answer${noteOf(claim)}.` };
  if (id.startsWith("sidecar:")) return { tone: "did", text: `Did “${lower(capability.label)}” through WordLift's sidecar and got an answer.` };
  if (id.startsWith("mcp-endpoint-failed-")) return { tone: "failed", text: "Tried the site's MCP server: it did not answer." };
  if (id.startsWith("mcp-endpoint-")) {
    const tools = /(\d+) tools?/.exec(claim)?.[1];
    return { tone: "did", text: tools ? `Opened the site's MCP server and found ${tools} ${tools === "1" ? "tool" : "tools"} an agent can call.` : "Opened the site's MCP server and listed its tools." };
  }
  if (id.startsWith("mcp-call-failed-")) return { tone: "failed", text: `Called “${id.slice("mcp-call-failed-".length)}” on the site's MCP server: it failed${noteOf(claim)}.` };
  if (id.startsWith("mcp-call-")) return { tone: "did", text: `Called “${id.slice("mcp-call-".length)}” on the site's MCP server and it answered.` };
  if (id.startsWith("entry-point-")) {
    if (verification === "invoked") return { tone: "did", text: `Followed the site's declared way to ${lower(capability.label)}: it answered.` };
    if (verification === "failed") return { tone: "failed", text: `Followed the site's declared way to ${lower(capability.label)}: it did not answer${noteOf(claim)}.` };
  }
  return null;
}

/** The diary, most telling lines first: what answered, what did not, then what could not be found at all. */
export function agentDiary(report: ReportRecord, limit = 5): DiaryLine[] {
  const capabilities = report.capabilities ?? [];
  const seen = new Set<string>();
  const did: DiaryLine[] = [];
  const failed: DiaryLine[] = [];
  const pageTools = new Set<string>();
  for (const capability of capabilities) {
    for (const evidence of capability.evidence) {
      if (seen.has(evidence.id)) continue;
      seen.add(evidence.id);
      if (evidence.kind === "webmcp") {
        const name = quoted(evidence.claim);
        if (name) pageTools.add(name);
        continue;
      }
      const line = lineFor(evidence, capability);
      if (!line) continue;
      (line.tone === "did" ? did : failed).push(line);
    }
  }
  // A site with two addresses for one MCP server is one server that answered: the second address
  // that did not is not a failure worth a line, and the same sentence is never said twice.
  const opened = did.some((line) => line.text.startsWith("Opened the site's MCP server"));
  const distinct = (lines: DiaryLine[]) => lines.filter((line, index) => lines.findIndex((other) => other.text === line.text) === index);
  const answered = distinct(did);
  const unanswered = distinct(failed).filter((line) => !(opened && line.text === "Tried the site's MCP server: it did not answer."));
  const looked: DiaryLine[] = [];
  if (pageTools.size > 0) {
    const names = [...pageTools].slice(0, 3).map((name) => `“${name}”`).join(", ");
    looked.push({ tone: "looked", text: `Found ${pageTools.size === 1 ? "a tool" : `${pageTools.size} tools`} declared on the page for agents (${names}); a browser with WebMCP could call ${pageTools.size === 1 ? "it" : "them"}.` });
  }
  for (const capability of actionsThatMatter(capabilities)) {
    if (capability.state === "missing") looked.push({ tone: "looked", text: `Looked for a way to ${lower(capability.label)}: found nothing an agent can call.` });
    if (capability.state === "human-only") looked.push({ tone: "looked", text: `Looked for a way to ${lower(capability.label)}: found one for people, none for agents.` });
  }
  return [...answered, ...unanswered, ...looked].slice(0, limit);
}

export function AgentDiary({ report }: { report: ReportRecord }) {
  const lines = agentDiary(report);
  if (lines.length === 0) return null;
  return (
    <details className="agent-diary">
      <summary>
        <Footprints size={15} aria-hidden="true" /> What our agent actually did on your site
        <span className="diary-count">{lines.length} {lines.length === 1 ? "step" : "steps"}</span>
      </summary>
      <ul className="diary-lines" aria-label="What the agent did">
        {lines.map((line) => (
          <li key={line.text} className={`diary-${line.tone}`}>{line.text}</li>
        ))}
      </ul>
    </details>
  );
}

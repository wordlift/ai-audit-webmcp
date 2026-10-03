import { ExternalLink } from "lucide-react";
import type { ReportRecord } from "../../shared/types/index.js";

/**
 * Agent-facing surfaces, for the architect and the auditor: what this report publishes for
 * agents, what the site already publishes, and which interfaces the audit found. Every line is a
 * link to the thing itself, so "what is published to agents" is answered by reading it.
 */
export function AgentSurfaces({ report }: { report: ReportRecord }) {
  const base = `/api/reports/${report.id}`;
  const evidence = (report.capabilities ?? []).flatMap((capability) => capability.evidence);
  const mcp = [...new Set(evidence.filter((item) => item.id.startsWith("mcp-endpoint-") && item.verification === "invoked").map((item) => item.sourceUrl))];
  const pageTools = [...new Set(evidence.filter((item) => item.kind === "webmcp").map((item) => /"([^"]*)"/.exec(item.claim)?.[1]).filter((name): name is string => Boolean(name)))];
  const discovery = report.agentDiscovery;

  return (
    <section className="agent-surfaces" aria-labelledby="agent-surfaces-title">
      <p className="section-kicker">Agent-facing surfaces</p>
      <h2 id="agent-surfaces-title">What agents are given to read</h2>
      <dl className="surface-list">
        <div>
          <dt>Published from this report</dt>
          <dd>
            <a href={`${base}/publish/page.jsonld`} target="_blank" rel="noreferrer">JSON-LD for the pages <ExternalLink size={12} /></a>
            <a href={`${base}/publish/skill.md`} target="_blank" rel="noreferrer">Terms of Action, the skill agents load <ExternalLink size={12} /></a>
            <a href={`${base}/publish/ai-catalog.json`} target="_blank" rel="noreferrer">Discovery catalog <ExternalLink size={12} /></a>
            <a href={`${base}/publish`} target="_blank" rel="noreferrer">The one model behind all three <ExternalLink size={12} /></a>
          </dd>
        </div>
        <div>
          <dt>Per-action contracts</dt>
          <dd><span>JSON-LD for each action at <code>{base}/contracts/&lt;actionId&gt;</code>, linked from every action above.</span></dd>
        </div>
        <div>
          <dt>Discovery on the site today</dt>
          <dd>
            <span>
              Catalog: {discovery?.catalog === "found" ? "published" : discovery?.catalog === "missing" ? "not published" : "not checked"}
              {discovery?.catalogUrl ? <> at <a href={discovery.catalogUrl} target="_blank" rel="noreferrer">{discovery.catalogUrl}</a></> : null}
            </span>
            <span>
              Agent instructions: {discovery?.memory === "found" ? "published" : discovery?.memory === "missing" ? "not published" : "not checked"}
              {discovery?.memoryUrl ? <> at <a href={discovery.memoryUrl} target="_blank" rel="noreferrer">{discovery.memoryUrl}</a></> : null}
            </span>
          </dd>
        </div>
        <div>
          <dt>Interfaces the audit called</dt>
          <dd>
            {mcp.length === 0 && pageTools.length === 0 && <span>No MCP server answered and no in-page tool was declared.</span>}
            {mcp.map((url) => <span key={url}>MCP server: <a href={url} target="_blank" rel="noreferrer">{url}</a></span>)}
            {pageTools.length > 0 && <span>In-page tools declared for agents (WebMCP): {pageTools.join(", ")}</span>}
          </dd>
        </div>
      </dl>
    </section>
  );
}

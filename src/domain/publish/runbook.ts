import type { Publication } from "../../shared/types/activate.js";
import { ARD } from "./ardSchema.js";

/**
 * Where each document lives once it is on the site. The catalog's path is the one registries read;
 * the skill sits beside it so the catalog can point at the site's own copy; llms.txt is read at the
 * root by convention; the JSON-LD goes into the entry page's head.
 */
export const SITE_PATHS = {
  catalog: ARD.path,
  skill: "/.well-known/terms-of-action.md",
  llms: "/llms.txt",
} as const;

export interface RunbookOptions {
  /** Where the audit runs, for the verification step: a fresh read of the site through the API. */
  serviceUrl: string;
}

/**
 * The catalog as the site should serve it: the skill entry points at the site's own copy of the
 * skill, not at ours. Everything else is the published catalog as is.
 */
export function catalogForSite(publication: Publication): Publication["catalog"] {
  const own = `${publication.site}${SITE_PATHS.skill}`;
  return {
    ...publication.catalog,
    entries: publication.catalog.entries.map((entry) =>
      entry && typeof entry === "object" && (entry as { url?: string }).url === publication.documents.skill ? { ...(entry as object), url: own } : entry,
    ),
  };
}

const fence = (language: string, body: string) => ["```" + language, body, "```"].join("\n");

/**
 * The runbook: what an agent does to put the publication on the site, written for Claude Code or
 * Codex to apply on any stack and for a person to read. It deploys exactly what the publication
 * holds — what the audit verified and the owner confirmed — and nothing derived from the pages.
 * The last step is the only proof that counts: the site read again, and the three readings agreeing.
 */
export function runbookMarkdown(publication: Publication, options: RunbookOptions): string {
  const { host, site, documents } = publication;
  const usable = publication.actions.filter((action) => action.publishedAs === "action");
  const handoffs = publication.actions.filter((action) => action.publishedAs === "handoff");
  const catalogUrl = `${options.serviceUrl}/api/reports/${publication.reportId}/publish/site-catalog.json`;
  const lines: string[] = [];
  lines.push(
    `# Activate ${host}: put the published documents on the site`,
    "",
    `Written for an agent with access to the site's code or hosting (Claude Code, Codex, or a person at a terminal). It publishes four documents WordLift AI Audit compiled from ${host} on ${publication.publishedAt.slice(0, 10)}: what the site declares, and what its owner confirmed (${publication.decided} ${publication.decided === 1 ? "decision" : "decisions"}). Nothing here was derived from the pages alone, and no action is published as working unless an agent's call to it answered during the audit.`,
    "",
    `Report: ${publication.reportUrl}`,
    "",
    "## What goes where",
    "",
    "| Document | Fetch it from | Put it at |",
    "|---|---|---|",
    `| Discovery catalog (ARD) | ${catalogUrl} | \`${SITE_PATHS.catalog}\` |`,
    `| Terms of Action (the skill agents load) | ${documents.skill} | \`${SITE_PATHS.skill}\` |`,
    `| llms.txt | ${documents.llms} | \`${SITE_PATHS.llms}\` |`,
    `| Business data (JSON-LD) | ${documents.pageJsonLd} | the \`<head>\` of \`${site}/\` |`,
    "",
    "Fetch each document with a plain GET; none needs a credential. Keep the bytes as served except where a step below says to merge. The site-catalog variant above already points its skill entry at the site's own copy; do not use the catalog under the report, whose skill entry points back at WordLift.",
    "",
    "## Steps",
    "",
    "1. **Find where static files are served from.** The three files must answer at the paths above on the site's own origin, with these content types: `application/json` for the catalog, `text/markdown` for the skill, `text/plain` for llms.txt. A framework route, a public folder, a CDN rule or a rewrite to a static host all work; a redirect to another origin does not count as serving it.",
    `2. **Serve the catalog** at \`${SITE_PATHS.catalog}\`. If the site already serves a catalog there, merge: keep the existing entries and add these; an entry with the same \`identifier\` is replaced.`,
    `3. **Serve the skill** at \`${SITE_PATHS.skill}\`, and **llms.txt** at \`${SITE_PATHS.llms}\`. If an llms.txt already exists, keep it and append this one's sections under a heading \`## From WordLift AI Audit\`; do not rewrite the owner's own text.`,
    `4. **Add the JSON-LD to the entry page** (\`${site}/\`). Fetch the document; it is one \`<script type="application/ld+json">\` block with an \`@graph\`. If the page already carries JSON-LD for the same \`@id\`s, merge node by node: keep the page's own properties, add \`potentialAction\` entries that are not there yet, and never remove anything. Otherwise add the block as a new script element before \`</head>\`.`,
    "5. **Declare the catalog on the page and in robots.txt**, so a reader that does not guess the well-known path still finds it:",
    "",
    fence("html", `<link rel="ai-catalog" href="${SITE_PATHS.catalog}">`),
    "",
    fence("text", `Agentmap: ${site}${SITE_PATHS.catalog}`),
    "",
    "6. **Verify from outside.** Each of these must answer 200 from the public internet, with the content type above:",
    "",
    fence("bash", [`curl -sI ${site}${SITE_PATHS.catalog} | head -1`, `curl -sI ${site}${SITE_PATHS.skill} | head -1`, `curl -sI ${site}${SITE_PATHS.llms} | head -1`, `curl -s ${site}/ | grep -c 'application/ld+json'`].join("\n")),
    "",
    `7. **Prove it.** Read the site again through the audit, so the three readings agree: what the page declares, what the catalog registers, and what an agent could call. A new report is created; compare it with ${publication.reportUrl}.`,
    "",
    fence("bash", `curl -s -X POST ${options.serviceUrl}/api/reports -H 'content-type: application/json' \\\n  -d '{"requestId":"<a new uuid>","url":"${site}/","fresh":true}'`),
    "",
    "The new report's Activate page shows the documents as read from the site. A document that is missing or differs from what was published is listed there by name.",
    "",
    "## What this publishes, and what it does not",
    "",
  );
  if (usable.length > 0) {
    lines.push("Actions published as callable, because an agent's call answered during the audit:", "");
    for (const action of usable) lines.push(`- ${action.label} (\`${action.actionId}\`)${action.entryPoint ? ` — ${action.entryPoint.protocol} at ${action.entryPoint.url}` : ""}`);
    lines.push("");
  } else {
    lines.push("No action is published as callable: none of the site's interfaces answered an agent's call during the audit. The catalog and the skill still say what the business is and who runs each action, which is what an agent needs before it can ask.", "");
  }
  if (handoffs.length > 0) {
    lines.push("Actions published as a handoff to a partner, as the owner decided:", "");
    for (const action of handoffs) lines.push(`- ${action.label} (\`${action.actionId}\`)${action.provider?.name ? ` → ${action.provider.name}${action.provider.url ? ` (${action.provider.url})` : ""}` : ""}`);
    lines.push("");
  }
  lines.push(
    "Do not add tools, endpoints or actions that are not in these documents, even where the site's pages suggest them: a form is not an interface an agent may call, and a button is not a capability. Do not mark anything as working. If something here is wrong, the place to change it is the report's review, not the files.",
    "",
    `Questions, or a site where these paths cannot be served: https://wordlift.io/book-a-demo/?source=ai-audit&report=${publication.reportId}`,
    "",
  );
  return lines.join("\n");
}

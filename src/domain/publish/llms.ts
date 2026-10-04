import { entityRole } from "../../shared/format/businessModel.js";
import { modelView, typeLabel } from "../../shared/format/modelView.js";
import type { PublishedAction } from "../../shared/types/activate.js";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { ARD } from "./ardSchema.js";

export interface LlmsOptions {
  origin: string;
  host: string;
  reportUrl: string;
  documents: { pageJsonLd: string; skill: string; catalog: string };
}

const bullet = (name: string, url: string | undefined, note?: string) => `- ${url ? `[${name}](${url})` : name}${note ? `: ${note}` : ""}`;

/** The page a thing is about on the site, when the site has one: the page it was read from. */
function pageOf(entity: DomainEntity, origin: string): string | undefined {
  const own = entity.sourceUrls.find((url) => url.startsWith(origin));
  return own ?? entity.sourceUrls[0];
}

/**
 * llms.txt, from the same model as the other documents: what the business is, what it offers and where,
 * each linked to its own page, what an agent can actually do here, and where the Terms of Action, the
 * catalog and the business data are. Like the JSON-LD and the skill, it publishes only what the site
 * declares or its owner confirmed: a thing read from the text alone is a candidate, never a published
 * fact. An action is listed only where an agent's call answered.
 */
export function llmsText(report: ReportRecord, entities: DomainEntity[], actions: PublishedAction[], options: LlmsOptions): string {
  const kept = new Set(entities.map((entity) => entity.id));
  // The sentence is built from the publishable model alone, so it says nothing the file may not publish.
  const publishable: ReportRecord = {
    ...report,
    ...(report.contextGraph
      ? {
          contextGraph: {
            ...report.contextGraph,
            entities,
            relations: (report.contextGraph.relations ?? []).filter((relation) => relation.provenance !== "inferred" && kept.has(relation.from) && kept.has(relation.to)),
          },
        }
      : {}),
  };
  const view = modelView(publishable);
  const entry = report.contextGraph?.pages.find((page) => page.role === "entry") ?? report.contextGraph?.pages[0];
  const title = view.business?.name ?? entities.find((entity) => entity.types.includes("WebSite"))?.name ?? entry?.title ?? options.host;
  const summary = view.sentence ?? entry?.description ?? `The website ${options.host}.`;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  const lines: string[] = [`# ${title}`, "", `> ${summary.replace(/\s+/g, " ").trim()}`, ""];
  if (entry?.description && entry.description.trim() !== summary.trim()) lines.push(entry.description.replace(/\s+/g, " ").trim(), "");
  lines.push(
    `This file is published from the site's Context Engine by WordLift AI Audit. It lists what ${options.host} declares or its owner confirmed. An action appears under "What an agent can do" only after an agent's call to it answered.`,
    "",
  );

  const callable = actions.filter((action) => action.publishedAs === "action" && action.entryPoint);
  lines.push("## What an agent can do");
  if (callable.length === 0) {
    lines.push(bullet("Nothing an agent can call has answered yet", options.reportUrl, "the report says what was tried and what is missing"));
  } else {
    for (const action of callable) {
      const entryPoint = action.entryPoint!;
      const how = `${entryPoint.protocol === "mcp" ? `MCP tool${entryPoint.tool ? ` ${entryPoint.tool}` : ""}` : `${entryPoint.httpMethod} ${entryPoint.protocol.toUpperCase()}`}${entryPoint.via === "sidecar" ? ", run by WordLift" : ""}`;
      lines.push(bullet(action.label, entryPoint.urlTemplate ?? entryPoint.url, how));
    }
  }
  const handoffs = actions.filter((action) => action.publishedAs === "handoff" && action.provider);
  for (const action of handoffs) lines.push(bullet(action.label, action.provider!.url, `handled by ${action.provider!.name}`));
  lines.push("");

  lines.push(
    "## How to act here",
    bullet("Terms of Action", options.documents.skill, "who runs each action, the business's boundaries and vocabulary; load it before acting"),
    bullet("Agent catalog", `${options.origin}${ARD.path}`, "the capabilities this site publishes for agent registries"),
    bullet("Business data", options.documents.pageJsonLd, "the entities and actions as schema.org JSON-LD"),
    "",
  );

  const offerings = view.offerings.map((item) => byId.get(item.id)).filter((entity): entity is DomainEntity => Boolean(entity));
  if (offerings.length > 0) {
    lines.push("## What it offers", ...offerings.slice(0, 20).map((entity) => bullet(entity.name, pageOf(entity, options.origin), typeLabel(entity.types[0]))), "");
  }
  const places = entities.filter((entity) => entityRole(entity) === "place");
  if (places.length > 0) {
    lines.push("## Where", ...places.slice(0, 12).map((entity) => bullet(entity.name, pageOf(entity, options.origin))), "");
  }

  lines.push("## Optional", bullet("AI Audit report", options.reportUrl, "the evidence behind every line above, and when it was checked"), "");
  return lines.join("\n");
}

import { entityRole, RELATION_PHRASES } from "../../shared/format/businessModel.js";
import type { DomainEntity, ReportRecord } from "../../shared/types/index.js";
import { entityKey } from "./contextEngine.js";

const MAX_NAMES = 5;
const MODEL_ROLES = new Set(["business", "offering", "place"]);

function kept(report: ReportRecord | null): Map<string, DomainEntity> {
  const byKey = new Map<string, DomainEntity>();
  for (const entity of report?.contextGraph?.entities ?? []) {
    if (entity.humanPriority === "demoted" || !MODEL_ROLES.has(entityRole(entity))) continue;
    const key = entityKey(entity);
    const existing = byKey.get(key);
    // One name, one thing: the declared sighting speaks for it when both exist.
    if (!existing || (existing.origin === "inferred" && entity.origin !== "inferred")) byKey.set(key, entity);
  }
  return byKey;
}

function declaredRelations(report: ReportRecord | null): Map<string, string> {
  const entities = new Map((report?.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted").map((entity) => [entity.id, entity]));
  const relations = new Map<string, string>();
  for (const relation of report?.contextGraph?.relations ?? []) {
    if (relation.provenance !== "declared") continue;
    const from = entities.get(relation.from);
    const to = entities.get(relation.to);
    if (!from || !to) continue;
    relations.set(`${entityKey(from)} ${relation.kind} ${entityKey(to)}`, `${from.name} ${RELATION_PHRASES[relation.kind]} ${to.name}`);
  }
  return relations;
}

const names = (items: string[]) => (items.length > MAX_NAMES ? `${items.slice(0, MAX_NAMES).join(", ")} and ${items.length - MAX_NAMES} more` : items.join(", "));
const matters = (entity: DomainEntity) => entity.origin !== "inferred" || entity.humanPriority === "primary";

/**
 * What moved in the model of a site between two reads, said plainly: what the site now declares,
 * what matters that is gone, what slipped from declared to only written, and which declared
 * connections appeared or went. The extractor reads text differently from one day to the next, so
 * a thing only inferred is news only when a person said it matters; everything declared is news.
 */
export function contextDrift(previous: ReportRecord | null, current: ReportRecord): string[] {
  if (!previous?.contextGraph || !current.contextGraph) return [];
  const before = kept(previous);
  const after = kept(current);
  const lines: string[] = [];

  const declaredNow = [...after].filter(([, entity]) => entity.origin !== "inferred");
  const newlyDeclared = declaredNow.filter(([key]) => !before.has(key)).map(([, entity]) => entity.name);
  const promoted = declaredNow.filter(([key]) => before.get(key)?.origin === "inferred").map(([, entity]) => entity.name);
  if (newlyDeclared.length > 0) lines.push(`The site now declares ${names(newlyDeclared)}.`);
  if (promoted.length > 0) lines.push(`${names(promoted)} ${promoted.length === 1 ? "was" : "were"} only in the text and ${promoted.length === 1 ? "is" : "are"} declared now.`);

  const gone = [...before].filter(([key, entity]) => matters(entity) && !after.has(key)).map(([, entity]) => entity.name);
  if (gone.length > 0) lines.push(`${names(gone)} ${gone.length === 1 ? "is" : "are"} no longer found on the pages read.`);

  const slipped = [...before].filter(([key, entity]) => entity.origin !== "inferred" && after.get(key)?.origin === "inferred").map(([, entity]) => entity.name);
  if (slipped.length > 0) lines.push(`${names(slipped)} ${slipped.length === 1 ? "is" : "are"} no longer declared: agents can only find ${slipped.length === 1 ? "it" : "them"} in the text now.`);

  const relationsBefore = declaredRelations(previous);
  const relationsAfter = declaredRelations(current);
  const added = [...relationsAfter].filter(([key]) => !relationsBefore.has(key)).map(([, phrase]) => phrase);
  const removed = [...relationsBefore].filter(([key]) => !relationsAfter.has(key)).map(([, phrase]) => phrase);
  if (added.length > 0) lines.push(`The markup now says: ${names(added)}.`);
  if (removed.length > 0) lines.push(`The markup no longer says: ${names(removed)}.`);
  return lines;
}

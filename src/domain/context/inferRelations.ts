import type { SitePageSnapshot } from "../../server/adapters/scrape/ScrapeProvider.js";
import { entityRole, type EntityRole } from "../../shared/format/businessModel.js";
import type { DomainEntity, EntityRelation } from "../../shared/types/index.js";

const MAX_INFERRED = 40;
const MAX_SENTENCE = 400;
const MAX_GAP = 48;
const MIN_NAME = 3;

type Kind = EntityRelation["kind"];

/**
 * The words that may stand between two names for a relation to be read, and nothing else may.
 * "AlpiNest offers Samspitze 4", "Samspitze 4 in Mariapfarr", "Samspitze 4, run by AlpiNest". A
 * sentence that says more between the names says something this pass does not claim to read.
 */
const LEAD = String.raw`^[\s,–—-]*(?:(?:is|are|also|all)\s+)*`;
const TAIL = String.raw`(?:\s+(?:the|a|an|its|our|their))?[\s:,–—-]*$`;
const OFFERS = new RegExp(`${LEAD}(?:offers?|provides?|rents?(?:\\s+out)?|sells?|operates?|runs|manages?|presents?)${TAIL}`, "i");
// One plain adjective may sit between "in" and the place: "in sunny Mariapfarr".
const LOCATED_IN = new RegExp(`${LEAD}(?:(?:located|situated|based|set|nestled)\\s+)?(?:in|at)(?:\\s+[a-z]{3,12})?${TAIL}`, "i");
// "Mariapfarr, Lungau": a place named after a place, the way an address says it.
const APPOSITION = /^\s*,\s*$/;
const PROVIDED_BY = new RegExp(`${LEAD}(?:(?:offered|provided|operated|run|managed|sold|rented)\\s+)?by${TAIL}`, "i");

/** Which kinds a pair of roles may hold, and the words each needs between them. */
const RULES: Array<{ from: EntityRole[]; to: EntityRole[]; kind: Kind; words: RegExp }> = [
  { from: ["business"], to: ["offering"], kind: "offers", words: OFFERS },
  { from: ["business", "offering", "place"], to: ["place"], kind: "located-in", words: LOCATED_IN },
  { from: ["place"], to: ["place"], kind: "located-in", words: APPOSITION },
  { from: ["offering"], to: ["business"], kind: "provided-by", words: PROVIDED_BY },
];

interface Mention {
  entity: DomainEntity;
  role: EntityRole;
  start: number;
  end: number;
}

function sentencesOf(text: string): string[] {
  return text
    // A page's blocks often arrive glued ("base.Introduction"): a stop before a capital ends a sentence too.
    .split(/(?<=[.!?])\s+|(?<=[a-z0-9][.!?])(?=[A-Z])|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 0 && sentence.length <= MAX_SENTENCE);
}

const isWordChar = (char: string | undefined) => Boolean(char && /[\p{L}\p{N}]/u.test(char));
const isUpper = (char: string | undefined) => Boolean(char && /\p{Lu}/u.test(char));

/**
 * Whether a name stands alone where it was found. Glued blocks ("IntroductionSamspitze 4",
 * "Samspitze 4Two-bedroom") still count when the join is a change to a capital; a name inside a
 * longer word never does.
 */
function standsAlone(sentence: string, start: number, end: number): boolean {
  const before = sentence[start - 1];
  const after = sentence[end];
  const leftOk = !isWordChar(before) || (isUpper(sentence[start]) && !isUpper(before));
  const rightOk = !isWordChar(after) || (isUpper(after) && !isUpper(sentence[end - 1]));
  return leftOk && rightOk;
}

/** Where each known name stands in a sentence, whole words only, the longest name winning an overlap. */
function mentionsIn(sentence: string, entities: Array<{ entity: DomainEntity; role: EntityRole }>): Mention[] {
  const lower = sentence.toLowerCase();
  const found: Mention[] = [];
  for (const { entity, role } of entities) {
    const name = entity.name.toLowerCase();
    let from = 0;
    for (;;) {
      const start = lower.indexOf(name, from);
      if (start < 0) break;
      const end = start + name.length;
      // "Mariapfarr's region" is about the region, not Mariapfarr: a possessive is not a mention.
      const possessive = /^['’]s\b/i.test(sentence.slice(end, end + 3));
      if (standsAlone(sentence, start, end) && !possessive) found.push({ entity, role, start, end });
      from = end;
    }
  }
  found.sort((left, right) => left.start - right.start || right.end - left.end);
  const kept: Mention[] = [];
  for (const mention of found) {
    const last = kept[kept.length - 1];
    if (last && mention.start < last.end) continue;
    kept.push(mention);
  }
  return kept;
}

const LIST_GAP = /^\s*(?:,|and|&|or|,\s*and)\s*$/i;

/** Whether the pair at `index` sits among more places joined like a list, or runs on into one. */
function inAList(sentence: string, mentions: Mention[], index: number): boolean {
  const before = mentions[index - 1];
  const left = mentions[index]!;
  const right = mentions[index + 1]!;
  const after = mentions[index + 2];
  if (before?.role === "place" && LIST_GAP.test(sentence.slice(before.end, left.start))) return true;
  if (after?.role === "place" && LIST_GAP.test(sentence.slice(right.end, after.start))) return true;
  return /^\s*(?:,\s*)?(?:and|&|or)\b/i.test(sentence.slice(right.end));
}

/**
 * Relations read from the pages' text, and only where the text says them plainly: two entities the
 * graph already holds, named next to each other in one sentence on a page they were both found on,
 * with only the words for an allowed kind between them. Each is kept with its sentence and marked
 * inferred, never evidence, never published; a review confirms or rejects it. A relation the markup
 * already declares is not read again.
 */
export function inferRelations(pages: SitePageSnapshot[], entities: DomainEntity[], declared: EntityRelation[]): EntityRelation[] {
  const known = new Set(declared.map((relation) => `${relation.from}|${relation.kind}|${relation.to}`));
  const relations: EntityRelation[] = [];
  for (const page of pages) {
    const onPage = entities
      .filter((entity) => entity.sourceUrls.includes(page.url) && entity.name.length >= MIN_NAME)
      .map((entity) => ({ entity, role: entityRole(entity) }))
      .filter(({ role }) => role === "business" || role === "offering" || role === "place");
    if (onPage.length < 2) continue;
    for (const sentence of sentencesOf(page.text)) {
      const mentions = mentionsIn(sentence, onPage);
      for (let index = 0; index + 1 < mentions.length; index += 1) {
        const left = mentions[index]!;
        const right = mentions[index + 1]!;
        if (left.entity.id === right.entity.id) continue;
        const gap = sentence.slice(left.end, right.start);
        if (gap.length > MAX_GAP) continue;
        const rule = RULES.find((candidate) => candidate.from.includes(left.role) && candidate.to.includes(right.role) && candidate.words.test(gap));
        if (!rule) continue;
        // "Mariapfarr, Lungau" is an address; "Mariapfarr, Tamsweg and Mauterndorf" is a list of equals.
        if (rule.words === APPOSITION && inAList(sentence, mentions, index)) continue;
        const key = `${left.entity.id}|${rule.kind}|${right.entity.id}`;
        if (known.has(key)) continue;
        known.add(key);
        relations.push({
          from: left.entity.id,
          to: right.entity.id,
          kind: rule.kind,
          provenance: "inferred",
          sourceUrl: page.url,
          evidence: sentence.slice(0, 300),
        });
        if (relations.length >= MAX_INFERRED) return relations;
      }
    }
  }
  return relations;
}

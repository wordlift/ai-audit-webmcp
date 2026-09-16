import { createHash } from "node:crypto";
import type {
  ContextEngine,
  ContextEngineView,
  EngineDecisions,
  EngineRole,
  EngineSnapshot,
} from "../../shared/schemas/contextEngine.js";
import { entityRole } from "../../shared/format/businessModel.js";
import type { DomainEntity, HumanAssertion, ReportRecord } from "../../shared/types/index.js";

const MAX_SNAPSHOTS = 20;
const MAX_KEYS = 80;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function reportHost(report: ReportRecord): string {
  return hostOf(report.canonicalUrl ?? report.requestedUrl);
}

/**
 * What identifies an entity across two reads of the same site: the audit mints ids per read for
 * what it infers, so the key is the name as a person would write it, and the role it plays. Two
 * things of the same name and role on one site are one thing to the engine; that is the price of
 * a decision surviving a new read, and a review can always demote the wrong one.
 */
export function entityKey(entity: Pick<DomainEntity, "name" | "types">): string {
  const name = entity.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${name}|${entityRole(entity as DomainEntity)}`;
}

export function emptyDecisions(): EngineDecisions {
  return { entities: [], actions: [], terminology: [] };
}

export function newEngine(id: string, host: string, at: string): ContextEngine {
  return {
    id,
    host,
    status: "draft",
    owner: { state: "unverified" },
    pending: [],
    reviewTokens: [],
    decisions: emptyDecisions(),
    snapshots: [],
    createdAt: at,
    updatedAt: at,
  };
}

/** What a read of the site said, kept small: the things, how they connect, what an agent could do. */
export function snapshotOf(report: ReportRecord, kind: EngineSnapshot["kind"]): EngineSnapshot {
  const entities = (report.contextGraph?.entities ?? []).filter((entity) => entity.humanPriority !== "demoted");
  const names = new Map(entities.map((entity) => [entity.id, entity]));
  const relations = (report.contextGraph?.relations ?? [])
    .filter((relation) => names.has(relation.from) && names.has(relation.to))
    .map((relation) => `${entityKey(names.get(relation.from)!)} ${relation.kind} ${entityKey(names.get(relation.to)!)}`);
  return {
    reportId: report.id,
    at: report.completedAt ?? report.createdAt,
    kind,
    ...(report.score ? { score: Math.round(report.score.value) } : {}),
    entities: [...new Set(entities.map(entityKey))].slice(0, MAX_KEYS),
    relations: [...new Set(relations)].slice(0, MAX_KEYS),
    agentReady: (report.capabilities ?? []).filter((capability) => capability.expected && capability.state === "agent-ready").map((capability) => capability.actionId).slice(0, MAX_KEYS),
  };
}

export function snapshotKind(report: ReportRecord): EngineSnapshot["kind"] {
  if (report.refinement?.carried) return "carried";
  if (report.refinement) return "review";
  if (report.parentReportId) return "revision";
  return "audit";
}

/** Adds a read to the engine, newest last, once per report, and moves the pointers forward. */
export function withSnapshot(engine: ContextEngine, report: ReportRecord, at: string): ContextEngine {
  const snapshot = snapshotOf(report, snapshotKind(report));
  const snapshots = [...engine.snapshots.filter((existing) => existing.reportId !== report.id), snapshot]
    .sort((left, right) => left.at.localeCompare(right.at))
    .slice(-MAX_SNAPSHOTS);
  const latest = snapshots[snapshots.length - 1]!;
  const reviewed = [...snapshots].reverse().find((entry) => entry.kind === "review" || entry.kind === "carried");
  return {
    ...engine,
    snapshots,
    latestReportId: latest.reportId,
    ...(reviewed ? { latestReviewedReportId: reviewed.reportId } : {}),
    updatedAt: at,
  };
}

/**
 * A review's assertions as decisions the engine keeps: entities by key rather than by the ids of
 * the report they were made on, so the next read of the site finds them again.
 */
export function decisionsFrom(assertions: HumanAssertion, parent: ReportRecord, by: EngineRole, at: string): EngineDecisions {
  const entities = new Map((parent.contextGraph?.entities ?? []).map((entity) => [entity.id, entity]));
  const entityDecisions: EngineDecisions["entities"] = [];
  for (const [ids, decision] of [
    [assertions.primaryEntityIds, "primary"],
    [assertions.demotedEntityIds, "demoted"],
  ] as const) {
    for (const id of ids ?? []) {
      const entity = entities.get(id);
      if (entity) entityDecisions.push({ key: entityKey(entity), name: entity.name.slice(0, 300), decision, by, at });
    }
  }
  const relations = (assertions.relationDecisions ?? []).flatMap((decision) => {
    const from = entities.get(decision.from);
    const to = entities.get(decision.to);
    return from && to ? [{ key: `${entityKey(from)} ${decision.kind} ${entityKey(to)}`, decision: decision.decision, by, at }] : [];
  });
  return {
    ...(assertions.businessRole ? { businessRole: { value: assertions.businessRole, by, at } } : {}),
    ...(relations.length > 0 ? { relations } : {}),
    entities: entityDecisions,
    actions: (assertions.actionDecisions ?? []).map((decision) => ({ ...decision, by, at })),
    terminology: (assertions.terminology ?? []).map((entry) => ({ ...entry, by, at })),
  };
}

/** The later decision about the same thing wins; an owner's word is never overwritten by a reviewer's. */
export function mergeDecisions(current: EngineDecisions, next: EngineDecisions): EngineDecisions {
  const keep = <T extends { by: EngineRole }>(existing: T | undefined, incoming: T): T =>
    existing && existing.by === "owner" && incoming.by === "reviewer" ? existing : incoming;
  const merge = <T extends { by: EngineRole }>(left: T[], right: T[], keyOf: (item: T) => string, max: number): T[] => {
    const byKey = new Map(left.map((item) => [keyOf(item), item]));
    for (const item of right) byKey.set(keyOf(item), keep(byKey.get(keyOf(item)), item));
    return [...byKey.values()].slice(-max);
  };
  const businessRole = next.businessRole ? keep(current.businessRole, next.businessRole) : current.businessRole;
  const relations = merge(current.relations ?? [], next.relations ?? [], (item) => item.key, 80);
  return {
    ...(businessRole ? { businessRole } : {}),
    ...(relations.length > 0 ? { relations } : {}),
    entities: merge(current.entities, next.entities, (item) => item.key, 120),
    actions: merge(current.actions, next.actions, (item) => item.actionId, 80),
    terminology: merge(current.terminology, next.terminology, (item) => item.term.toLowerCase(), 40),
  };
}

export function decisionCount(decisions: EngineDecisions): number {
  return (decisions.businessRole ? 1 : 0) + decisions.entities.length + decisions.actions.length + decisions.terminology.length + (decisions.relations?.length ?? 0);
}

/**
 * The engine's decisions as assertions about one report: entities found again by key, actions the
 * report still has. What the new read no longer holds is left out, never invented.
 */
export function assertionsFor(report: ReportRecord, decisions: EngineDecisions): HumanAssertion | null {
  const byKey = new Map<string, string[]>();
  for (const entity of report.contextGraph?.entities ?? []) {
    const key = entityKey(entity);
    byKey.set(key, [...(byKey.get(key) ?? []), entity.id]);
  }
  const idsFor = (decision: "primary" | "demoted") =>
    [...new Set(decisions.entities.filter((entry) => entry.decision === decision).flatMap((entry) => byKey.get(entry.key) ?? []))].slice(0, 80);
  const actionIds = new Set((report.capabilities ?? []).map((capability) => capability.actionId));
  const primaryEntityIds = idsFor("primary");
  const demotedEntityIds = idsFor("demoted").filter((id) => !primaryEntityIds.includes(id));
  const actionDecisions = decisions.actions
    .filter((decision) => actionIds.has(decision.actionId))
    .map(({ by: _by, at: _at, ...decision }) => decision);
  const terminology = decisions.terminology.map(({ term, meaning }) => ({ term, meaning }));
  const entitiesById = new Map((report.contextGraph?.entities ?? []).map((entity) => [entity.id, entity]));
  const relationVerdicts = new Map((decisions.relations ?? []).map((entry) => [entry.key, entry.decision]));
  const relationDecisions = (report.contextGraph?.relations ?? []).flatMap((relation) => {
    const from = entitiesById.get(relation.from);
    const to = entitiesById.get(relation.to);
    const verdict = from && to ? relationVerdicts.get(`${entityKey(from)} ${relation.kind} ${entityKey(to)}`) : undefined;
    return verdict ? [{ from: relation.from, kind: relation.kind, to: relation.to, decision: verdict }] : [];
  });
  const assertions: HumanAssertion = {
    ...(decisions.businessRole ? { businessRole: decisions.businessRole.value } : {}),
    ...(primaryEntityIds.length > 0 ? { primaryEntityIds } : {}),
    ...(demotedEntityIds.length > 0 ? { demotedEntityIds } : {}),
    ...(actionDecisions.length > 0 ? { actionDecisions } : {}),
    ...(terminology.length > 0 ? { terminology } : {}),
    ...(relationDecisions.length > 0 ? { relationDecisions: relationDecisions.slice(0, 80) } : {}),
  };
  return Object.keys(assertions).length > 0 ? assertions : null;
}

/** The value the site carries to prove it is the claimant's: derived from the engine and the key, never the key. */
export function verificationCode(engineId: string, keyHash: string): string {
  return `wl-${createHash("sha256").update(`${engineId}:${keyHash}`).digest("base64url").slice(0, 32)}`;
}

/** Whether a page carries the code in its meta tag, or a well-known file carries it as its text. */
export function carriesCode(body: string, code: string, where: "meta-tag" | "well-known"): boolean {
  if (where === "well-known") return body.trim().split(/\s+/).includes(code);
  const pattern = /<meta\b[^>]*>/gi;
  for (const tag of body.match(pattern) ?? []) {
    if (/name\s*=\s*["']?wordlift-site-verification["']?/i.test(tag) && new RegExp(`content\\s*=\\s*["']?${code}["']?`).test(tag)) return true;
  }
  return false;
}

export function engineView(engine: ContextEngine): ContextEngineView {
  const { decisions } = engine;
  const all = [
    ...(decisions.businessRole ? [decisions.businessRole] : []),
    ...(decisions.relations ?? []),
    ...decisions.entities,
    ...decisions.actions,
    ...decisions.terminology,
  ];
  return {
    id: engine.id,
    host: engine.host,
    status: engine.status,
    owner: engine.owner,
    claimed: Boolean(engine.claim),
    ...(engine.latestReportId ? { latestReportId: engine.latestReportId } : {}),
    ...(engine.latestReviewedReportId ? { latestReviewedReportId: engine.latestReviewedReportId } : {}),
    decisions: {
      total: all.length,
      byOwner: all.filter((decision) => decision.by === "owner").length,
      entities: decisions.entities.length,
      actions: decisions.actions.length,
      terminology: decisions.terminology.length + (decisions.businessRole ? 1 : 0),
    },
    snapshots: engine.snapshots,
    ...(engine.activeAt ? { activeAt: engine.activeAt } : {}),
    updatedAt: engine.updatedAt,
  };
}

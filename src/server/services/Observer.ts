import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { ActivationCount, DayVisits } from "../adapters/visits/VisitStore.js";
import type { DeepScanLead, LeadDelivery, LeadStore } from "../adapters/leads/index.js";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import type { AuditOrchestrator } from "./AuditOrchestrator.js";
import type { VisitLedger } from "./VisitLedger.js";

/**
 * The number that comes to you. A site whose owner gave a deep-scan address is read again on a
 * cadence bounded by the number of such addresses, and a short note goes out only when something
 * moved: the score, a capability that stopped answering and why, one that started, the first
 * crawler, Google's first verified read, an agent's failed activation. Never on a timer alone.
 * One link stops the notes and the re-reads together; the report stays where it is.
 */
export interface ObserveOptions {
  /** Days between two reads of the same site. Zero disables the cadence entirely. */
  intervalDays: number;
  /** How often the due list is checked from inside the process. Zero leaves it to a scheduler calling the tick endpoint. */
  tickMinutes?: number;
  /** The token a scheduler presents to call the tick endpoint. Absent, the endpoint refuses everyone. */
  tickToken?: string;
  /** How many sites one check may re-read: the bound on cost per tick. */
  perTick?: number;
}

export interface ObserverDependencies extends ObserveOptions {
  orchestrator: AuditOrchestrator;
  leads: LeadStore;
  delivery: LeadDelivery;
  visits?: VisitLedger;
  now?: () => Date;
  log?: (event: string, ...details: unknown[]) => void;
  /** How long a re-read may take before this tick gives up on it. */
  auditTimeoutMs?: number;
}

export interface Ledger {
  days: DayVisits[];
  activations: ActivationCount[];
}

export interface Movement {
  lines: string[];
  seenCrawler: boolean;
  seenGoogle: boolean;
}

export type WatchOutcome = "sent" | "unchanged" | "skipped" | "failed";

const DAY_MS = 24 * 60 * 60 * 1_000;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

/** The reason a capability gives for no longer answering: its failed evidence, in the audit's words. */
function whyItStopped(capability: CapabilityResult | undefined): string {
  const failed = capability?.evidence.find((item) => item.verification === "failed" && item.audience === "agent");
  if (failed) return failed.claim.replace(/^The site's declared /, "the site's declared ").replace(/^An agent /, "an agent ");
  return "no interface answered when the audit called";
}

/** The crawler names in a ledger, verified ones only, most frequent first. */
function crawlersIn(days: DayVisits[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const day of days) {
    for (const [cls, count] of Object.entries(day.counts)) {
      if (!cls.startsWith("crawler:") || cls.startsWith("crawler:claimed-")) continue;
      totals.set(cls.slice("crawler:".length), (totals.get(cls.slice("crawler:".length)) ?? 0) + count);
    }
  }
  return [...totals].sort((left, right) => right[1] - left[1]);
}

/**
 * What changed between two readings of a site, said plainly. Null when nothing did, which is the
 * case that sends no email.
 */
export function movementBetween(previous: ReportRecord | null, current: ReportRecord, ledger: Ledger | null, lead: DeepScanLead): Movement | null {
  const lines: string[] = [];
  const before = previous?.score?.value;
  const after = current.score?.value;
  if (before !== undefined && after !== undefined && before !== after) {
    lines.push(`Readiness moved from ${before} to ${after} of 100.`);
  }

  const was = new Map((previous?.capabilities ?? []).map((capability) => [capability.actionId, capability]));
  for (const capability of current.capabilities ?? []) {
    const earlier = was.get(capability.actionId);
    if (!earlier) continue;
    if (earlier.state === "agent-ready" && capability.state !== "agent-ready") {
      lines.push(`${capability.label} stopped answering: ${whyItStopped(capability)}.`);
    } else if (earlier.state !== "agent-ready" && capability.state === "agent-ready") {
      lines.push(`${capability.label} started answering${capability.via === "sidecar" ? ", run by WordLift" : ""}.`);
    }
  }

  let seenCrawler = false;
  let seenGoogle = false;
  if (ledger) {
    const crawlers = crawlersIn(ledger.days);
    if (!lead.seenCrawlerAt && crawlers.length > 0) {
      const [name, count] = crawlers[0]!;
      lines.push(`The first crawler read the report: ${name}, ${plural(count, "time")}.`);
      seenCrawler = true;
    }
    const google = crawlers.find(([name]) => name === "googlebot")?.[1] ?? 0;
    if (!lead.seenGoogleAt && google > 0) {
      lines.push(`Google read the report for the first time, verified against its own address ranges.`);
      seenGoogle = true;
    }
    // The ledger counts by day, so "since the last read" is the days after it: a failure later on
    // the day of a read is the one thing this cannot see, which beats telling the same failure twice.
    const watchedDay = lead.watchedAt?.slice(0, 10);
    const requestedDay = lead.requestedAt.slice(0, 10);
    const failures = new Map<string, number>();
    for (const row of ledger.activations) {
      if (!row.outcome.startsWith("failed")) continue;
      if (watchedDay ? row.day <= watchedDay : row.day < requestedDay) continue;
      const reason = row.outcome.split(":").slice(1).join(":").replace(/[_-]+/g, " ") || "unknown reason";
      const key = `${row.tool}\n${reason}`;
      failures.set(key, (failures.get(key) ?? 0) + row.count);
    }
    for (const [key, count] of failures) {
      const [tool, reason] = key.split("\n") as [string, string];
      lines.push(`${plural(count, "agent")} tried ${tool} and it failed: ${reason}.`);
    }
  }

  return lines.length > 0 ? { lines, seenCrawler, seenGoogle } : null;
}

/** The one link that stops the notes: bound to the address, so a report link alone cannot silence its owner. */
export function unsubscribeKey(lead: Pick<DeepScanLead, "reportId" | "email">): string {
  return createHash("sha256").update(`${lead.reportId}:${lead.email.trim().toLowerCase()}`).digest("hex").slice(0, 24);
}

export class Observer {
  #timer: NodeJS.Timeout | null = null;
  #ticking: Promise<void> | null = null;
  #watched = 0;
  #sent = 0;
  #lastTickAt: string | null = null;

  constructor(private readonly deps: ObserverDependencies) {}

  get enabled(): boolean {
    return this.deps.intervalDays > 0;
  }

  /**
   * Begins the in-process cadence. Idempotent; the timer never keeps a process alive on its own,
   * and on a platform that sleeps between requests it fires only while something else keeps the
   * instance awake, which is why a scheduler calling the tick endpoint is the reliable form.
   */
  start(): void {
    if (!this.enabled || this.#timer) return;
    const minutes = this.deps.tickMinutes ?? 60;
    if (minutes <= 0) return;
    const every = minutes * 60_000;
    this.#timer = setInterval(() => void this.tick(), every);
    this.#timer.unref();
  }

  close(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  summary() {
    return {
      enabled: this.enabled,
      intervalDays: this.deps.intervalDays,
      tickMinutes: this.deps.tickMinutes ?? 60,
      scheduled: Boolean(this.deps.tickToken),
      watched: this.#watched,
      sent: this.#sent,
      lastTickAt: this.#lastTickAt,
    };
  }

  /** Whether a caller may run a tick: the token the scheduler presents, compared without leaking its length. */
  mayTick(token: string | undefined): boolean {
    const expected = this.deps.tickToken;
    if (!expected || !token) return false;
    const [left, right] = [Buffer.from(expected), Buffer.from(token)];
    return left.length === right.length && timingSafeEqual(left, right);
  }

  /** Re-reads the sites due, at most `perTick` of them, and sends a note for each that moved. */
  async tick(): Promise<WatchOutcome[]> {
    if (this.#ticking) {
      await this.#ticking;
      return [];
    }
    let outcomes: WatchOutcome[] = [];
    this.#ticking = (async () => {
      outcomes = await this.run();
    })().finally(() => {
      this.#ticking = null;
    });
    await this.#ticking;
    return outcomes;
  }

  private async run(): Promise<WatchOutcome[]> {
    const now = this.now();
    this.#lastTickAt = now.toISOString();
    if (!this.enabled) return [];
    const perTick = Math.max(1, this.deps.perTick ?? 5);
    const intervalMs = this.deps.intervalDays * DAY_MS;
    let candidates: DeepScanLead[];
    try {
      candidates = await this.deps.leads.watchable(perTick * 4);
    } catch (error) {
      this.log("observe_leads_unavailable", error instanceof Error ? error.name : "unknown");
      return [];
    }
    const due = candidates.filter((lead) => !lead.watchedAt || now.getTime() - new Date(lead.watchedAt).getTime() >= intervalMs).slice(0, perTick);
    const outcomes: WatchOutcome[] = [];
    for (const lead of due) {
      outcomes.push(await this.watch(lead).catch((error) => {
        this.log("observe_watch_failed", lead.reportId, error instanceof Error ? error.name : "unknown");
        return "failed" as const;
      }));
    }
    return outcomes;
  }

  /** One site: read it again, compare, and write only if something moved. */
  async watch(lead: DeepScanLead): Promise<WatchOutcome> {
    const { orchestrator, leads, delivery, visits } = this.deps;
    const now = this.now().toISOString();
    const original = await orchestrator.get(lead.reportId);
    if (!original || original.status === "running" || original.status === "failed") {
      await leads.markWatched(lead.reportId, { watchedAt: now });
      return "skipped";
    }

    // The newest reading before this one is the comparison, whatever kind of report it was.
    const history = await orchestrator.history(original);
    const previous = history[0] ? await orchestrator.get(history[0].reportId) : original;

    const started = await orchestrator.create({
      requestId: randomUUID(),
      url: original.requestedUrl,
      depth: original.scanDepth ?? "basic",
      fresh: true,
    });
    const current = await this.awaitTerminal(started);
    this.#watched += 1;
    if (!current || current.status === "failed") {
      await leads.markWatched(lead.reportId, { watchedAt: now });
      return "skipped";
    }

    const host = hostOf(original.canonicalUrl ?? original.requestedUrl);
    const ledger: Ledger | null = visits
      ? { days: await visits.visits(lead.reportId), activations: await visits.activations(host) }
      : null;
    const movement = movementBetween(previous, current, ledger, lead);
    await leads.markWatched(lead.reportId, {
      watchedAt: now,
      ...(movement?.seenCrawler ? { seenCrawlerAt: now } : {}),
      ...(movement?.seenGoogle ? { seenGoogleAt: now } : {}),
    });
    if (!movement) return "unchanged";

    const reportUrl = orchestrator.reportUrl(current.id);
    const stop = new URL(`/api/observe/unsubscribe/${lead.reportId}/${unsubscribeKey(lead)}`, reportUrl).toString();
    const summary = [
      `What moved on ${host}`,
      "",
      ...movement.lines.map((line) => `- ${line}`),
      "",
      `The report: ${reportUrl}`,
      `Stop these notes: ${stop}`,
    ].join("\n");
    await delivery.deliver(lead, {
      canonicalUrl: current.canonicalUrl ?? current.requestedUrl,
      reportUrl,
      agentReadinessScore: current.score?.value ?? 0,
      summary,
      subject: "movement",
    });
    this.#sent += 1;
    await leads.markWatched(lead.reportId, { movedAt: now });
    return "sent";
  }

  /** A live audit lands asynchronously; a fixture one has landed already. Either way, wait, bounded. */
  private async awaitTerminal(report: ReportRecord): Promise<ReportRecord | null> {
    if (report.status !== "running") return report;
    const deadline = Date.now() + (this.deps.auditTimeoutMs ?? 180_000);
    let latest: ReportRecord | null = report;
    while (latest && latest.status === "running" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      latest = await this.deps.orchestrator.get(report.id);
    }
    return latest && latest.status !== "running" ? latest : null;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private log(event: string, ...details: unknown[]): void {
    (this.deps.log ?? ((...args: unknown[]) => console.error(...args)))(event, ...details);
  }
}

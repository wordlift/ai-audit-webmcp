import type { NextFunction, Request, RequestHandler, Response } from "express";
import { activationKey, type ActivationCount, type DayVisits, type VisitStore } from "../adapters/visits/VisitStore.js";
import type { VisitorClass, VisitorClassifier } from "../security/visitorClass.js";

/**
 * Counts who reads a report and who activates a capability, in memory first and in the store on
 * an interval, so a burst of crawler hits is one write rather than a thousand. Everything here is
 * a count by class and by day. The address and the user agent are classified and forgotten.
 */
export interface VisitLedgerOptions {
  store: VisitStore;
  classifier: VisitorClassifier;
  /** How long a counted row lives: the same as the report it counts for. */
  ttlDays: number;
  flushMs?: number;
  now?: () => Date;
  log?: (event: string, ...details: unknown[]) => void;
}

/** The URLs a person, a crawler or an agent reads a report through. The ledger itself is not one of them. */
const REPORT_PATH = /^\/(?:api\/)?reports\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/contracts\/[^/]+|\/publish(?:\/[^/]+)?)?\/?$/i;
/** What we publish for agents about ourselves; counted under one bucket, by class, never by person. */
const SITE_PATHS = /^\/(?:llms\.txt|\.well-known\/.+|skill\.md)$/i;
export const SITE_BUCKET = "_site";

export class VisitLedger {
  readonly #pending = new Map<string, Map<string, number>>();
  readonly #pendingActivations = new Map<string, Map<string, number>>();
  #timer: NodeJS.Timeout | null = null;
  #flushing: Promise<void> | null = null;

  constructor(private readonly options: VisitLedgerOptions) {}

  /** The express middleware: classifies, counts, and never delays the response. */
  middleware(): RequestHandler {
    return (request: Request, _response: Response, next: NextFunction) => {
      if (request.method === "GET" || request.method === "HEAD") {
        const bucket = bucketFor(request.path);
        if (bucket) {
          const cls = this.options.classifier.classify({ userAgent: request.get("user-agent"), ip: request.ip });
          this.record(bucket, cls);
        }
      }
      next();
    };
  }

  record(reportId: string, cls: VisitorClass): void {
    const day = this.day();
    const key = `${reportId}\n${day}`;
    const counts = this.#pending.get(key) ?? new Map<string, number>();
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
    this.#pending.set(key, counts);
    this.schedule();
  }

  /** A failure carries its reason, as a short code: the moment an owner learns a capability changed. */
  recordActivation(site: string, tool: string, surface: string, outcome: "ok" | "failed", reason?: string): void {
    const key = `${site}\n${this.day()}`;
    const counts = this.#pendingActivations.get(key) ?? new Map<string, number>();
    const activation = activationKey(tool, surface, outcome === "failed" && reason ? `failed:${reasonSlug(reason)}` : outcome);
    counts.set(activation, (counts.get(activation) ?? 0) + 1);
    this.#pendingActivations.set(key, counts);
    this.schedule();
  }

  /** Writes what is pending. Safe to call at any time; concurrent calls share one write. */
  async flush(): Promise<void> {
    if (this.#flushing) return this.#flushing;
    this.#flushing = this.write().finally(() => {
      this.#flushing = null;
    });
    return this.#flushing;
  }

  async visits(reportId: string): Promise<DayVisits[]> {
    await this.flush();
    return this.options.store.visits(reportId);
  }

  async activations(site: string): Promise<ActivationCount[]> {
    await this.flush();
    return this.options.store.activations(site);
  }

  /** Stops the interval; pending counts are flushed once more. */
  async close(): Promise<void> {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    await this.flush();
  }

  private schedule(): void {
    if (this.#timer) return;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, this.options.flushMs ?? 15_000);
    this.#timer.unref();
  }

  private async write(): Promise<void> {
    const visits = [...this.#pending.entries()];
    const activations = [...this.#pendingActivations.entries()];
    this.#pending.clear();
    this.#pendingActivations.clear();
    const expiresAt = this.expiresAt();
    const log = this.options.log ?? (() => undefined);
    for (const [key, counts] of visits) {
      const [reportId, day] = key.split("\n") as [string, string];
      try {
        await this.options.store.addVisits(reportId, day, Object.fromEntries(counts), expiresAt);
      } catch (error) {
        log("visits_flush_failed", error instanceof Error ? error.name : "unknown");
      }
    }
    for (const [key, counts] of activations) {
      const [site, day] = key.split("\n") as [string, string];
      try {
        await this.options.store.addActivations(site, day, Object.fromEntries(counts), expiresAt);
      } catch (error) {
        log("activations_flush_failed", error instanceof Error ? error.name : "unknown");
      }
    }
  }

  private day(): string {
    return (this.options.now?.() ?? new Date()).toISOString().slice(0, 10);
  }

  private expiresAt(): string {
    const at = new Date(this.options.now?.() ?? new Date());
    at.setUTCDate(at.getUTCDate() + this.options.ttlDays);
    return at.toISOString();
  }
}

/** A failure reason as a short, safe code: letters, digits, underscores and dashes, forty characters at most. */
export function reasonSlug(reason: string): string {
  return reason.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "unknown";
}

/** The report a path reads, the site bucket for what we publish about ourselves, or nothing. */
export function bucketFor(path: string): string | null {
  const report = REPORT_PATH.exec(path);
  if (report) return report[1]!.toLowerCase();
  return SITE_PATHS.test(path) ? SITE_BUCKET : null;
}

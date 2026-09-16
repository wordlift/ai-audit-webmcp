import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  assertionsFor,
  carriesCode,
  decisionsFrom,
  engineView,
  hostOf,
  mergeDecisions,
  newEngine,
  reportHost,
  verificationCode,
  withSnapshot,
} from "../../domain/engine/contextEngine.js";
import type { ContextEngine, ContextEngineView, EngineClaimResult, EngineRole } from "../../shared/schemas/contextEngine.js";
import type { HumanAssertion, ReportRecord } from "../../shared/types/index.js";
import type { ContextEngineStore } from "../adapters/engines/index.js";
import { ReportRequestError } from "../errors.js";
import { safeFetch, type SafeFetchResult, type UrlPolicyOptions } from "../security/urlPolicy.js";

const REVIEW_TOKEN_MS = 24 * 60 * 60 * 1_000;

function hash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function matches(storedHash: string, secret: string): boolean {
  const provided = Buffer.from(hash(secret), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

export interface ContextEnginesOptions {
  store: ContextEngineStore;
  /** Whether the site's own catalog carries the Terms of Action we write: the engine is live. */
  isPublished?: (host: string) => Promise<boolean>;
  /** Whether an agent has activated one of the site's capabilities and it worked: the engine is activated. */
  isActivated?: (host: string) => Promise<boolean>;
  now?: () => Date;
  /** How a site is read for its verification code; tests inject one. */
  fetch?: (url: string) => Promise<Pick<SafeFetchResult, "status" | "body">>;
  urlPolicy?: UrlPolicyOptions;
  log?: (event: string, ...details: unknown[]) => void;
}

export interface Verification {
  code: string;
  metaTag: string;
  wellKnownUrl: string;
}

/**
 * The Context Engines: one per site, above its reports. Every finished read of a site is recorded
 * on its engine; a review filed with the holder's key becomes decisions the engine keeps; a new
 * read gets those decisions back as a review of its own. Claiming takes an address; asserting as
 * the business takes the site's own proof, a code on its home page or at a well-known path.
 */
export class ContextEngines {
  constructor(private readonly options: ContextEnginesOptions) {}

  /** Wires the signals that move an engine past claimed, once the services that hold them exist. */
  attach(signals: Pick<ContextEnginesOptions, "isPublished" | "isActivated">): void {
    Object.assign(this.options, signals);
  }

  /** Draft, claimed, live once its site publishes what we write, activated once an agent used it. */
  private async statusFor(engine: ContextEngine): Promise<ContextEngine["status"]> {
    const host = engine.host;
    const [activated, published] = await Promise.all([
      this.options.isActivated?.(host).catch(() => false) ?? false,
      this.options.isPublished?.(host).catch(() => false) ?? false,
    ]);
    if (activated) return "activated";
    if (published) return "live";
    return engine.claim ? "claimed" : "draft";
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  async forHost(host: string): Promise<ContextEngine | null> {
    return this.options.store.get(hostOf(`https://${host}`));
  }

  async forReport(report: ReportRecord): Promise<ContextEngine | null> {
    return this.options.store.get(reportHost(report));
  }

  async view(report: ReportRecord): Promise<ContextEngineView | null> {
    const engine = await this.forReport(report);
    return engine ? engineView(engine) : null;
  }

  /** Records a finished read on its site's engine, creating the engine on the first. Never fails the caller. */
  async record(report: ReportRecord): Promise<ContextEngine | null> {
    if (report.status !== "completed" && report.status !== "partial") return null;
    if (!report.contextGraph) return null;
    try {
      const at = this.now().toISOString();
      const host = reportHost(report);
      const engine = withSnapshot((await this.options.store.get(host)) ?? newEngine(randomUUID(), host, at), report, at);
      return await this.options.store.put({ ...engine, status: await this.statusFor(engine) });
    } catch (error) {
      this.options.log?.("engine_record_failed", error instanceof Error ? error.name : "unknown");
      return null;
    }
  }

  /** The decisions this engine keeps, as assertions about a new read of the site; null when there are none to carry. */
  async carry(report: ReportRecord): Promise<{ assertions: HumanAssertion; filedBy: EngineRole } | null> {
    const engine = await this.forReport(report);
    if (!engine?.claim) return null;
    const assertions = assertionsFor(report, engine.decisions);
    if (!assertions) return null;
    const byOwner = [engine.decisions.businessRole, ...engine.decisions.entities, ...engine.decisions.actions, ...engine.decisions.terminology, ...(engine.decisions.relations ?? [])].some((decision) => decision?.by === "owner");
    return { assertions, filedBy: byOwner ? "owner" : "reviewer" };
  }

  /**
   * Claims the engine of the report's site. The first claim holds it as a reviewer. A claim of an
   * engine someone else holds waits: its key files nothing until the site proves it is the claimant's.
   */
  async claim(report: ReportRecord): Promise<EngineClaimResult> {
    const at = this.now().toISOString();
    const host = reportHost(report);
    const existing = (await this.options.store.get(host)) ?? withSnapshot(newEngine(randomUUID(), host, at), report, at);
    const key = randomBytes(24).toString("base64url");
    if (!existing.claim) {
      const engine = await this.options.store.put({
        ...existing,
        activeAt: at,
        status: existing.status === "draft" ? "claimed" : existing.status,
        claim: { hash: hash(key), createdAt: at, role: existing.owner.state === "verified" ? "owner" : "reviewer" },
        updatedAt: at,
      });
      return { engine: engineView(engine), key, standing: "holder" };
    }
    const engine = await this.options.store.put({
      ...existing,
      pending: [...existing.pending, { hash: hash(key), createdAt: at }].slice(-5),
      updatedAt: at,
    });
    return { engine: engineView(engine), key, standing: "pending" };
  }

  /** Who a key speaks for on this engine: the holder's role, a pending claim, or nobody. */
  standing(engine: ContextEngine, key: string | undefined): { role: EngineRole } | "pending" | null {
    if (!key) return null;
    if (engine.claim && matches(engine.claim.hash, key)) return { role: engine.claim.role };
    const now = this.now();
    if (engine.claim && engine.reviewTokens.some((token) => new Date(token.expiresAt) > now && matches(token.hash, key))) return { role: engine.claim.role };
    if (engine.pending.some((pending) => matches(pending.hash, key))) return "pending";
    return null;
  }

  private async requireEngine(host: string): Promise<ContextEngine> {
    const engine = await this.forHost(host);
    if (!engine) throw new ReportRequestError("No Context Engine exists for that site yet. Audit it first.", 404, "engine_not_found");
    return engine;
  }

  /** The code a claimant puts on the site, for the holder or a pending claim alike. */
  async verification(host: string, key: string | undefined): Promise<Verification> {
    const engine = await this.requireEngine(host);
    const standing = this.standing(engine, key);
    if (!standing || !key) throw new ReportRequestError("Claim this Context Engine first; verification belongs to a claim.", 403, "engine_not_claimed");
    const code = verificationCode(engine.id, hash(key));
    return {
      code,
      metaTag: `<meta name="wordlift-site-verification" content="${code}">`,
      wellKnownUrl: `https://${engine.host}/.well-known/wordlift-verification.txt`,
    };
  }

  /**
   * Reads the site for the claimant's code. Found, the claimant becomes the verified owner: a
   * pending claim takes the engine over, and every earlier key and review token stops working.
   */
  async verify(host: string, key: string | undefined): Promise<ContextEngineView> {
    const engine = await this.requireEngine(host);
    const standing = this.standing(engine, key);
    if (!standing || !key) throw new ReportRequestError("Claim this Context Engine first; verification belongs to a claim.", 403, "engine_not_claimed");
    const code = verificationCode(engine.id, hash(key));
    const method = await this.findCode(engine.host, code);
    if (!method) {
      throw new ReportRequestError(
        `The code was not found on ${engine.host}. Add the meta tag to the home page or the code to /.well-known/wordlift-verification.txt, then check again.`,
        409,
        "engine_verification_not_found",
      );
    }
    const at = this.now().toISOString();
    const verified = await this.options.store.put({
      ...engine,
      owner: { state: "verified", method, verifiedAt: at },
      activeAt: at,
      claim: { hash: hash(key), createdAt: at, role: "owner" },
      pending: [],
      reviewTokens: [],
      status: engine.status === "draft" ? "claimed" : engine.status,
      updatedAt: at,
    });
    return engineView(verified);
  }

  private async findCode(host: string, code: string): Promise<"meta-tag" | "well-known" | null> {
    const read = this.options.fetch ?? ((url: string) => safeFetch(url, { maxBytes: 512_000, timeoutMs: 8_000, ...this.options.urlPolicy }));
    for (const [where, url] of [
      ["well-known", `https://${host}/.well-known/wordlift-verification.txt`],
      ["meta-tag", `https://${host}/`],
    ] as const) {
      try {
        const answer = await read(url);
        if (answer.status >= 200 && answer.status < 300 && carriesCode(answer.body, code, where)) return where;
      } catch (error) {
        this.options.log?.("engine_verify_read_failed", where, error instanceof Error ? error.name : "unknown");
      }
    }
    return null;
  }

  /** A day-long stand-in for the holder's key, for a review run in a browser that does not hold it. */
  async reviewToken(host: string, key: string | undefined): Promise<{ token: string; expiresAt: string }> {
    const engine = await this.requireEngine(host);
    const standing = this.standing(engine, key);
    if (!standing || standing === "pending") throw new ReportRequestError("Only the holder of this Context Engine's claim can hand out a review.", 403, "engine_not_holder");
    const now = this.now();
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now.getTime() + REVIEW_TOKEN_MS).toISOString();
    await this.options.store.put({
      ...engine,
      reviewTokens: [...engine.reviewTokens.filter((existing) => new Date(existing.expiresAt) > now), { hash: hash(token), createdAt: now.toISOString(), expiresAt }].slice(-5),
      updatedAt: now.toISOString(),
    });
    return { token, expiresAt };
  }

  /** The role a key would file a review as, before the review is made; null files nothing. */
  async roleFor(report: ReportRecord, key: string | undefined): Promise<EngineRole | null> {
    if (!key) return null;
    const engine = await this.forReport(report);
    if (!engine) return null;
    const standing = this.standing(engine, key);
    return standing && standing !== "pending" ? standing.role : null;
  }

  /** Keeps a review's decisions on the engine and records the reviewed report as its latest. */
  async file(parent: ReportRecord, child: ReportRecord, assertions: HumanAssertion, role: EngineRole): Promise<ContextEngineView | null> {
    const engine = await this.forReport(parent);
    if (!engine) return null;
    const at = this.now().toISOString();
    const decisions = mergeDecisions(engine.decisions, decisionsFrom(assertions, parent, role, at));
    const stored = await this.options.store.put(withSnapshot({ ...engine, decisions, activeAt: at }, child, at));
    return engineView(stored);
  }

  /** A door to WordLift opened from this engine: kept so the dashboard and the sales team know why. */
  async noteIntent(report: ReportRecord, intent: string): Promise<void> {
    const engine = await this.forReport(report);
    if (!engine) return;
    const at = this.now().toISOString();
    await this.options.store.put({ ...engine, intents: [...(engine.intents ?? []), { intent, at }].slice(-20), activeAt: at, updatedAt: at });
  }
}

import { z } from "zod";
import { actionBoundarySchema, actionPartnerSchema } from "./report.js";

/**
 * A Context Engine is one site's model of its business, kept above the reports that read it.
 * Reports are evidence snapshots and expire; the engine holds what people decided about the model,
 * so a decision made once applies to every later read of the site.
 *
 * Claiming is not owning. Anyone can audit any site, so a claim made with an address makes the
 * claimant a reviewer whose decisions persist; asserting facts as the business takes a verified
 * owner. A later claim of an engine someone else holds waits, pending, until its holder proves the
 * site is theirs.
 */
export const engineStatusSchema = z.enum(["draft", "claimed", "live", "activated"]);
export const engineRoleSchema = z.enum(["reviewer", "owner"]);
export const verificationMethodSchema = z.enum(["meta-tag", "well-known"]);

/** An entity decision, keyed by what survives a new read of the site: its name and its role. */
export const engineEntityDecisionSchema = z
  .object({
    key: z.string().min(1).max(300),
    name: z.string().min(1).max(300),
    decision: z.enum(["primary", "demoted"]),
    by: engineRoleSchema,
    at: z.string().datetime(),
  })
  .strict();

export const engineActionDecisionSchema = z
  .object({
    actionId: z.string().min(1).max(160),
    decision: z.enum(["confirm", "reject"]),
    boundary: actionBoundarySchema.optional(),
    rationale: z.string().min(1).max(500).optional(),
    partner: actionPartnerSchema.optional(),
    by: engineRoleSchema,
    at: z.string().datetime(),
  })
  .strict();

export const engineTermSchema = z
  .object({
    term: z.string().min(1).max(120),
    meaning: z.string().min(1).max(300),
    by: engineRoleSchema,
    at: z.string().datetime(),
  })
  .strict();

export const engineDecisionsSchema = z
  .object({
    businessRole: z.object({ value: z.string().min(2).max(120), by: engineRoleSchema, at: z.string().datetime() }).strict().optional(),
    entities: z.array(engineEntityDecisionSchema).max(120),
    actions: z.array(engineActionDecisionSchema).max(80),
    terminology: z.array(engineTermSchema).max(40),
    /** Relations confirmed or rejected, keyed by both ends' keys and the kind. */
    relations: z
      .array(
        z
          .object({
            key: z.string().min(1).max(700),
            decision: z.enum(["confirm", "reject"]),
            by: engineRoleSchema,
            at: z.string().datetime(),
          })
          .strict(),
      )
      .max(80)
      .optional(),
  })
  .strict();

/** One read of the site as the engine remembers it: enough to say what moved, never the report itself. */
export const engineSnapshotSchema = z
  .object({
    reportId: z.string().uuid(),
    at: z.string().datetime(),
    kind: z.enum(["audit", "review", "carried", "revision"]),
    score: z.number().int().min(0).max(100).optional(),
    entities: z.array(z.string().min(1).max(300)).max(80),
    relations: z.array(z.string().min(1).max(700)).max(80),
    agentReady: z.array(z.string().min(1).max(160)).max(80),
  })
  .strict();

const secretSchema = z.object({ hash: z.string().length(64), createdAt: z.string().datetime() }).strict();

export const contextEngineSchema = z
  .object({
    id: z.string().uuid(),
    host: z.string().min(1).max(253),
    status: engineStatusSchema,
    owner: z
      .object({
        state: z.enum(["unverified", "verified"]),
        method: verificationMethodSchema.optional(),
        verifiedAt: z.string().datetime().optional(),
      })
      .strict(),
    /** The holder's key, hashed. Only a holder files decisions that persist. */
    claim: secretSchema.extend({ role: engineRoleSchema }).strict().optional(),
    /** Later claims, waiting on verification. */
    pending: z.array(secretSchema).max(5),
    /** Short-lived stand-ins for the holder's key, for a review run in another browser (ChatGPT's). */
    reviewTokens: z.array(secretSchema.extend({ expiresAt: z.string().datetime() }).strict()).max(5),
    latestReportId: z.string().uuid().optional(),
    latestReviewedReportId: z.string().uuid().optional(),
    decisions: engineDecisionsSchema,
    snapshots: z.array(engineSnapshotSchema).max(20),
    /** The doors to WordLift a person opened from this engine, newest last: why they came. */
    intents: z.array(z.object({ intent: z.string().min(1).max(40), at: z.string().datetime() }).strict()).max(20).optional(),
    /** The last time a person or an agent did something with the engine, not merely read it. */
    activeAt: z.string().datetime().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ContextEngine = z.infer<typeof contextEngineSchema>;
export type EngineSnapshot = z.infer<typeof engineSnapshotSchema>;
export type EngineDecisions = z.infer<typeof engineDecisionsSchema>;
export type EngineRole = z.infer<typeof engineRoleSchema>;

/** What anyone may read about an engine: its state and what was decided, never a secret. */
export interface ContextEngineView {
  id: string;
  host: string;
  status: ContextEngine["status"];
  owner: ContextEngine["owner"];
  claimed: boolean;
  latestReportId?: string;
  latestReviewedReportId?: string;
  decisions: { total: number; byOwner: number; entities: number; actions: number; terminology: number };
  snapshots: EngineSnapshot[];
  activeAt?: string;
  updatedAt: string;
}

/** What a claimant is handed: the key, once, and whether it is live or waits on verification. */
export interface EngineClaimResult {
  engine: ContextEngineView;
  key: string;
  standing: "holder" | "pending";
}

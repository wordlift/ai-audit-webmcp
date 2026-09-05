import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Who may publish a refinement of a report.
 *
 * Reading is free and anonymous, and a report's link is meant to be shared. Refining is different:
 * a refined report is a human judgment about someone's business, published under their site's
 * name. So the caller that ran the audit is handed a claim, and only a caller holding it can turn
 * that report into a refined child.
 *
 * Only the hash is stored. A claim leaked from this database is not a claim.
 */
export const reportClaimSchema = z
  .object({
    reportId: z.string().uuid(),
    tokenHash: z.string().length(64),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type ReportClaim = z.infer<typeof reportClaimSchema>;

export interface ClaimStore {
  put(claim: ReportClaim): Promise<ReportClaim>;
  get(reportId: string): Promise<ReportClaim | null>;
}

export function newClaimToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time, so a wrong token cannot be narrowed down by how long the answer took. */
export function claimMatches(claim: ReportClaim, token: string): boolean {
  const provided = Buffer.from(hashClaimToken(token), "hex");
  const stored = Buffer.from(claim.tokenHash, "hex");
  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

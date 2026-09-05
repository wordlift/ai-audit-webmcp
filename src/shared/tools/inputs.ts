import { z } from "zod";
import { archetypeSchema, scanDepthSchema } from "../schemas/report.js";

/**
 * What each tool accepts, as a parser. The published JSON Schemas in `definitions.ts` tell an
 * agent how to call a tool; these validate what actually arrived. A remote caller has no open
 * page, so every report-scoped input names its report — the difference `withRequiredReportId`
 * publishes.
 */

const reportId = z
  .string()
  .uuid("A reportId is the identifier audit-website returned, for example 9f1c…-…-….");

export const auditWebsiteInputSchema = z
  .object({
    url: z.string().min(1).max(2_048),
    archetype: archetypeSchema.optional(),
    depth: scanDepthSchema.optional(),
    /** Validated by the gate, which is where the address is recorded and where it stays. */
    email: z.string().max(254).optional(),
  })
  .strict();

export const reportScopedInputSchema = z.object({ reportId }).strict();

export const explainCapabilityInputSchema = z
  .object({
    reportId,
    actionId: z.string().min(1).max(200),
  })
  .strict();

export type AuditWebsiteInput = z.infer<typeof auditWebsiteInputSchema>;
export type ReportScopedInput = z.infer<typeof reportScopedInputSchema>;
export type ExplainCapabilityInput = z.infer<typeof explainCapabilityInputSchema>;

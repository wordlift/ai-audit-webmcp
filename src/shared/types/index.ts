import type { z } from "zod";
import type {
  actionContractSchema,
  archetypeSchema,
  capabilityEvidenceSchema,
  capabilityResultSchema,
  classificationResultSchema,
  contentCategorySchema,
  createReportRequestSchema,
  foundationAuditSummarySchema,
  priorityGapSchema,
  readinessScoreSchema,
  reportErrorSchema,
  reportRecordSchema,
} from "../schemas/report.js";

export type ActionContract = z.infer<typeof actionContractSchema>;
export type ContentCategory = z.infer<typeof contentCategorySchema>;
export type FoundationAuditSummary = z.infer<typeof foundationAuditSummarySchema>;
export type Archetype = z.infer<typeof archetypeSchema>;
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;
export type CapabilityResult = z.infer<typeof capabilityResultSchema>;
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
export type PriorityGap = z.infer<typeof priorityGapSchema>;
export type ReadinessScore = z.infer<typeof readinessScoreSchema>;
export type ReportError = z.infer<typeof reportErrorSchema>;
export type ReportRecord = z.infer<typeof reportRecordSchema>;

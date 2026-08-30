import type { z } from "zod";
import type {
  actionContractSchema,
  actionInterfaceSchema,
  archetypeSchema,
  auditedPageSchema,
  capabilityEvidenceSchema,
  capabilityResultSchema,
  classificationResultSchema,
  contentCategorySchema,
  contextGraphSchema,
  createReportRequestSchema,
  domainEntitySchema,
  entityActionBindingSchema,
  foundationAuditSummarySchema,
  lexicalEntrySchema,
  priorityGapSchema,
  readinessScoreSchema,
  reportErrorSchema,
  reportRecordSchema,
} from "../schemas/report.js";

export type ActionContract = z.infer<typeof actionContractSchema>;
export type ActionInterface = z.infer<typeof actionInterfaceSchema>;
export type AuditedPage = z.infer<typeof auditedPageSchema>;
export type ContentCategory = z.infer<typeof contentCategorySchema>;
export type ContextGraph = z.infer<typeof contextGraphSchema>;
export type DomainEntity = z.infer<typeof domainEntitySchema>;
export type EntityActionBinding = z.infer<typeof entityActionBindingSchema>;
export type FoundationAuditSummary = z.infer<typeof foundationAuditSummarySchema>;
export type LexicalEntry = z.infer<typeof lexicalEntrySchema>;
export type Archetype = z.infer<typeof archetypeSchema>;
export type CapabilityEvidence = z.infer<typeof capabilityEvidenceSchema>;
export type CapabilityResult = z.infer<typeof capabilityResultSchema>;
export type ClassificationResult = z.infer<typeof classificationResultSchema>;
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
export type PriorityGap = z.infer<typeof priorityGapSchema>;
export type ReadinessScore = z.infer<typeof readinessScoreSchema>;
export type ReportError = z.infer<typeof reportErrorSchema>;
export type ReportRecord = z.infer<typeof reportRecordSchema>;

import { z } from "zod";
import {
  archetypeSchema,
  capabilityStageSchema,
  governanceSchema,
  jsonValueSchema,
} from "../../shared/schemas/report.js";

const genericInputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
  description: "Replace with the site-specific inputs required by this capability.",
};

const genericOutputSchema = {
  type: "object",
  additionalProperties: true,
  description: "A structured, evidence-backed result for this capability.",
};

export const actionDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
    label: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    stage: capabilityStageSchema,
    intent: z.enum(["informational", "transactional"]),
    importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    inputSchema: jsonValueSchema.default(genericInputSchema),
    outputSchema: jsonValueSchema.default(genericOutputSchema),
    governance: governanceSchema,
    evidenceRules: z.array(z.string().min(1)).min(1),
    recommendedDelivery: z.enum(["native-webmcp", "api-adapter", "approved-sidecar"]),
  })
  .strict();

export const archetypeTemplateSchema = z
  .object({
    id: archetypeSchema,
    label: z.string().min(1),
    actions: z.array(z.string()).min(1).max(12),
    /** Vertical wording for an action, e.g. finance renames "Request a quote" to an evaluation. */
    labels: z.record(z.string(), z.string().min(1).max(120)).optional(),
  })
  .strict();

export const manifestSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    releasedAt: z.string().date(),
    provisional: z.boolean(),
    classification: z
      .object({ evidenceFloor: z.number().positive(), marginFloor: z.number().nonnegative() })
      .strict(),
    provenance: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const categoryRuleSchema = z
  .object({ prefix: z.string().startsWith("/"), archetype: archetypeSchema, weight: z.number().positive() })
  .strict();

export const behaviorRuleSchema = z
  .object({ signal: z.string().min(1), archetype: archetypeSchema, weight: z.number().positive() })
  .strict();

export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;
export type ArchetypeTemplate = z.infer<typeof archetypeTemplateSchema>;
export type ActionModelManifest = z.infer<typeof manifestSchema>;
export type CategoryRule = z.infer<typeof categoryRuleSchema>;
export type BehaviorRule = z.infer<typeof behaviorRuleSchema>;

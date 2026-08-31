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
  })
  .strict();

export const manifestSchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    releasedAt: z.string().date(),
    provisional: z.boolean(),
    classification: z
      .object({
        evidenceFloor: z.number().positive(),
        marginFloor: z.number().nonnegative(),
        /** Share of all scored evidence one archetype must hold to be accepted below the floor. */
        dominanceShare: z.number().min(0.5).max(1).default(0.75),
      })
      .strict(),
    provenance: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const categoryRuleSchema = z
  .object({ prefix: z.string().startsWith("/"), archetype: archetypeSchema, weight: z.number().positive() })
  .strict();

/** Rewords a generic action label when the site's own context — its content categories or the entities it publishes — makes it concrete. */
export const labelOverrideSchema = z
  .object({
    contextIncludes: z.string().min(2).max(120),
    actionId: z.string().min(1).max(160),
    label: z.string().min(1).max(120),
    description: z.string().min(1).max(500).optional(),
  })
  .strict();

export const behaviorRuleSchema = z
  .object({ signal: z.string().min(1), archetype: archetypeSchema, weight: z.number().positive() })
  .strict();

export type ActionDefinition = z.infer<typeof actionDefinitionSchema>;
export type ArchetypeTemplate = z.infer<typeof archetypeTemplateSchema>;
export type ActionModelManifest = z.infer<typeof manifestSchema>;
export type CategoryRule = z.infer<typeof categoryRuleSchema>;
export type BehaviorRule = z.infer<typeof behaviorRuleSchema>;
export type LabelOverride = z.infer<typeof labelOverrideSchema>;

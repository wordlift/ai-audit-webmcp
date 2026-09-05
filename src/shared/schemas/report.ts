import { z } from "zod";

export const MAX_EVIDENCE_ITEMS = 100;
export const MAX_EVIDENCE_SNIPPET_LENGTH = 500;
export const DEFAULT_MAX_REPORT_BYTES = 900_000;

export const archetypeSchema = z.enum([
  "commerce-retail",
  "publisher-content",
  "travel-hospitality",
  "finance-insurance",
  "saas",
  "other",
]);

export const reportStatusSchema = z.enum(["running", "completed", "partial", "failed"]);
export const reportPhaseSchema = z.enum(["understanding", "mapping", "checking", "complete"]);
export const capabilityStageSchema = z.enum(["discover", "understand-decide", "act", "manage"]);
export const capabilityStateSchema = z.enum([
  "not-expected",
  "sidecar-enabled",
  "agent-ready",
  "unverified",
  "human-only",
  "missing",
]);

export const contentCategorySchema = z
  .object({
    name: z.string().min(1).max(240),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const auditedPageSchema = z
  .object({
    url: z.string().url().max(2_048),
    title: z.string().max(300),
    role: z.enum(["entry", "detail", "offer", "policy", "contact", "other"]),
    description: z.string().max(600).optional(),
    headings: z.array(z.string().min(1).max(240)).max(20),
    entityIds: z.array(z.string().min(1).max(500)).max(40),
  })
  .strict();

export const entityOfferSchema = z
  .object({
    id: z.string().min(1).max(500).optional(),
    name: z.string().min(1).max(240).optional(),
    price: z.union([z.string().max(80), z.number().finite()]).optional(),
    priceCurrency: z.string().min(3).max(8).optional(),
    availability: z.string().max(240).optional(),
    url: z.string().url().max(2_048).optional(),
  })
  .strict();

export const domainEntitySchema = z
  .object({
    id: z.string().min(1).max(500),
    types: z.array(z.string().min(1).max(160)).min(1).max(12),
    name: z.string().min(1).max(300),
    alternateNames: z.array(z.string().min(1).max(240)).max(20),
    description: z.string().max(1_000).optional(),
    sourceUrls: z.array(z.string().url().max(2_048)).min(1).max(12),
    sameAs: z.array(z.string().url().max(2_048)).max(12),
    offers: z.array(entityOfferSchema).max(12),
    confidence: z.number().min(0).max(1),
    /** A reviewer's judgment about this entity's place in the map; absent on the machine draft. */
    humanPriority: z.enum(["primary", "demoted"]).optional(),
  })
  .strict();

export const lexicalEntrySchema = z
  .object({
    id: z.string().min(1).max(300),
    label: z.string().min(1).max(240),
    aliases: z.array(z.string().min(1).max(240)).max(20),
    kind: z.enum(["category", "entity-name", "topic"]),
    entityIds: z.array(z.string().min(1).max(500)).max(40),
    sourceUrls: z.array(z.string().url().max(2_048)).max(12),
    confidence: z.number().min(0).max(1),
    /** What this term means for the business, in the reviewer's words. */
    meaning: z.string().min(1).max(300).optional(),
    /** Present when a human defined or confirmed this term; machine vocabulary carries none. */
    provenance: z.literal("human-provided").optional(),
  })
  .strict();

export const actionInterfaceSchema = z
  .object({
    id: z.string().min(1).max(300),
    actionId: z.string().min(1).max(160),
    entityIds: z.array(z.string().min(1).max(500)).max(40),
    name: z.string().min(1).max(300),
    protocol: z.enum(["human-page", "human-form", "structured-data", "webmcp", "mcp", "openapi", "api", "agent-document"]),
    audience: z.enum(["human", "agent"]),
    status: z.enum(["observed", "declared", "invoked", "failed"]),
    sourceUrl: z.string().url().max(2_048),
    evidenceId: z.string().min(1).max(160),
  })
  .strict();

export const entityActionBindingSchema = z
  .object({
    entityId: z.string().min(1).max(500),
    actionId: z.string().min(1).max(160),
    role: z.enum(["provider", "object"]),
    basis: z.array(z.enum(["archetype", "structured-data", "observed-interface"])).min(1).max(3),
    state: capabilityStateSchema,
    evidenceIds: z.array(z.string().min(1).max(160)).max(MAX_EVIDENCE_ITEMS),
    interfaceIds: z.array(z.string().min(1).max(300)).max(40),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const contextGraphSchema = z
  .object({
    pages: z.array(auditedPageSchema).min(1).max(4),
    entities: z.array(domainEntitySchema).max(80),
    lexicalEntries: z.array(lexicalEntrySchema).max(100),
    interfaces: z.array(actionInterfaceSchema).max(120),
    bindings: z.array(entityActionBindingSchema).max(240),
  })
  .strict();

export const rankedArchetypeSchema = z
  .object({
    archetype: archetypeSchema,
    score: z.number().finite(),
  })
  .strict();

export const classificationResultSchema = z
  .object({
    primaryArchetype: archetypeSchema,
    categories: z.array(contentCategorySchema).max(20),
    rankedArchetypes: z.array(rankedArchetypeSchema).min(1).max(6),
    confidence: z.enum(["high", "medium", "low"]),
    margin: z.number().finite().nonnegative(),
    provisional: z.boolean(),
    provisionalReason: z.string().max(500).optional(),
    override: archetypeSchema.optional(),
    /** The operating role a human named for the business, e.g. "destination-organization". */
    businessRole: z.string().min(2).max(120).optional(),
    model: z.string().min(1).max(120),
    collectedAt: z.string().datetime(),
  })
  .strict();

export const capabilityEvidenceSchema = z
  .object({
    id: z.string().min(1).max(160),
    actionId: z.string().min(1).max(160),
    audience: z.enum(["human", "agent"]),
    kind: z.enum([
      "page",
      "form",
      "structured-data",
      "discovery",
      "openapi",
      "webmcp",
      "api-result",
      "tool-result",
    ]),
    sourceUrl: z.string().url().max(2_048),
    claim: z.string().min(1).max(600),
    confidence: z.number().min(0).max(1),
    verification: z.enum(["observed", "declared", "invoked", "failed"]),
    collectedAt: z.string().datetime(),
    snippet: z.string().max(MAX_EVIDENCE_SNIPPET_LENGTH).optional(),
  })
  .strict();

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

/** Who is responsible for an action: the site itself, a partner, nobody transactionally, or nobody at all. */
export const actionBoundarySchema = z.enum(["owned", "partner-handoff", "informational-only", "not-applicable"]);

export const governanceSchema = z
  .object({
    requiresAuthentication: z.boolean(),
    requiresAuthorization: z.boolean(),
    requiresConfirmation: z.boolean(),
    sideEffects: z.enum(["none", "reversible", "irreversible"]),
  })
  .strict();

export const actionContractSchema = z
  .object({
    "@context": z.array(jsonValueSchema).min(1).max(5),
    "@id": z.string().min(1).max(500),
    "@type": z.array(z.string().min(1).max(160)).min(1).max(10),
    name: z.string().min(1).max(240),
    object: z
      .object({
        "@id": z.string().min(1).max(2_048),
        name: z.string().min(1).max(300).optional(),
        type: z.array(z.string().min(1).max(160)).max(12).optional(),
      })
      .strict(),
    stage: capabilityStageSchema,
    intent: z.enum(["informational", "transactional"]),
    inputSchema: jsonValueSchema,
    outputSchema: jsonValueSchema,
    governance: governanceSchema,
    recommendedDelivery: z.enum(["native-webmcp", "api-adapter", "approved-sidecar"]),
    modelVersion: z.string().min(1).max(40),
    expectationSource: z.array(z.string().min(1).max(240)).min(1).max(20),
  })
  .strict();

export const capabilityResultSchema = z
  .object({
    actionId: z.string().min(1).max(160),
    label: z.string().min(1).max(240),
    description: z.string().min(1).max(1_000),
    stage: capabilityStageSchema,
    intent: z.enum(["informational", "transactional"]),
    importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    expected: z.boolean(),
    expectationSource: z.array(z.string().min(1).max(240)).min(1).max(20),
    state: capabilityStateSchema,
    humanSupport: z.boolean(),
    agentSupport: z.boolean(),
    appliesTo: z
      .array(
        z
          .object({
            id: z.string().min(1).max(500),
            name: z.string().min(1).max(300),
            types: z.array(z.string().min(1).max(160)).min(1).max(12),
          })
          .strict(),
      )
      .max(40)
      .default([]),
    evidence: z.array(capabilityEvidenceSchema).max(MAX_EVIDENCE_ITEMS),
    recommendation: z.string().max(1_500).optional(),
    contract: actionContractSchema.optional(),
    /** Responsibility for the action, set by a human decision — never inferred as fact. */
    boundary: actionBoundarySchema.optional(),
    boundaryRationale: z.string().min(1).max(500).optional(),
    boundarySource: z.literal("human-provided").optional(),
  })
  .strict();

export const readinessScoreSchema = z
  .object({
    value: z.number().int().min(0).max(100),
    verifiedWeight: z.number().int().nonnegative(),
    expectedWeight: z.number().int().nonnegative(),
    counts: z
      .object({
        expected: z.number().int().nonnegative(),
        ready: z.number().int().nonnegative(),
        unverified: z.number().int().nonnegative(),
        humanOnly: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export const priorityGapSchema = z
  .object({
    actionId: z.string().min(1).max(160),
    label: z.string().min(1).max(240),
    state: z.enum(["unverified", "human-only", "missing"]),
    priorityScore: z.number().int().nonnegative(),
    reason: z.string().min(1).max(1_000),
  })
  .strict();

export const foundationAuditSummarySchema = z
  .object({
    score: z.number().int().min(0).max(100),
    summary: z.string().min(1).max(2_000),
    findings: z.array(z.string().min(1).max(600)).max(60),
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1).max(80),
            label: z.string().min(1).max(160),
            score: z.number().finite().optional(),
            status: z.string().max(120).optional(),
            explanation: z.string().max(1_000).optional(),
            details: z
              .array(
                z
                  .object({
                    label: z.string().min(1).max(160),
                    value: z.string().min(1).max(600),
                  })
                  .strict(),
              )
              .max(80),
          })
          .strict(),
      )
      .max(24)
      .default([]),
    quickWins: z
      .array(
        z
          .object({
            title: z.string().min(1).max(300),
            impact: z.string().max(120).optional(),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    /** Which AI crawlers the robots policy admits — the front door of agent access. */
    botAccess: z
      .array(
        z
          .object({
            name: z.string().min(1).max(60),
            vendor: z.string().min(1).max(60).optional(),
            status: z.string().min(1).max(40),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    provider: z.string().min(1).max(120),
    collectedAt: z.string().datetime().optional(),
    sourceUrl: z.string().url().max(2_048).optional(),
  })
  .strict();

/**
 * One reviewer's structured judgment about the machine draft. Bounded and typed: free text is
 * capped, decisions are enums, and nothing here can mark an action agent-ready — readiness still
 * requires invocation evidence. Provenance is "human-provided"; the product has no accounts, so
 * no assertion claims to come from a verified site owner.
 */
export const humanAssertionSchema = z
  .object({
    businessRole: z.string().min(2).max(120).optional(),
    // Generous bounds: a context graph carries up to 80 entities and a map up to 80 actions, and
    // a reviewer demoting most of a noisy graph is a legitimate judgment, not an attack.
    primaryEntityIds: z.array(z.string().min(1).max(500)).max(80).optional(),
    demotedEntityIds: z.array(z.string().min(1).max(500)).max(80).optional(),
    terminology: z
      .array(z.object({ term: z.string().min(1).max(120), meaning: z.string().min(1).max(300) }).strict())
      .max(40)
      .optional(),
    /** Judgments about the machine's own vocabulary: keep it, redefine it, or throw it out. */
    terminologyDecisions: z
      .array(
        z
          .object({
            term: z.string().min(1).max(240),
            decision: z.enum(["confirm", "replace", "reject"]),
            meaning: z.string().min(1).max(300).optional(),
          })
          .strict()
          .superRefine((entry, context) => {
            if (entry.decision === "replace" && !entry.meaning) {
              context.addIssue({ code: "custom", path: ["meaning"], message: "replace requires the new meaning" });
            }
          }),
      )
      .max(40)
      .optional(),
    actionDecisions: z
      .array(
        z
          .object({
            actionId: z.string().min(1).max(160),
            decision: z.enum(["confirm", "reject"]),
            boundary: actionBoundarySchema.optional(),
            rationale: z.string().min(1).max(500).optional(),
          })
          .strict(),
      )
      .max(80)
      .optional(),
  })
  .strict();

/** The overlay a refined report carries: what the human decided, when, and what could not apply. */
export const refinementSchema = z
  .object({
    assertions: humanAssertionSchema,
    decisions: z.number().int().nonnegative(),
    conflicts: z.array(z.string().min(1).max(300)).max(30),
    provenance: z.literal("human-provided"),
    appliedAt: z.string().datetime(),
  })
  .strict();

export const reportErrorSchema = z
  .object({
    code: z.string().min(1).max(100),
    phase: reportPhaseSchema,
    provider: z.string().min(1).max(100).optional(),
    message: z.string().min(1).max(600),
    retryable: z.boolean(),
  })
  .strict();

/**
 * How much of the site the audit read. `basic` is the free anonymous scan every visitor gets;
 * `deep` is the wider read an email address buys. The address itself is never part of a report —
 * a report is a public document with a shareable link.
 */
export const scanDepthSchema = z.enum(["basic", "deep"]);

export const reportRecordSchema = z
  .object({
    id: z.string().uuid(),
    parentReportId: z.string().uuid().optional(),
    status: reportStatusSchema,
    phase: reportPhaseSchema,
    mode: z.enum(["live", "demo"]),
    requestedUrl: z.string().url().max(2_048),
    canonicalUrl: z.string().url().max(2_048).optional(),
    createdAt: z.string().datetime(),
    completedAt: z.string().datetime().optional(),
    expiresAt: z.string().datetime(),
    actionModelVersion: z.string().min(1).max(40),
    scanDepth: scanDepthSchema.optional(),
    classification: classificationResultSchema.optional(),
    foundationAudit: foundationAuditSummarySchema.optional(),
    /** The publishing platform the site's own structured data names — detected, never guessed. */
    publishedWith: z
      .object({
        name: z.literal("WordLift"),
        evidence: z.string().min(1).max(300),
        sourceUrl: z.string().url().max(2_048),
      })
      .strict()
      .optional(),
    contextGraph: contextGraphSchema.optional(),
    capabilities: z.array(capabilityResultSchema).max(80).optional(),
    /** Present only on a human-refined revision; the machine draft never carries one. */
    refinement: refinementSchema.optional(),
    score: readinessScoreSchema.optional(),
    priorities: z.array(priorityGapSchema).max(3).optional(),
    errors: z.array(reportErrorSchema).max(30),
    evidenceTruncated: z.boolean(),
  })
  .strict()
  .superRefine((report, context) => {
    const evidenceCount = report.capabilities?.reduce((sum, item) => sum + item.evidence.length, 0) ?? 0;
    if (evidenceCount > MAX_EVIDENCE_ITEMS) {
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: `A report may contain at most ${MAX_EVIDENCE_ITEMS} evidence items`,
      });
    }

    if (report.parentReportId === report.id) {
      context.addIssue({ code: "custom", path: ["parentReportId"], message: "A report cannot parent itself" });
    }
  });

export const createReportRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    url: z.string().min(1).max(2_048),
    archetypeOverride: archetypeSchema.nullable().optional(),
    fixtureId: z.string().min(1).max(120).nullable().optional(),
    depth: scanDepthSchema.optional(),
  })
  .strict();

export const recompileReportRequestSchema = z.object({ archetype: archetypeSchema }).strict();
export const refineReportRequestSchema = humanAssertionSchema;

export const runningReportResponseSchema = z
  .object({
    reportId: z.string().uuid(),
    phase: reportPhaseSchema,
    retryUrl: z.string().min(1).max(2_048),
  })
  .strict();

export function serializedReportSize(report: unknown): number {
  return Buffer.byteLength(JSON.stringify(report), "utf8");
}
export function parseStoredReport(input: unknown, maximumBytes = DEFAULT_MAX_REPORT_BYTES) {
  const report = reportRecordSchema.parse(input);
  const size = serializedReportSize(report);
  if (size > maximumBytes) {
    throw new Error(`Report ${report.id} exceeds the ${maximumBytes}-byte storage ceiling`);
  }
  return report;
}

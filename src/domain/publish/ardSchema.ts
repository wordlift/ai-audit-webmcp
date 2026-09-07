import { z } from "zod";

/**
 * Agentic Resource Discovery, as this service writes it. The draft is still moving, so the
 * spelling lives here and nowhere else: the well-known path follows Google's announcement, the
 * identifier follows the entry schema in the spec (`spec/schemas/ard-entry.schema.json` in
 * ards-project/ard-spec), whose pattern is the thing a catalog validates against. The reader in
 * `agentCatalog.ts` accepts either spelling; the writer commits to one.
 */
export const ARD = {
  path: "/.well-known/ai-catalog.json",
  urnPrefix: "urn:air",
  specVersion: "1.0",
  skillType: "application/ai-skill+md",
  jsonLdType: "application/ld+json",
} as const;

const URN = /^urn:air:[a-zA-Z0-9.-]+(:[a-zA-Z0-9._-]+)+$/;

/** An ARD entry: the discovery-critical terms, and exactly one of `url` and `data`. Mirrors the spec's schema. */
export const ardEntrySchema = z
  .object({
    "@context": z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
    "@id": z.string().optional(),
    identifier: z.string().regex(URN, "an ARD identifier is a domain-anchored URN: urn:air:<publisher>:<namespace>:<name>"),
    displayName: z.string().min(1),
    type: z.string().min(1),
    url: z.string().url().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    representativeQueries: z.array(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    version: z.string().optional(),
    updatedAt: z.string().datetime().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((entry) => (entry.url ? 1 : 0) + (entry.data ? 1 : 0) === 1, { message: "an entry carries exactly one of url and data" });

/** The document at the well-known path: `entries`, and whatever else the transport adds. */
export const ardManifestSchema = z.object({ entries: z.array(ardEntrySchema) }).loose();

export type ArdEntry = z.infer<typeof ardEntrySchema>;
export type ArdManifest = z.infer<typeof ardManifestSchema>;

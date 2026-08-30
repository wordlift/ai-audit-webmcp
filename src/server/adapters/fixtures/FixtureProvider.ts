import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { normalizeTargetUrl } from "../../security/urlPolicy.js";
import {
  archetypeSchema,
  capabilityEvidenceSchema,
  contentCategorySchema,
  foundationAuditSummarySchema,
  reportErrorSchema,
} from "../../../shared/schemas/report.js";
import type { SitePageSnapshot } from "../scrape/ScrapeProvider.js";

const fixtureFormSchema = z.object({
  name: z.string(), method: z.string(), action: z.string(), inputNames: z.array(z.string()),
  hasDateInput: z.boolean(), hasSearchInput: z.boolean(),
}).strict();

const fixtureEntitySchema = z.object({
  id: z.string(),
  types: z.array(z.string()),
  name: z.string(),
  alternateNames: z.array(z.string()).default([]),
  description: z.string().optional(),
  sourceUrl: z.string().url(),
  sameAs: z.array(z.string().url()).default([]),
  offers: z.array(z.object({
    id: z.string().optional(), name: z.string().optional(), price: z.union([z.string(), z.number()]).optional(),
    priceCurrency: z.string().optional(), availability: z.string().optional(), url: z.string().url().optional(),
  }).strict()).default([]),
}).strict();

const fixturePageSchema: z.ZodType<SitePageSnapshot> = z.object({
  url: z.string().url(), title: z.string(), description: z.string(),
  role: z.enum(["entry", "detail", "offer", "policy", "contact", "other"]),
  text: z.string(), headings: z.array(z.string()), linkPaths: z.array(z.string()), linkLabels: z.array(z.string()),
  forms: z.array(fixtureFormSchema), jsonLdTypes: z.array(z.string()), entities: z.array(fixtureEntitySchema),
  pageTools: z.array(z.object({
    name: z.string(), description: z.string(), origin: z.enum(["declarative", "imperative"]),
    sourceUrl: z.string().url(), parameters: z.array(z.object({ name: z.string(), description: z.string() }).strict()),
  }).strict()),
  truncated: z.boolean(),
}).strict();

const fixtureSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().url(),
    archetype: archetypeSchema,
    status: z.enum(["completed", "partial", "failed"]).default("completed"),
    categories: z.array(contentCategorySchema),
    signals: z.array(z.string()),
    foundation: foundationAuditSummarySchema.optional(),
    errors: z.array(reportErrorSchema).default([]),
    evidence: z.array(capabilityEvidenceSchema),
    pages: z.array(fixturePageSchema).max(4).optional(),
  })
  .strict();

export type FixtureAudit = z.infer<typeof fixtureSchema>;

const fixtureFiles: Record<string, string> = {
  "commerce-retail": "commerce-retail/audit.json",
  "publisher-content": "publisher-content/audit.json",
  "travel-hospitality": "travel-hospitality/audit.json",
  "finance-insurance": "finance-insurance/audit.json",
  saas: "saas/audit.json",
  other: "other/audit.json",
  partial: "states/partial.json",
  failed: "states/failed.json",
};

export class FixtureProvider {
  constructor(private readonly root = process.cwd()) {}

  list(): string[] {
    return Object.keys(fixtureFiles);
  }

  get(fixtureId: string): FixtureAudit {
    const relativePath = fixtureFiles[fixtureId];
    if (!relativePath) throw new Error(`Unknown fixture ${fixtureId}`);
    return fixtureSchema.parse(JSON.parse(readFileSync(path.join(this.root, "fixtures", relativePath), "utf8")));
  }

  resolve(fixtureId: string | null | undefined, requestedUrl: string): FixtureAudit {
    if (fixtureId) return this.get(fixtureId);
    const normalized = normalizeTargetUrl(requestedUrl);
    const fixture = this.list().map((id) => this.get(id)).find((candidate) => new URL(candidate.url).host === normalized.host);
    if (!fixture) throw new UnknownFixtureError(normalized.host);
    return fixture;
  }
}

export class UnknownFixtureError extends Error {
  constructor(readonly host: string) {
    super(
      `No deterministic fixture is registered for ${host}. Demo mode covers alpina.travel, shop.example, publisher.example, insurance.example, saas.example, and organization.example.`,
    );
    this.name = "UnknownFixtureError";
  }
}

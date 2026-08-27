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

import { randomUUID } from "node:crypto";
import {
  DEFAULT_MAX_REPORT_BYTES,
  MAX_EVIDENCE_SNIPPET_LENGTH,
  parseStoredReport,
  reportRecordSchema,
  serializedReportSize,
} from "../../src/shared/schemas/report.js";
import type { ReportRecord } from "../../src/shared/types/index.js";

const now = "2026-08-27T05:00:00.000Z";

function report(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: randomUUID(),
    status: "completed",
    phase: "complete",
    mode: "demo",
    requestedUrl: "https://example.com/",
    createdAt: now,
    completedAt: now,
    expiresAt: "2026-09-27T05:00:00.000Z",
    actionModelVersion: "0.1.0",
    errors: [],
    evidenceTruncated: false,
    ...overrides,
  };
}

describe("report schemas", () => {
  it("accepts a bounded public report and stays below the Firestore ceiling", () => {
    const parsed = parseStoredReport(report());
    expect(parsed.id).toBeTruthy();
    expect(serializedReportSize(parsed)).toBeLessThan(DEFAULT_MAX_REPORT_BYTES);
  });

  it("fails closed when private or raw fields are introduced", () => {
    expect(() => reportRecordSchema.parse({ ...report(), rawHtml: "<html>secret</html>" })).toThrow();
    expect(() => reportRecordSchema.parse({ ...report(), authorizationHeader: "Bearer secret" })).toThrow();
  });

  it("rejects oversized evidence snippets", () => {
    const invalid = report({
      capabilities: [
        {
          actionId: "site.search",
          label: "Search",
          description: "Search the site",
          stage: "discover",
          intent: "informational",
          importance: 3,
          expected: true,
          expectationSource: ["archetype:other"],
          state: "human-only",
          humanSupport: true,
          agentSupport: false,
          appliesTo: [],
          evidence: [
            {
              id: "search-form",
              actionId: "site.search",
              audience: "human",
              kind: "form",
              sourceUrl: "https://example.com/",
              claim: "A search form is visible",
              confidence: 1,
              verification: "observed",
              collectedAt: now,
              snippet: "x".repeat(MAX_EVIDENCE_SNIPPET_LENGTH + 1),
            },
          ],
        },
      ],
    });
    expect(() => reportRecordSchema.parse(invalid)).toThrow(/500/);
  });

  it("enforces the configured serialized-size ceiling", () => {
    expect(() => parseStoredReport(report(), 100)).toThrow(/storage ceiling/);
  });
});

describe("human assertions", () => {
  it("accepts a reviewer demoting most of a noisy graph — the live failure was 14 demotions", async () => {
    const { humanAssertionSchema } = await import("../../src/shared/schemas/report.js");
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `urn:entity:${index}`);

    expect(humanAssertionSchema.parse({ demotedEntityIds: ids(14) }).demotedEntityIds).toHaveLength(14);
    expect(humanAssertionSchema.parse({ primaryEntityIds: ids(80), actionDecisions: [] }).primaryEntityIds).toHaveLength(80);
    expect(humanAssertionSchema.safeParse({ demotedEntityIds: ids(81) }).success).toBe(false);
  });
});

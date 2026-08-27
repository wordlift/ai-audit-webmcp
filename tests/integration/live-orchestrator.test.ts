import { randomUUID } from "node:crypto";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import type { AuditEvidenceBundle, AuditProvider } from "../../src/server/adapters/audit/AuditProvider.js";
import { AuditProviderError } from "../../src/server/adapters/audit/WordLiftAudit.js";
import type { ClassifierProvider } from "../../src/server/adapters/classify/ClassifierProvider.js";
import { FixtureProvider } from "../../src/server/adapters/fixtures/FixtureProvider.js";
import type { ScrapeProvider, SiteSnapshot } from "../../src/server/adapters/scrape/ScrapeProvider.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import { AuditOrchestrator, type OrchestratorOptions } from "../../src/server/services/AuditOrchestrator.js";

const fixedNow = new Date("2026-08-27T05:00:00.000Z");

const snapshot: SiteSnapshot = {
  requestedUrl: "https://alpina.travel/",
  canonicalUrl: "https://alpina.travel/",
  title: "Lungau Holidays & Family Apartment",
  description: "Alpine holiday apartments in Lungau, Austria.",
  text: Array.from({ length: 60 }, (_, index) => `alpine lungau apartment holiday word${index}`).join(" "),
  headings: ["Samspitze 4", "Book your stay"],
  linkPaths: ["/booking", "/faq", "/contact", "/rooms/samspitze-4"],
  linkLabels: ["book now", "faq", "contact"],
  forms: [
    {
      name: "booking",
      method: "get",
      action: "/booking",
      inputNames: ["checkin", "checkout", "adults"],
      hasDateInput: true,
      hasSearchInput: false,
    },
  ],
  jsonLdTypes: ["LodgingBusiness", "Offer", "Organization"],
  discovery: [
    { kind: "llms", url: "https://alpina.travel/llms.txt", status: "valid", found: true, declaredNames: [] },
    {
      kind: "webmcp-tools",
      url: "https://alpina.travel/.well-known/webmcp/tools.json",
      status: "valid",
      found: true,
      declaredNames: ["check_availability"],
    },
    { kind: "openapi", url: "https://alpina.travel/openapi.json", status: "invalid", found: false, declaredNames: [] },
  ],
  truncated: false,
};

const auditBundle: AuditEvidenceBundle = {
  url: "https://alpina.travel/",
  status: "completed",
  foundation: {
    score: 94,
    summary: "Strong SEO and agent-readiness foundations.",
    findings: ["Quick win: Correct .well-known JSON endpoints"],
    provider: "wordlift-ai-audit",
  },
  signals: ["agent:mcp-json", "schema:LodgingBusiness"],
  evidence: [],
  errors: [],
};

function stubScraper(result: SiteSnapshot | Error): ScrapeProvider {
  return {
    name: "stub-scrape",
    collect: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function stubAudit(result: AuditEvidenceBundle | Error): AuditProvider {
  return {
    name: "stub-audit",
    audit: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

function stubClassifier(categories: Array<{ name: string; confidence: number }>, failureReason?: string): ClassifierProvider {
  return {
    name: "stub-classifier",
    classify: async () => ({ categories, model: "google-natural-language-v2", failureReason }),
  };
}

function liveOrchestrator(providers: OrchestratorOptions["providers"]) {
  const store = new MemoryReportStore(900_000, () => fixedNow);
  const orchestrator = new AuditOrchestrator(store, loadActionModel(), new FixtureProvider(), {
    publicAppUrl: "https://audit.example/",
    ttlDays: 30,
    now: () => fixedNow,
    mode: "live",
    providers,
  });
  return { store, orchestrator };
}

const travelCategories = [{ name: "/Travel & Transportation/Hotels & Accommodations", confidence: 0.92 }];

describe("live orchestrator", () => {
  it("compiles the same domain objects as fixture mode from live inputs", async () => {
    const { orchestrator } = liveOrchestrator({
      scrape: stubScraper(snapshot),
      audit: stubAudit(auditBundle),
      classify: stubClassifier(travelCategories),
    });

    const report = await orchestrator.create({ requestId: randomUUID(), url: "alpina.travel" });

    expect(report.mode).toBe("live");
    expect(report.status).toBe("completed");
    expect(report.classification?.primaryArchetype).toBe("travel-hospitality");
    expect(report.classification?.categories[0].name).toBe("/Travel & Transportation/Hotels & Accommodations");
    expect(report.classification?.model).toBe("google-natural-language-v2");
    expect(report.foundationAudit?.score).toBe(94);
    expect(report.capabilities?.length).toBeGreaterThan(0);
    expect(report.score?.value).toBeGreaterThanOrEqual(0);
  });

  it("keeps a declared WebMCP tool unverified so it adds no readiness points", async () => {
    const { orchestrator } = liveOrchestrator({
      scrape: stubScraper(snapshot),
      audit: stubAudit(auditBundle),
      classify: stubClassifier(travelCategories),
    });

    const report = await orchestrator.create({ requestId: randomUUID(), url: "alpina.travel" });
    const availability = report.capabilities?.find((capability) => capability.actionId === "availability.check");

    expect(availability?.humanSupport).toBe(true);
    expect(availability?.evidence.some((item) => item.kind === "webmcp" && item.verification === "declared")).toBe(true);
    expect(availability?.state).toBe("unverified");
    expect(report.score?.counts.ready).toBe(0);
  });

  it("returns a partial report when the foundation audit fails but the page was collected", async () => {
    const { orchestrator } = liveOrchestrator({
      scrape: stubScraper(snapshot),
      audit: stubAudit(new AuditProviderError("audit_timeout", "The audit service took too long to respond.", true)),
      classify: stubClassifier(travelCategories),
    });

    const report = await orchestrator.create({ requestId: randomUUID(), url: "alpina.travel" });

    expect(report.status).toBe("partial");
    expect(report.foundationAudit).toBeUndefined();
    expect(report.errors[0]).toMatchObject({ code: "audit_timeout", provider: "wordlift-ai-audit", retryable: true });
    expect(report.capabilities?.length).toBeGreaterThan(0);
  });

  it("marks classification provisional when Google is unavailable", async () => {
    const { orchestrator } = liveOrchestrator({
      scrape: stubScraper(snapshot),
      audit: stubAudit(auditBundle),
      classify: stubClassifier([], "Content classification was unavailable (code 7)."),
    });

    const report = await orchestrator.create({ requestId: randomUUID(), url: "alpina.travel" });

    expect(report.classification?.categories).toEqual([]);
    expect(report.classification?.primaryArchetype).toBe("travel-hospitality");
    expect(report.errors.some((error) => error.code === "classifier_unavailable")).toBe(true);
  });

  it("fails honestly when no evidence at all could be collected", async () => {
    const { orchestrator } = liveOrchestrator({
      scrape: stubScraper(new Error("socket hang up")),
      audit: stubAudit(new AuditProviderError("audit_unreachable", "The audit service could not be reached.", true)),
      classify: stubClassifier(travelCategories),
    });

    const report = await orchestrator.create({ requestId: randomUUID(), url: "alpina.travel" });

    expect(report.status).toBe("failed");
    expect(report.capabilities).toBeUndefined();
    expect(report.errors.map((error) => error.code)).toContain("collector_failed");
  });

  it("refuses fixture selection in live mode", async () => {
    const { orchestrator } = liveOrchestrator({
      scrape: stubScraper(snapshot),
      audit: stubAudit(auditBundle),
      classify: stubClassifier(travelCategories),
    });

    await expect(
      orchestrator.create({ requestId: randomUUID(), url: "alpina.travel", fixtureId: "saas" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

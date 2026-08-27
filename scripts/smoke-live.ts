/**
 * Live smoke test: runs one real audit through the configured providers and prints a compact
 * result. Usage: `npm run smoke:live -- https://alpina.travel`
 *
 * Requires live credentials in the environment. Nothing here writes to the repository.
 */
import { randomUUID } from "node:crypto";
import { loadActionModel } from "../src/domain/action-model/loadModel.js";
import { WordLiftAuditProvider } from "../src/server/adapters/audit/WordLiftAudit.js";
import { GoogleNlpClassifier } from "../src/server/adapters/classify/GoogleNlp.js";
import { FixtureProvider } from "../src/server/adapters/fixtures/FixtureProvider.js";
import { NativeFetchCollector } from "../src/server/adapters/scrape/NativeFetch.js";
import { createScrapingBeeCollector } from "../src/server/adapters/scrape/ScrapingBee.js";
import { FirestoreReportStore, MemoryReportStore } from "../src/server/adapters/store/index.js";
import { loadConfig } from "../src/server/config.js";
import { AuditOrchestrator } from "../src/server/services/AuditOrchestrator.js";

const target = process.argv[2];
if (!target) {
  console.error("Usage: npm run smoke:live -- https://example.com");
  process.exit(2);
}

const config = loadConfig();
if (config.AUDIT_PROVIDER !== "wordlift") {
  console.error("Set AUDIT_PROVIDER=wordlift (plus credentials) to run a live smoke test.");
  process.exit(2);
}

const store = config.REPORT_STORE === "firestore"
  ? FirestoreReportStore.fromProject(config.GOOGLE_CLOUD_PROJECT, config.MAX_REPORT_BYTES)
  : new MemoryReportStore(config.MAX_REPORT_BYTES);

const orchestrator = new AuditOrchestrator(store, loadActionModel(config.ACTION_MODEL_VERSION), new FixtureProvider(), {
  publicAppUrl: config.PUBLIC_APP_URL,
  ttlDays: config.REPORT_TTL_DAYS,
  mode: "live",
  providers: {
    audit: new WordLiftAuditProvider({
      baseUrl: config.AI_AUDIT_BASE_URL as string,
      apiKey: config.WORDLIFT_API_KEY as string,
    }),
    scrape: config.SCRAPE_PROVIDER === "scrapingbee"
      ? createScrapingBeeCollector({ apiKey: config.SCRAPINGBEE_API_KEY as string })
      : new NativeFetchCollector(),
    classify: config.CLASSIFIER_PROVIDER === "google-nlp"
      ? new GoogleNlpClassifier({ projectId: config.GOOGLE_CLOUD_PROJECT })
      : undefined,
  },
});

const started = Date.now();
const report = await orchestrator.create({ requestId: randomUUID(), url: target });
const seconds = ((Date.now() - started) / 1_000).toFixed(1);

console.log(`\n${report.status.toUpperCase()} in ${seconds}s — ${orchestrator.reportUrl(report.id)}`);
console.log(`Archetype: ${report.classification?.primaryArchetype} (${report.classification?.confidence}${
  report.classification?.provisional ? ", provisional" : ""
})`);
console.log(`Categories: ${report.classification?.categories.map((c) => `${c.name} ${c.confidence.toFixed(2)}`).join(" | ") || "none"}`);
console.log(`Agent readiness: ${report.score?.value}/100 · Foundation: ${report.foundationAudit?.score ?? "n/a"}/100`);
console.log(`Counts: ${JSON.stringify(report.score?.counts)}`);

for (const capability of report.capabilities ?? []) {
  const evidence = capability.evidence.map((item) => `${item.audience}/${item.verification}`).join(", ") || "none";
  console.log(`  ${capability.state.padEnd(16)} ${capability.actionId.padEnd(22)} ${evidence}`);
}

console.log("\nTop gaps:");
for (const gap of report.priorities ?? []) console.log(`  - ${gap.label}: ${gap.reason}`);
if (report.errors.length > 0) console.log(`\nErrors: ${report.errors.map((error) => `${error.code} (${error.message})`).join("; ")}`);

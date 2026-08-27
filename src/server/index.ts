import path from "node:path";
import { loadActionModel } from "../domain/action-model/loadModel.js";
import { createApp } from "./app.js";
import { WordLiftAuditProvider } from "./adapters/audit/WordLiftAudit.js";
import { GoogleNlpClassifier } from "./adapters/classify/GoogleNlp.js";
import { FixtureProvider } from "./adapters/fixtures/FixtureProvider.js";
import { NativeFetchCollector } from "./adapters/scrape/NativeFetch.js";
import { createScrapingBeeCollector } from "./adapters/scrape/ScrapingBee.js";
import { FirestoreReportStore, MemoryReportStore } from "./adapters/store/index.js";
import { loadConfig } from "./config.js";
import { AuditOrchestrator, type OrchestratorOptions } from "./services/AuditOrchestrator.js";

const config = loadConfig();
const store = config.REPORT_STORE === "firestore"
  ? FirestoreReportStore.fromProject(config.GOOGLE_CLOUD_PROJECT, config.MAX_REPORT_BYTES)
  : new MemoryReportStore(config.MAX_REPORT_BYTES);

const mode: OrchestratorOptions["mode"] = config.AUDIT_PROVIDER === "wordlift" ? "live" : "demo";
const providers: OrchestratorOptions["providers"] = mode === "live"
  ? {
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
    }
  : undefined;

const orchestrator = new AuditOrchestrator(store, loadActionModel(config.ACTION_MODEL_VERSION), new FixtureProvider(), {
  publicAppUrl: config.PUBLIC_APP_URL,
  ttlDays: config.REPORT_TTL_DAYS,
  mode,
  providers,
});

const app = createApp({
  staticDirectory: path.resolve(process.cwd(), "dist"),
  orchestrator,
  trustProxy: config.NODE_ENV === "production",
});

const server = app.listen(config.PORT, () => {
  console.log(`WordLift AI Audit WebMCP listening on ${config.PORT} in ${mode} mode`);
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

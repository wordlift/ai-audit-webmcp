import path from "node:path";
import { loadActionModel } from "../domain/action-model/loadModel.js";
import { createApp } from "./app.js";
import { FixtureProvider } from "./adapters/fixtures/FixtureProvider.js";
import { FirestoreReportStore, MemoryReportStore } from "./adapters/store/index.js";
import { loadConfig } from "./config.js";
import { AuditOrchestrator } from "./services/AuditOrchestrator.js";

const config = loadConfig();
const store = config.REPORT_STORE === "firestore"
  ? FirestoreReportStore.fromProject(config.GOOGLE_CLOUD_PROJECT, config.MAX_REPORT_BYTES)
  : new MemoryReportStore(config.MAX_REPORT_BYTES);
const orchestrator = new AuditOrchestrator(store, loadActionModel(config.ACTION_MODEL_VERSION), new FixtureProvider(), {
  publicAppUrl: config.PUBLIC_APP_URL,
  ttlDays: config.REPORT_TTL_DAYS,
});
const port = config.PORT;
const app = createApp({ staticDirectory: path.resolve(process.cwd(), "dist"), orchestrator });

const server = app.listen(port, () => {
  console.log(`WordLift AI Audit WebMCP listening on ${port}`);
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

import path from "node:path";
import { loadActionModel } from "../domain/action-model/loadModel.js";
import { createApp } from "./app.js";
import { WordLiftAuditProvider } from "./adapters/audit/WordLiftAudit.js";
import { GoogleNlpClassifier } from "./adapters/classify/GoogleNlp.js";
import { FixtureProvider } from "./adapters/fixtures/FixtureProvider.js";
import { NativeFetchCollector } from "./adapters/scrape/NativeFetch.js";
import { createScrapingBeeCollector } from "./adapters/scrape/ScrapingBee.js";
import { FirestoreClaimStore, MemoryClaimStore } from "./adapters/claims/index.js";
import { FirestoreLeadStore, HubSpotLeadDelivery, MemoryLeadStore } from "./adapters/leads/index.js";
import { ContentAnalysisProvider } from "./adapters/markup/ContentAnalysis.js";
import { FallbackMarkupProvider } from "./adapters/markup/FallbackMarkup.js";
import { GeminiMarkupProvider } from "./adapters/markup/GeminiMarkup.js";
import { FirestoreVisitStore } from "./adapters/visits/FirestoreVisitStore.js";
import { MemoryVisitStore } from "./adapters/visits/MemoryVisitStore.js";
import { GOOGLE_CRAWLER_RANGE_URLS, VisitorClassifier } from "./security/visitorClass.js";
import { VisitLedger } from "./services/VisitLedger.js";
import { FirestoreReportStore, MemoryReportStore } from "./adapters/store/index.js";
import { loadConfig } from "./config.js";
import { OPENAI_CONNECTOR_EGRESS, OPENAI_CONNECTOR_EGRESS_URL } from "./security/openaiConnectorEgress.js";
import {
  ANTHROPIC_EGRESS,
  PlatformEgress,
  parsePlatformRanges,
  startPlatformEgressRefresh,
} from "./security/platformEgress.js";
import { FirestorePublishedSiteStore } from "./adapters/published/FirestorePublishedSiteStore.js";
import { MemoryPublishedSiteStore } from "./adapters/published/MemoryPublishedSiteStore.js";
import { AuditOrchestrator, type OrchestratorOptions } from "./services/AuditOrchestrator.js";

const config = loadConfig();
const store = config.REPORT_STORE === "firestore"
  ? FirestoreReportStore.fromProject(config.GOOGLE_CLOUD_PROJECT, config.MAX_REPORT_BYTES)
  : new MemoryReportStore(config.MAX_REPORT_BYTES);

const leads = config.REPORT_STORE === "firestore"
  ? FirestoreLeadStore.fromProject(config.GOOGLE_CLOUD_PROJECT)
  : new MemoryLeadStore();

const claims = config.REPORT_STORE === "firestore"
  ? FirestoreClaimStore.fromProject(config.GOOGLE_CLOUD_PROJECT)
  : new MemoryClaimStore();

// The sites that publish through us, for the entry source registries read.
const published = config.REPORT_STORE === "firestore"
  ? FirestorePublishedSiteStore.fromProject(config.GOOGLE_CLOUD_PROJECT)
  : new MemoryPublishedSiteStore();

// Without a form configured, a deep scan still runs and still records what it owes; nothing is
// sent until the delivery form is set.
const leadDelivery = config.HUBSPOT_PORTAL_ID && config.HUBSPOT_FORM_GUID
  ? new HubSpotLeadDelivery({
      portalId: config.HUBSPOT_PORTAL_ID,
      formGuid: config.HUBSPOT_FORM_GUID,
      region: config.HUBSPOT_REGION,
      sourceField: config.HUBSPOT_SOURCE_FIELD,
    })
  : undefined;

// The entities a page is about: WordLift's own Content Analysis, or the Gemini stand-in it
// replaced, behind one interface. Nothing else in the audit knows which.
const gemini = () =>
  new GeminiMarkupProvider({
    apiKey: config.GEMINI_API_KEY as string,
    model: config.GEMINI_MODEL,
    pricing: { inputUsdPerMillion: config.GEMINI_INPUT_USD_PER_MILLION, outputUsdPerMillion: config.GEMINI_OUTPUT_USD_PER_MILLION },
  });
const primaryMarkup =
  config.MARKUP_PROVIDER === "content-analysis"
    ? new ContentAnalysisProvider({ apiKey: config.WORDLIFT_API_KEY as string, endpoint: config.CONTENT_ANALYSIS_URL, confidence: config.CONTENT_ANALYSIS_CONFIDENCE })
    : config.MARKUP_PROVIDER === "gemini"
      ? gemini()
      : undefined;
// The fallback steps in for a page only when the first extractor does not answer, and for names only.
const markup = primaryMarkup && config.MARKUP_FALLBACK === "gemini" && config.MARKUP_PROVIDER !== "gemini" ? new FallbackMarkupProvider(primaryMarkup, gemini()) : primaryMarkup;

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
      markup,
    }
  : undefined;

const orchestrator = new AuditOrchestrator(store, loadActionModel(config.ACTION_MODEL_VERSION), new FixtureProvider(), {
  publicAppUrl: config.PUBLIC_APP_URL,
  ttlDays: config.REPORT_TTL_DAYS,
  mode,
  providers,
  markupOnBasic: config.MARKUP_ON_BASIC,
  published,
});

// A hosted assistant's users all arrive from its published addresses, so those draw on a pool per
// platform rather than one address's budget. Anthropic's range is stable; OpenAI's changes with
// their infrastructure, so the snapshot is re-read on an interval and kept if a read fails.
const platformEgress = new PlatformEgress([
  ...ANTHROPIC_EGRESS,
  ...OPENAI_CONNECTOR_EGRESS.map((cidr) => ({ platform: "openai", cidr })),
  ...parsePlatformRanges(config.PLATFORM_EGRESS_RANGES),
]);
if (config.PLATFORM_EGRESS_REFRESH_MINUTES > 0 && config.NODE_ENV !== "test") {
  startPlatformEgressRefresh({
    egress: platformEgress,
    platform: "openai",
    url: OPENAI_CONNECTOR_EGRESS_URL,
    intervalMs: config.PLATFORM_EGRESS_REFRESH_MINUTES * 60_000,
    log: (event, ...details) => console.log(event, ...details),
  });
}

// The ledger: who reads a report and who activates a capability, by class and by day. Google's
// crawler ranges are read the way OpenAI's are, so a "Googlebot" from elsewhere is a claim.
const crawlerRanges = new PlatformEgress();
if (config.NODE_ENV !== "test") {
  for (const { platform, url } of GOOGLE_CRAWLER_RANGE_URLS) {
    startPlatformEgressRefresh({ egress: crawlerRanges, platform, url, intervalMs: 24 * 60 * 60 * 1_000, log: (event, ...details) => console.log(event, ...details) });
  }
}
const visits = new VisitLedger({
  store: config.REPORT_STORE === "firestore" ? FirestoreVisitStore.fromProject(config.GOOGLE_CLOUD_PROJECT) : new MemoryVisitStore(),
  classifier: new VisitorClassifier({ platforms: platformEgress, crawlers: crawlerRanges }),
  ttlDays: config.REPORT_TTL_DAYS,
  log: (event, ...details) => console.error(event, ...details),
});

const app = createApp({
  staticDirectory: path.resolve(process.cwd(), "dist"),
  orchestrator,
  leads,
  leadDelivery,
  claims,
  reportTtlDays: config.REPORT_TTL_DAYS,
  appsChallenge: config.OPENAI_APPS_CHALLENGE,
  trustProxy: config.NODE_ENV === "production",
  rateLimits: config.NODE_ENV === "test" ? { enabled: false } : { daily: config.AUDIT_DAILY_BUDGET },
  platformEgress,
  markup,
  visits,
  published,
  indexable: config.PUBLIC_INDEXABLE,
  ...(config.NODE_ENV === "test"
    ? {}
    : { observe: { intervalDays: config.OBSERVE_INTERVAL_DAYS, tickMinutes: config.OBSERVE_TICK_MINUTES, perTick: config.OBSERVE_PER_TICK } }),
});

const server = app.listen(config.PORT, () => {
  console.log(`WordLift AI Audit WebMCP listening on ${config.PORT} in ${mode} mode`);
});

function shutdown(signal: string) {
  console.log(`${signal} received; closing HTTP server`);
  void visits.close();
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

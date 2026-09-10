import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
    AUDIT_PROVIDER: z.enum(["fixtures", "wordlift"]).default("fixtures"),
    REPORT_STORE: z.enum(["memory", "firestore"]).default("memory"),
    SCRAPE_PROVIDER: z.enum(["fixtures", "native-fetch", "scrapingbee"]).default("fixtures"),
    CLASSIFIER_PROVIDER: z.enum(["fixtures", "google-nlp"]).default("fixtures"),
    PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    ACTION_MODEL_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("0.1.0"),
    REPORT_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    MAX_REPORT_BYTES: z.coerce.number().int().min(100_000).max(1_000_000).default(900_000),
    AI_AUDIT_BASE_URL: z.string().url().optional(),
    WORDLIFT_API_KEY: z.string().min(1).optional(),
    SCRAPINGBEE_API_KEY: z.string().min(1).optional(),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    /** Domain-verification token for the OpenAI app directory; absent means the check 404s. */
    OPENAI_APPS_CHALLENGE: z.string().min(1).max(500).optional(),
    /**
     * The HubSpot form a deep scan's report is delivered through — the same portal and form the
     * WordLift AI Audit already submits to, so one person is one contact whichever audit they came
     * through. Both absent means deep-scan reports queue and nothing is sent.
     */
    HUBSPOT_PORTAL_ID: z.string().min(1).max(40).optional(),
    HUBSPOT_FORM_GUID: z.string().min(1).max(80).optional(),
    /** The portal's data region. An EU portal submits to its own host. */
    HUBSPOT_REGION: z.enum(["na1", "eu1"]).default("na1"),
    /**
     * A form property recording which surface a lead came from. Only set it once the property
     * exists on the form: HubSpot rejects a submission naming a field the form does not have.
     */
    HUBSPOT_SOURCE_FIELD: z.string().min(1).max(80).optional(),
    /**
     * Extra egress ranges for hosted assistants, `platform=cidr` entries separated by commas.
     * Anthropic's range and a snapshot of OpenAI's are built in; this adds a platform or a range
     * published after the build.
     */
    PLATFORM_EGRESS_RANGES: z.string().max(20_000).optional(),
    /** How often OpenAI's published connector ranges are re-read at runtime; 0 keeps the snapshot. */
    PLATFORM_EGRESS_REFRESH_MINUTES: z.coerce.number().int().min(0).max(10_080).default(360),
    /** Audits the whole service runs in a day, whoever asks: the bill's ceiling. 0 removes it. */
    AUDIT_DAILY_BUDGET: z.coerce.number().int().min(0).max(1_000_000).default(2_000),
    /**
     * Where the markup a page should have comes from. `gemini` is the stand-in — Gemini 2.5 Flash
     * through the Gemini API — until WordLift's own service replaces it behind the same interface.
     */
    MARKUP_PROVIDER: z.enum(["none", "gemini", "content-analysis"]).default("none"),
    /** WordLift's Content Analysis v3, the entity extraction behind Fix; authenticates with the WordLift key. */
    CONTENT_ANALYSIS_URL: z.string().url().default("https://wordlift-lab--content-analysis-v3-web-app.modal.run"),
    CONTENT_ANALYSIS_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.45),
    /** A second extractor behind the first, for names only, used when the first does not answer. */
    MARKUP_FALLBACK: z.enum(["none", "gemini"]).default("none"),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).max(80).default("gemini-2.5-flash"),
    /** List price used for the estimate, USD per million tokens. Change when Google does. */
    GEMINI_INPUT_USD_PER_MILLION: z.coerce.number().min(0).default(0.3),
    GEMINI_OUTPUT_USD_PER_MILLION: z.coerce.number().min(0).default(2.5),
    /** Which pages of a basic scan are sent: those that declare no entities, all, or none. */
    MARKUP_ON_BASIC: z.enum(["thin", "all", "none"]).default("thin"),
    /**
     * Observe: a site with a delivered deep-scan address is read again every this many days, and a
     * note goes to the address only when something moved. Zero never re-reads and never writes.
     */
    OBSERVE_INTERVAL_DAYS: z.coerce.number().int().min(0).max(90).default(7),
    OBSERVE_TICK_MINUTES: z.coerce.number().int().min(1).max(1_440).default(60),
    OBSERVE_PER_TICK: z.coerce.number().int().min(1).max(100).default(5),
    /** False on a preview deployment: robots are told to stay out and every response says noindex. */
    PUBLIC_INDEXABLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .strict()
  .superRefine((environment, context) => {
    if (environment.AUDIT_PROVIDER === "wordlift") {
      if (!environment.AI_AUDIT_BASE_URL) {
        context.addIssue({ code: "custom", path: ["AI_AUDIT_BASE_URL"], message: "Required in WordLift mode" });
      }
      if (!environment.WORDLIFT_API_KEY) {
        context.addIssue({ code: "custom", path: ["WORDLIFT_API_KEY"], message: "Required in WordLift mode" });
      }
    }

    // Half a form is a silent misconfiguration: leads would queue forever with nothing draining
    // them, and the deployment would look like it was delivering.
    const hubspot = [environment.HUBSPOT_PORTAL_ID, environment.HUBSPOT_FORM_GUID];
    if (hubspot.some(Boolean) && !hubspot.every(Boolean)) {
      context.addIssue({
        code: "custom",
        path: ["HUBSPOT_FORM_GUID"],
        message: "HUBSPOT_PORTAL_ID and HUBSPOT_FORM_GUID are set together or not at all",
      });
    }

    if (environment.SCRAPE_PROVIDER === "scrapingbee" && !environment.SCRAPINGBEE_API_KEY) {
      context.addIssue({ code: "custom", path: ["SCRAPINGBEE_API_KEY"], message: "Required for ScrapingBee" });
    }

    if (environment.MARKUP_PROVIDER === "gemini" && !environment.GEMINI_API_KEY) {
      context.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "Required for the Gemini markup provider" });
    }
    if (environment.MARKUP_PROVIDER === "content-analysis" && !environment.WORDLIFT_API_KEY) {
      context.addIssue({ code: "custom", path: ["WORDLIFT_API_KEY"], message: "Required for the Content Analysis provider" });
    }
    if (environment.MARKUP_FALLBACK === "gemini" && !environment.GEMINI_API_KEY) {
      context.addIssue({ code: "custom", path: ["GEMINI_API_KEY"], message: "Required for the Gemini fallback" });
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const knownEnvironment = {
    NODE_ENV: environment.NODE_ENV,
    PORT: environment.PORT,
    AUDIT_PROVIDER: environment.AUDIT_PROVIDER,
    REPORT_STORE: environment.REPORT_STORE,
    SCRAPE_PROVIDER: environment.SCRAPE_PROVIDER,
    CLASSIFIER_PROVIDER: environment.CLASSIFIER_PROVIDER,
    PUBLIC_APP_URL: environment.PUBLIC_APP_URL,
    ACTION_MODEL_VERSION: environment.ACTION_MODEL_VERSION,
    REPORT_TTL_DAYS: environment.REPORT_TTL_DAYS,
    MAX_REPORT_BYTES: environment.MAX_REPORT_BYTES,
    AI_AUDIT_BASE_URL: environment.AI_AUDIT_BASE_URL,
    WORDLIFT_API_KEY: environment.WORDLIFT_API_KEY,
    SCRAPINGBEE_API_KEY: environment.SCRAPINGBEE_API_KEY,
    GOOGLE_CLOUD_PROJECT: environment.GOOGLE_CLOUD_PROJECT,
    OPENAI_APPS_CHALLENGE: environment.OPENAI_APPS_CHALLENGE,
    HUBSPOT_PORTAL_ID: environment.HUBSPOT_PORTAL_ID,
    HUBSPOT_FORM_GUID: environment.HUBSPOT_FORM_GUID,
    HUBSPOT_REGION: environment.HUBSPOT_REGION,
    HUBSPOT_SOURCE_FIELD: environment.HUBSPOT_SOURCE_FIELD,
    PLATFORM_EGRESS_RANGES: environment.PLATFORM_EGRESS_RANGES,
    PLATFORM_EGRESS_REFRESH_MINUTES: environment.PLATFORM_EGRESS_REFRESH_MINUTES,
    AUDIT_DAILY_BUDGET: environment.AUDIT_DAILY_BUDGET,
    MARKUP_PROVIDER: environment.MARKUP_PROVIDER,
    CONTENT_ANALYSIS_URL: environment.CONTENT_ANALYSIS_URL,
    CONTENT_ANALYSIS_CONFIDENCE: environment.CONTENT_ANALYSIS_CONFIDENCE,
    MARKUP_FALLBACK: environment.MARKUP_FALLBACK,
    GEMINI_API_KEY: environment.GEMINI_API_KEY,
    GEMINI_MODEL: environment.GEMINI_MODEL,
    GEMINI_INPUT_USD_PER_MILLION: environment.GEMINI_INPUT_USD_PER_MILLION,
    GEMINI_OUTPUT_USD_PER_MILLION: environment.GEMINI_OUTPUT_USD_PER_MILLION,
    MARKUP_ON_BASIC: environment.MARKUP_ON_BASIC,
    OBSERVE_INTERVAL_DAYS: environment.OBSERVE_INTERVAL_DAYS,
    OBSERVE_TICK_MINUTES: environment.OBSERVE_TICK_MINUTES,
    OBSERVE_PER_TICK: environment.OBSERVE_PER_TICK,
    PUBLIC_INDEXABLE: environment.PUBLIC_INDEXABLE,
  };

  return environmentSchema.parse(knownEnvironment);
}

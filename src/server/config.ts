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

    if (environment.SCRAPE_PROVIDER === "scrapingbee" && !environment.SCRAPINGBEE_API_KEY) {
      context.addIssue({ code: "custom", path: ["SCRAPINGBEE_API_KEY"], message: "Required for ScrapingBee" });
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
  };

  return environmentSchema.parse(knownEnvironment);
}

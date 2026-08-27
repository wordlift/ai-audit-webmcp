import type { ContentCategory } from "../../../shared/types/index.js";
import type { ClassificationOutcome, ClassifierProvider } from "./ClassifierProvider.js";

const MIN_WORDS = 20;
const MAX_CHARACTERS = 20_000;
const MAX_CATEGORIES = 20;

export interface GoogleClassifierClient {
  classifyText(request: unknown): Promise<[{ categories?: Array<{ name?: string | null; confidence?: number | null }> | null }]>;
}

export interface GoogleNlpOptions {
  projectId?: string;
  timeoutMs?: number;
  /** Injected in tests; production lazily loads the Google client. */
  client?: GoogleClassifierClient;
}

/**
 * Google Natural Language content classification, pinned to the V2 category model. The exact
 * category strings and confidences are stored so a report stays reproducible from what Google
 * returned, not from a later re-run.
 */
export class GoogleNlpClassifier implements ClassifierProvider {
  readonly name = "google-natural-language-v2";
  #client: GoogleClassifierClient | null;

  constructor(private readonly options: GoogleNlpOptions = {}) {
    this.#client = options.client ?? null;
  }

  async classify({ text }: { text: string; url: string }): Promise<ClassificationOutcome> {
    const content = text.slice(0, MAX_CHARACTERS).trim();
    if (content.split(/\s+/).filter(Boolean).length < MIN_WORDS) {
      return {
        categories: [],
        model: this.name,
        failureReason: "The page did not contain enough readable text to classify.",
      };
    }

    try {
      const client = await this.client();
      const [response] = await client.classifyText({
        document: { content, type: "PLAIN_TEXT" },
        classificationModelOptions: { v2Model: { contentCategoriesVersion: "V2" } },
        timeout: this.options.timeoutMs ?? 20_000,
      });

      return { categories: normalizeCategories(response.categories ?? []), model: this.name };
    } catch (error) {
      return {
        categories: [],
        model: this.name,
        failureReason: `Content classification was unavailable (${describe(error)}); the archetype was inferred from site behavior only.`,
      };
    }
  }

  private async client(): Promise<GoogleClassifierClient> {
    if (this.#client) return this.#client;
    const { LanguageServiceClient } = await import("@google-cloud/language");
    // Billing and API enablement follow the quota project, not the local gcloud default, so the
    // configured project must be named explicitly for both.
    this.#client = new LanguageServiceClient(
      this.options.projectId
        ? { projectId: this.options.projectId, quotaProjectId: this.options.projectId }
        : {},
    ) as unknown as GoogleClassifierClient;
    return this.#client;
  }
}

export function normalizeCategories(
  categories: Array<{ name?: string | null; confidence?: number | null }>,
): ContentCategory[] {
  return categories
    .map((category) => ({
      name: (category.name ?? "").slice(0, 240),
      confidence: Math.max(0, Math.min(1, category.confidence ?? 0)),
    }))
    .filter((category) => category.name.length > 0)
    .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name))
    .slice(0, MAX_CATEGORIES);
}

function describe(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) return `code ${String((error as { code: unknown }).code)}`;
  return error instanceof Error ? error.name : "unknown error";
}

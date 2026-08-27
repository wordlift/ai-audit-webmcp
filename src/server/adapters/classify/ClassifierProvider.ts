import type { ContentCategory } from "../../../shared/types/index.js";

export interface ClassificationOutcome {
  categories: ContentCategory[];
  model: string;
  /** Set when classification could not run; inference falls back to behavior signals only. */
  failureReason?: string;
}

export interface ClassifierProvider {
  readonly name: string;
  classify(input: { text: string; url: string }): Promise<ClassificationOutcome>;
}

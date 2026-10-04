import type { MarkupOutcome, MarkupPageInput, MarkupProvider, MarkupTotals } from "./MarkupProvider.js";

/**
 * A second extractor behind the first, used for a page only when the first fails or does not
 * answer in time, and used for names only. A generative model proposes; the page confirms: a
 * candidate is kept solely when its exact name appears in the text the page was read from, and
 * it brings no description, no link, no alias and no offer, because none of those can be checked
 * against the page. The first provider's answers stay the only source of facts.
 */
export class FallbackMarkupProvider implements MarkupProvider {
  readonly name: string;
  readonly model: string;
  #fellBack = 0;

  constructor(
    private readonly primary: MarkupProvider,
    private readonly secondary: MarkupProvider,
  ) {
    this.name = `${primary.name}+${secondary.name}`;
    this.model = `${primary.model}, ${secondary.model} for names only`;
  }

  async generate(page: MarkupPageInput): Promise<MarkupOutcome> {
    try {
      return await this.primary.generate(page);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown";
      const outcome = await this.secondary.generate(page);
      this.#fellBack += 1;
      const haystack = [page.title, page.description, ...page.headings, page.text].join("\n").toLowerCase();
      const onPage = outcome.entities.filter((entity) => haystack.includes(entity.name.trim().toLowerCase()));
      return {
        ...outcome,
        model: `${outcome.model} (names only)`,
        entities: onPage.map((entity) => ({ ...entity, alternateNames: [], sameAs: [], offers: [], description: undefined, origin: "inferred" as const })),
        issues: [
          `${this.primary.name} did not answer (${reason}); ${this.secondary.name} proposed names and the page confirmed ${onPage.length} of ${outcome.entities.length}`,
          ...outcome.issues,
        ],
      };
    }
  }

  /** The first provider's totals, with the second's added: what the audit paid, in both currencies. */
  totals(): MarkupTotals {
    const first = this.primary.totals();
    const second = this.secondary.totals();
    return {
      pages: first.pages + second.pages,
      inputTokens: first.inputTokens + second.inputTokens,
      outputTokens: first.outputTokens + second.outputTokens,
      estimatedUsd: first.estimatedUsd + second.estimatedUsd,
    };
  }

  /** How often the second extractor had to step in since the process started. */
  get fellBack(): number {
    return this.#fellBack;
  }
}

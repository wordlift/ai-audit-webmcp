import { domainNodes, entitiesFromJsonLd, readJsonLd } from "./jsonLd.js";
import type { MarkupOutcome, MarkupPageInput, MarkupProvider, MarkupTotals } from "./MarkupProvider.js";

/**
 * Gemini 2.5 Flash through the Gemini API, as the stand-in for WordLift's HTML-to-JSON-LD
 * service. It exists to put the Fix preview in front of the team and to measure what the markup
 * costs per page; the model behind this file changes, the interface in front of it does not.
 *
 * Only the page's readable text goes out — the title, description, headings and bounded body the
 * collector already keeps — never the raw HTML, and never anything about the person auditing.
 */
export interface GeminiPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

/** Gemini 2.5 Flash list price for text, paid tier, as of September 2026. Override from config. */
export const GEMINI_FLASH_PRICING: GeminiPricing = { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 };

export interface GeminiMarkupOptions {
  apiKey: string;
  model?: string;
  pricing?: GeminiPricing;
  /** Injected in tests; production uses the global fetch. */
  fetch?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}

const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";
const MAX_TEXT_CHARACTERS = 12_000;

const INSTRUCTIONS = [
  "You write schema.org JSON-LD for one web page, for search engines and AI agents.",
  'Answer with one JSON object: "@context": "https://schema.org" and "@graph": an array of the entities the page is about — the organisation or business, its products, services, offers, events, places, articles and people — with their key facts.',
  "Use only facts stated in the page text. Never invent names, prices, addresses, ratings, dates or identifiers; omit a property rather than guess it.",
  'Use standard schema.org types and properties. Every entity has "@type" and "name". Add "url", "description", "sameAs" and "offers" (price, priceCurrency, availability) only where the page states them.',
  "At most 12 entities. Output JSON only, no commentary.",
].join(" ");

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  promptFeedback?: { blockReason?: string };
}

export class GeminiMarkupProvider implements MarkupProvider {
  readonly name = "gemini";
  readonly model: string;
  readonly #pricing: GeminiPricing;
  readonly #totals: MarkupTotals = { pages: 0, inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };

  constructor(private readonly options: GeminiMarkupOptions) {
    this.model = options.model ?? "gemini-2.5-flash";
    this.#pricing = options.pricing ?? GEMINI_FLASH_PRICING;
  }

  async generate(page: MarkupPageInput): Promise<MarkupOutcome> {
    const fetchImpl = this.options.fetch ?? fetch;
    const endpoint = `${this.options.endpoint ?? DEFAULT_ENDPOINT}/models/${encodeURIComponent(this.model)}:generateContent`;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      // The key travels in a header, never in the URL: URLs end up in logs.
      headers: { "content-type": "application/json", "x-goog-api-key": this.options.apiKey },
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 30_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: "user", parts: [{ text: promptFor(page) }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 4_096,
          // Extraction, not reasoning: thinking would only add output tokens at output prices.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!response.ok) throw new Error(`Gemini answered HTTP ${response.status}`);

    const payload = (await response.json()) as GeminiResponse;
    const usage = this.usageFrom(payload);
    this.#totals.pages += 1;
    this.#totals.inputTokens += usage.inputTokens;
    this.#totals.outputTokens += usage.outputTokens;
    this.#totals.estimatedUsd += usage.estimatedUsd;

    if (payload.promptFeedback?.blockReason) {
      return { entities: [], issues: [`Gemini declined the page: ${payload.promptFeedback.blockReason}`], usage, model: this.model };
    }
    const text = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("");
    const document = parseJson(text);
    if (document === undefined) {
      return { entities: [], issues: ["Gemini did not answer with JSON"], usage, model: this.model };
    }
    const { nodes, issues } = readJsonLd(document);
    return { entities: entitiesFromJsonLd(domainNodes(nodes, issues), page.url), issues, usage, model: this.model };
  }

  totals(): MarkupTotals {
    return { ...this.#totals };
  }

  private usageFrom(payload: GeminiResponse) {
    const inputTokens = payload.usageMetadata?.promptTokenCount ?? 0;
    // Thoughts are billed as output; with the budget at zero there should be none, but the meter
    // counts what the bill counts, not what was asked for.
    const outputTokens = (payload.usageMetadata?.candidatesTokenCount ?? 0) + (payload.usageMetadata?.thoughtsTokenCount ?? 0);
    const estimatedUsd = (inputTokens * this.#pricing.inputUsdPerMillion + outputTokens * this.#pricing.outputUsdPerMillion) / 1_000_000;
    return { inputTokens, outputTokens, estimatedUsd };
  }
}

function promptFor(page: MarkupPageInput): string {
  return [
    `Page: ${page.url}`,
    `Title: ${page.title}`,
    page.description ? `Description: ${page.description}` : "",
    page.headings.length > 0 ? `Headings: ${page.headings.slice(0, 40).join(" | ")}` : "",
    "",
    "Text:",
    page.text.slice(0, MAX_TEXT_CHARACTERS),
  ]
    .filter((line, index) => line !== "" || index === 4)
    .join("\n");
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

import type { PlatformEgress } from "./platformEgress.js";

/**
 * Who is reading: a crawler by name, an agent by the platform it acts from, or a person. This is
 * the one dimension the loop counts on, and it is a class, never an identity: no address and no
 * user agent leaves this function, only a word.
 *
 * A crawler's name is what its user agent claims. Google's is the one worth checking, because it
 * is the one worth faking: a "Googlebot" from an address outside Google's published ranges is
 * counted as a claim, not as Google.
 */
export type VisitorClass = `crawler:${string}` | `agent:${string}` | "human";

interface CrawlerRule {
  name: string;
  pattern: RegExp;
  /** Verified against Google's published ranges; a miss is counted as `claimed-<name>`. */
  google?: boolean;
}

/** In order: the specific names first, the generic marker last. */
const CRAWLERS: CrawlerRule[] = [
  { name: "google-cloudvertexbot", pattern: /Google-CloudVertexBot/i, google: true },
  { name: "google-extended", pattern: /Google-Extended/i, google: true },
  { name: "googleother", pattern: /GoogleOther/i, google: true },
  { name: "googlebot", pattern: /Googlebot/i, google: true },
  { name: "bingbot", pattern: /bingbot/i },
  { name: "oai-searchbot", pattern: /OAI-SearchBot/i },
  { name: "chatgpt-user", pattern: /ChatGPT-User/i },
  { name: "gptbot", pattern: /GPTBot/i },
  { name: "claude-searchbot", pattern: /Claude-SearchBot/i },
  { name: "claude-user", pattern: /Claude-User/i },
  { name: "claudebot", pattern: /ClaudeBot/i },
  { name: "perplexitybot", pattern: /PerplexityBot|Perplexity-User/i },
  { name: "applebot", pattern: /Applebot/i },
  { name: "amazonbot", pattern: /Amazonbot/i },
  { name: "meta-externalagent", pattern: /meta-externalagent|facebookexternalhit/i },
  { name: "bytespider", pattern: /Bytespider/i },
  { name: "ccbot", pattern: /CCBot/i },
  { name: "duckassistbot", pattern: /DuckAssistBot|DuckDuckBot/i },
  { name: "other", pattern: /bot\b|crawler|spider|crawl|slurp|fetcher/i },
];

export interface VisitorClassifierOptions {
  /** Hosted assistants' egress: an address in one of these is an agent acting from that platform. */
  platforms?: PlatformEgress;
  /** Google's published crawler ranges, all of them under platforms whose names start with "google". */
  crawlers?: PlatformEgress;
}

export class VisitorClassifier {
  constructor(private readonly options: VisitorClassifierOptions = {}) {}

  classify(input: { userAgent: string | undefined; ip: string | undefined }): VisitorClass {
    const userAgent = input.userAgent ?? "";
    for (const rule of CRAWLERS) {
      if (!rule.pattern.test(userAgent)) continue;
      if (rule.google) {
        const verified = (this.options.crawlers?.platformOf(input.ip) ?? "").startsWith("google");
        return verified ? `crawler:${rule.name}` : `crawler:claimed-${rule.name}`;
      }
      return `crawler:${rule.name}`;
    }
    const platform = this.options.platforms?.platformOf(input.ip);
    if (platform) return `agent:${platform}`;
    return "human";
  }
}

/** Where Google publishes the ranges its crawlers and fetchers come from. */
export const GOOGLE_CRAWLER_RANGE_URLS: ReadonlyArray<{ platform: string; url: string }> = [
  { platform: "google-crawlers", url: "https://developers.google.com/static/search/apis/ipranges/googlebot.json" },
  { platform: "google-special", url: "https://developers.google.com/static/search/apis/ipranges/special-crawlers.json" },
  { platform: "google-fetchers", url: "https://developers.google.com/static/search/apis/ipranges/user-triggered-fetchers.json" },
];

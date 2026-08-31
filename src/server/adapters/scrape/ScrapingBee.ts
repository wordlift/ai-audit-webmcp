import { UrlPolicyError, assertPublicDestination, normalizeTargetUrl, safeFetch, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import { NativeFetchCollector, type PageFetcher } from "./NativeFetch.js";

const MAX_BYTES = 2_000_000;

export interface ScrapingBeeOptions extends UrlPolicyOptions {
  apiKey: string;
  renderJs?: boolean;
  endpoint?: string;
}

/**
 * Rendered collection for JavaScript-heavy sites, matching the collector the private AI Audit
 * stack uses. The destination is still validated locally first, so ScrapingBee is never handed a
 * private address to fetch on this server's behalf.
 */
export function createScrapingBeeCollector(options: ScrapingBeeOptions): NativeFetchCollector {
  return new NativeFetchCollector(options, createScrapingBeePageFetcher(options), "scrapingbee");
}

/** Exported for tests: the rendered page fetcher with its plain-fetch fallback. */
export function createScrapingBeePageFetcher(options: ScrapingBeeOptions): PageFetcher {
  // Secrets routinely carry a trailing newline; sent verbatim it turns into a 401.
  const apiKey = options.apiKey.trim();

  const rendered = async (target: URL) => {
    const endpoint = new URL(options.endpoint ?? "https://app.scrapingbee.com/api/v1/");
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("url", target.toString());
    endpoint.searchParams.set("render_js", options.renderJs === false ? "false" : "true");
    endpoint.searchParams.set("block_ads", "true");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        throw new UrlPolicyError("dns_failure", `Rendered collection failed with status ${response.status}.`, 502);
      }
      const body = await response.text();
      return { finalUrl: target.toString(), body: body.slice(0, MAX_BYTES), truncated: body.length > MAX_BYTES };
    } catch (error) {
      if (error instanceof UrlPolicyError) throw error;
      if (controller.signal.aborted) {
        throw new UrlPolicyError("collection_timeout", "Rendered collection took too long.", 504);
      }
      throw new UrlPolicyError("dns_failure", "Rendered collection could not be completed.", 502);
    } finally {
      clearTimeout(timer);
    }
  };

  return async (url) => {
    // The destination is judged first, and a refused destination stays refused: the fallback
    // below exists for renderer failures, never for policy failures.
    const target = normalizeTargetUrl(url.toString());
    await assertPublicDestination(target, options);

    try {
      return await rendered(target);
    } catch {
      // A renderer outage or bad credential must not blank the whole audit; unrendered
      // collection still reads server-rendered JSON-LD, tools, and discovery documents.
      const plain = await safeFetch(target, options);
      return { finalUrl: plain.finalUrl, body: plain.body, truncated: plain.truncated };
    }
  };
}

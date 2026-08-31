import { UrlPolicyError, assertPublicDestination, normalizeTargetUrl, safeFetch, type UrlPolicyOptions } from "../../security/urlPolicy.js";
import { NativeFetchCollector, blockedResponse, type PageFetcher } from "./NativeFetch.js";

const MAX_BYTES = 2_000_000;

export interface ScrapingBeeOptions extends UrlPolicyOptions {
  apiKey: string;
  renderJs?: boolean;
  endpoint?: string;
  /** Retry a page the site refused once through ScrapingBee's premium proxy pool. On by default. */
  premiumRetry?: boolean;
}

/**
 * Rendered collection for JavaScript-heavy sites, matching the collector the private AI Audit
 * stack uses. The destination is still validated locally first, so ScrapingBee is never handed a
 * private address to fetch on this server's behalf.
 */
export function createScrapingBeeCollector(options: ScrapingBeeOptions): NativeFetchCollector {
  return new NativeFetchCollector(options, createScrapingBeePageFetcher(options), "scrapingbee");
}

/** Exported for tests: the rendered page fetcher with its premium retry and plain-fetch fallback. */
export function createScrapingBeePageFetcher(options: ScrapingBeeOptions): PageFetcher {
  // Secrets routinely carry a trailing newline; sent verbatim it turns into a 401.
  const apiKey = options.apiKey.trim();

  /** One rendered request. The status and body are the target's unless ScrapingBee itself failed. */
  const request = async (target: URL, premium: boolean): Promise<{ status: number; body: string }> => {
    const endpoint = new URL(options.endpoint ?? "https://app.scrapingbee.com/api/v1/");
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("url", target.toString());
    endpoint.searchParams.set("render_js", options.renderJs === false ? "false" : "true");
    endpoint.searchParams.set("block_ads", "true");
    if (premium) endpoint.searchParams.set("premium_proxy", "true");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      // ScrapingBee's own failures — a rejected key (401), its concurrency limit (429), or any
      // JSON-bodied error — are renderer failures. Everything else is the target's own answer.
      const ownFailure =
        response.status === 401 ||
        response.status === 429 ||
        (!response.ok && (response.headers.get("content-type") ?? "").includes("application/json"));
      if (ownFailure) {
        throw new UrlPolicyError("dns_failure", `Rendered collection failed with status ${response.status}.`, 502);
      }
      return { status: response.status, body: await response.text() };
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

  const rendered = async (target: URL) => {
    let page = await request(target, false);
    // Most bot walls judge the network, not the request. A refusal is retried once through the
    // premium pool; whatever comes back then is the answer, wall or page.
    if (options.premiumRetry !== false && blockedResponse(page.status, page.body)) {
      page = await request(target, true);
    }
    if (page.status >= 500 && !blockedResponse(page.status, page.body)) {
      throw new UrlPolicyError("dns_failure", `Rendered collection failed with status ${page.status}.`, 502);
    }
    return {
      finalUrl: target.toString(),
      body: page.body.slice(0, MAX_BYTES),
      truncated: page.body.length > MAX_BYTES,
      status: page.status,
    };
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
      // collection still reads server-rendered JSON-LD, tools, and discovery documents. A site
      // that refuses the plain request is then reported as blocked by the collector.
      const plain = await safeFetch(target, options);
      return { finalUrl: plain.finalUrl, body: plain.body, truncated: plain.truncated, status: plain.status };
    }
  };
}

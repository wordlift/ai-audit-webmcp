import { afterEach, describe, expect, it, vi } from "vitest";
import { createScrapingBeePageFetcher } from "../../src/server/adapters/scrape/ScrapingBee.js";

const POLICY = { resolve: async () => ["93.184.216.34"] };
const TARGET = new URL("https://alpina.travel/");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rendered collection", () => {
  it("trims the credential, because secrets routinely carry a trailing newline", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("api_key=bee-key-123");
      expect(String(input)).not.toContain("%0A");
      // One edition of the site: the US, English one.
      expect(String(input)).toContain("country_code=us");
      expect(String(input)).toContain("forward_headers=true");
      expect((init?.headers as Record<string, string>)["Spb-Accept-Language"]).toMatch(/^en-US/);
      return new Response("<html><body>rendered</body></html>", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const fetchPage = createScrapingBeePageFetcher({ apiKey: "bee-key-123\n", ...POLICY });
    const page = await fetchPage(TARGET);

    expect(page.body).toContain("rendered");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to plain collection when the renderer fails, instead of blanking the audit", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("scrapingbee")) return new Response("unauthorized", { status: 401 });
      return new Response("<html><body>server-rendered page</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const fetchPage = createScrapingBeePageFetcher({ apiKey: "bee-key-123", ...POLICY });
    const page = await fetchPage(TARGET);

    expect(page.body).toContain("server-rendered page");
    expect(page.finalUrl).toBe("https://alpina.travel/");
  });

  it("retries a refused page once through the premium proxy pool", async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (String(input).includes("premium_proxy=true")) {
        return new Response("<html><body>the real page</body></html>", { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("<html><head><title>Access Denied</title></head></html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await createScrapingBeePageFetcher({ apiKey: "bee-key-123", ...POLICY })(TARGET);

    expect(page.body).toContain("the real page");
    expect(page.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toContain("premium_proxy");
    expect(calls[1]).toContain("premium_proxy=true");
  });

  it("hands a wall that survives the premium retry to the collector as a refusal, not as the page", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("scrapingbee");
      return new Response("<html><head><title>Access Denied</title></head></html>", {
        status: 403,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await createScrapingBeePageFetcher({ apiKey: "bee-key-123", ...POLICY })(TARGET);

    expect(page.status).toBe(403);
    expect(page.body).toContain("Access Denied");
    // Two rendered attempts, and no plain request that would only meet the same wall.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a JSON-bodied error as ScrapingBee's own failure and falls back to plain collection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("scrapingbee")) {
        return new Response(JSON.stringify({ message: "Could not fetch the page" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("<html><body>server-rendered page</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await createScrapingBeePageFetcher({ apiKey: "bee-key-123", ...POLICY })(TARGET);

    expect(page.body).toContain("server-rendered page");
    expect(page.status).toBe(200);
  });

  it("still refuses a destination the policy refuses — the fallback is for renderer failures only", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const fetchPage = createScrapingBeePageFetcher({ apiKey: "bee-key-123", resolve: async () => ["127.0.0.1"] });

    await expect(fetchPage(TARGET)).rejects.toMatchObject({ code: "private_network" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

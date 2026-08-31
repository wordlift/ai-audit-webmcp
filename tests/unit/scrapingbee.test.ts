import { afterEach, describe, expect, it, vi } from "vitest";
import { createScrapingBeePageFetcher } from "../../src/server/adapters/scrape/ScrapingBee.js";

const POLICY = { resolve: async () => ["93.184.216.34"] };
const TARGET = new URL("https://alpina.travel/");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rendered collection", () => {
  it("trims the credential, because secrets routinely carry a trailing newline", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("api_key=bee-key-123");
      expect(String(input)).not.toContain("%0A");
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

  it("still refuses a destination the policy refuses — the fallback is for renderer failures only", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const fetchPage = createScrapingBeePageFetcher({ apiKey: "bee-key-123", resolve: async () => ["127.0.0.1"] });

    await expect(fetchPage(TARGET)).rejects.toMatchObject({ code: "private_network" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

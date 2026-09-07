import {
  ANTHROPIC_EGRESS,
  PlatformEgress,
  parseCidr,
  parseEgressDocument,
  parsePlatformRanges,
  refreshPlatformEgress,
} from "../../src/server/security/platformEgress.js";
import { OPENAI_CONNECTOR_EGRESS } from "../../src/server/security/openaiConnectorEgress.js";

describe("which platform an address belongs to", () => {
  const egress = new PlatformEgress([...ANTHROPIC_EGRESS, { platform: "openai", cidr: "203.0.113.0/24" }]);

  it.each([
    ["an address in Anthropic's IPv4 range", "160.79.104.1", "anthropic"],
    ["the same range seen as IPv4-mapped IPv6", "::ffff:160.79.105.7", "anthropic"],
    ["an address in Anthropic's IPv6 range", "2607:6bc0:0:1::5", "anthropic"],
    ["an address in a second platform's range", "203.0.113.200", "openai"],
  ])("recognises %s", (_case, address, platform) => {
    expect(egress.platformOf(address)).toBe(platform);
  });

  it.each([
    ["an address just past the /21", "160.79.112.1"],
    ["an unrelated address", "8.8.8.8"],
    ["an IPv6 address outside the /48", "2607:6bc1::5"],
    ["something that is not an address", "claude.ai"],
    ["no address at all", undefined],
  ])("treats %s as a direct client", (_case, address) => {
    expect(egress.platformOf(address)).toBeNull();
  });

  it("ships Anthropic's range and a usable snapshot of OpenAI's", () => {
    const built = new PlatformEgress([...ANTHROPIC_EGRESS, ...OPENAI_CONNECTOR_EGRESS.map((cidr) => ({ platform: "openai", cidr }))]);
    expect(built.summary()).toEqual({ anthropic: 2, openai: OPENAI_CONNECTOR_EGRESS.length });
    expect(OPENAI_CONNECTOR_EGRESS.length).toBeGreaterThan(10);
    expect(built.platformOf(OPENAI_CONNECTOR_EGRESS[0]?.split("/")[0])).toBe("openai");
  });
});

describe("how ranges are declared", () => {
  it("parses CIDR notation and refuses what is not one", () => {
    expect(parseCidr("160.79.104.0/21")).toEqual({ network: "160.79.104.0", prefix: 21, type: "ipv4" });
    expect(parseCidr("2607:6bc0::/48")).toEqual({ network: "2607:6bc0::", prefix: 48, type: "ipv6" });
    expect(parseCidr("203.0.113.9")).toEqual({ network: "203.0.113.9", prefix: 32, type: "ipv4" });
    expect(parseCidr("203.0.113.0/33")).toBeNull();
    expect(parseCidr("not-an-address/8")).toBeNull();
  });

  it("reads the environment's comma-separated platform=cidr entries and drops the rest", () => {
    expect(parsePlatformRanges("anthropic=160.79.104.0/21, openai=203.0.113.0/24 ,bad,openai=nope/99,Evil Corp=1.2.3.4")).toEqual([
      { platform: "anthropic", cidr: "160.79.104.0/21" },
      { platform: "openai", cidr: "203.0.113.0/24" },
    ]);
    expect(parsePlatformRanges(undefined)).toEqual([]);
  });

  it("reads the shape OpenAI publishes", () => {
    expect(
      parseEgressDocument({
        creationTime: "2026-09-04T18:11:32Z",
        prefixes: [{ ipv4Prefix: "1.2.3.0/28" }, { ipv6Prefix: "2001:db8::/32" }, { other: "x" }, null, { ipv4Prefix: "bad" }],
      }),
    ).toEqual(["1.2.3.0/28", "2001:db8::/32"]);
    expect(parseEgressDocument({ prefixes: "nope" })).toEqual([]);
    expect(parseEgressDocument(null)).toEqual([]);
  });
});

describe("refreshing a published list", () => {
  const document = (prefixes: unknown[]) =>
    new Response(JSON.stringify({ creationTime: "2026-09-04T18:11:32Z", prefixes }), { status: 200 });

  it("swaps a platform's ranges in and leaves the others alone", async () => {
    const egress = new PlatformEgress([...ANTHROPIC_EGRESS, { platform: "openai", cidr: "203.0.113.0/24" }]);
    const events: unknown[][] = [];

    const refreshed = await refreshPlatformEgress({
      egress,
      platform: "openai",
      url: "https://openai.example/connectors.json",
      fetch: async () => document([{ ipv4Prefix: "198.51.100.0/24" }]),
      log: (...event) => events.push(event),
    });

    expect(refreshed).toBe(true);
    expect(egress.platformOf("198.51.100.7")).toBe("openai");
    expect(egress.platformOf("203.0.113.7")).toBeNull();
    expect(egress.platformOf("160.79.104.1")).toBe("anthropic");
    expect(events[0]?.[0]).toBe("platform_egress_refreshed");
  });

  it.each([
    ["the network fails", async () => { throw new Error("ENOTFOUND"); }],
    ["the status is not ok", async () => new Response("nope", { status: 503 })],
    ["the body is not JSON", async () => new Response("<html>", { status: 200 })],
    ["the list is empty", async () => document([])],
  ])("keeps what it had when %s", async (_case, fetchImpl) => {
    const egress = new PlatformEgress([{ platform: "openai", cidr: "203.0.113.0/24" }]);
    const events: unknown[][] = [];

    const refreshed = await refreshPlatformEgress({
      egress,
      platform: "openai",
      url: "https://openai.example/connectors.json",
      fetch: fetchImpl as typeof fetch,
      log: (...event) => events.push(event),
    });

    expect(refreshed).toBe(false);
    expect(egress.platformOf("203.0.113.7")).toBe("openai");
    expect(events[0]?.[0]).toBe("platform_egress_refresh_failed");
  });
});

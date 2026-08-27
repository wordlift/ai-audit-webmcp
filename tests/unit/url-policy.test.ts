import {
  assertPublicDestination,
  isPublicIpAddress,
  normalizeTargetUrl,
  safeFetch,
  UrlPolicyError,
} from "../../src/server/security/urlPolicy.js";

describe("normalizeTargetUrl", () => {
  it("accepts bare public hostnames and defaults to https", () => {
    expect(normalizeTargetUrl("alpina.travel").toString()).toBe("https://alpina.travel/");
    expect(normalizeTargetUrl("  https://alpina.travel/rooms#deals  ").toString()).toBe("https://alpina.travel/rooms");
  });

  it.each([
    ["", "invalid_url"],
    ["not a url", "invalid_url"],
    ["file:///etc/passwd", "unsupported_scheme"],
    ["javascript:alert(1)", "unsupported_scheme"],
    ["ftp://example.com", "unsupported_scheme"],
    ["https://user:secret@example.com", "credentials_not_allowed"],
    ["https://example.com:22", "unsupported_port"],
    ["http://localhost:8080", "private_network"],
    ["http://router.local", "private_network"],
    ["http://metadata.google.internal", "private_network"],
    ["http://169.254.169.254/latest/meta-data/", "private_network"],
    ["http://127.0.0.1", "private_network"],
    ["http://10.0.0.5", "private_network"],
    ["http://192.168.1.1", "private_network"],
    ["http://172.16.4.4", "private_network"],
    ["http://[::1]", "private_network"],
    ["http://[fd00::1]", "private_network"],
    ["http://[::ffff:169.254.169.254]", "private_network"],
  ])("rejects %s as %s", (input, code) => {
    expect(() => normalizeTargetUrl(input)).toThrowError(expect.objectContaining({ code }));
  });
});

describe("isPublicIpAddress", () => {
  it.each(["8.8.8.8", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])("allows %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.255.255",
    "192.0.0.1",
    "192.168.0.1",
    "198.18.0.1",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "fe80::1",
    "fc00::1",
    "ff02::1",
    "2001:db8::1",
    "64:ff9b::10.0.0.1",
    "999.1.1.1",
  ])("blocks %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });
});

describe("assertPublicDestination", () => {
  it("fails closed when any resolved address is private", async () => {
    const resolve = async () => ["93.184.216.34", "127.0.0.1"];
    await expect(assertPublicDestination(normalizeTargetUrl("rebind.example"), { resolve })).rejects.toMatchObject({
      code: "private_network",
    });
  });

  it("fails when the hostname does not resolve", async () => {
    const resolve = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(assertPublicDestination(normalizeTargetUrl("missing.example"), { resolve })).rejects.toMatchObject({
      code: "dns_failure",
    });
  });

  it("passes for a fully public host", async () => {
    const resolve = async () => ["93.184.216.34"];
    await expect(assertPublicDestination(normalizeTargetUrl("example.com"), { resolve })).resolves.toEqual([
      "93.184.216.34",
    ]);
  });
});

describe("safeFetch", () => {
  const resolve = async () => ["93.184.216.34"];

  function response(body: string, init: ResponseInit = {}): Response {
    return new Response(body, init);
  }

  it("revalidates each redirect and refuses one that points inside the network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } })),
    );

    await expect(safeFetch("https://example.com", { resolve })).rejects.toMatchObject({ code: "private_network" });
    vi.unstubAllGlobals();
  });

  it("stops after the redirect budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response("", { status: 302, headers: { location: "https://example.com/next" } })),
    );

    await expect(safeFetch("https://example.com", { resolve, maxRedirects: 2 })).rejects.toMatchObject({
      code: "too_many_redirects",
    });
    vi.unstubAllGlobals();
  });

  it("truncates an oversized body instead of buffering it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response("x".repeat(5_000), { status: 200 })));

    const result = await safeFetch("https://example.com", { resolve, maxBytes: 1_000 });

    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(1_000);
    vi.unstubAllGlobals();
  });

  it("never forwards cookies or authorization to the target", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await safeFetch("https://example.com", { resolve });

    const headers = (fetchMock.mock.calls[0]?.[1] ?? {}).headers as Record<string, string>;
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("cookie");
    expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain("authorization");
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe("https://example.com/");
    vi.unstubAllGlobals();
  });

  it("surfaces a policy error rather than a raw network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("socket hang up");
    }));

    await expect(safeFetch("https://example.com", { resolve })).rejects.toBeInstanceOf(UrlPolicyError);
    vi.unstubAllGlobals();
  });
});

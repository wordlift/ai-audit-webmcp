import { parseHTML } from "linkedom";
import { selectRepresentativePages } from "../../src/server/adapters/scrape/NativeFetch.js";

describe("representative page selection", () => {
  it("prefers the pages that explain the offer over a session-bound checkout configurator", () => {
    const { document } = parseHTML(`<nav>
      <a href="/">Home</a>
      <a href="/hosting/wordpress">WordPress hosting</a>
      <a href="/pricing">Compare plans and pricing</a>
      <a href="/domains">Domain name search</a>
      <a href="/help">Help center and docs</a>
      <a href="/cart/checkout-configurator">Upp</a>
      <a href="/legal/domain-registration-agreement">Domain registration agreement</a>
    </nav>`);
    const links = [...document.querySelectorAll("a[href]")];
    const selected = selectRepresentativePages(links, new URL("https://host.example/"));

    const paths = selected.map((item) => item.url.pathname);
    expect(paths).not.toContain("/cart/checkout-configurator");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/help");
    expect(paths.some((path) => path === "/hosting/wordpress" || path === "/domains")).toBe(true);
  });

  it("samples destination and event pages on a tourism site instead of the imprint", () => {
    const { document } = parseHTML(`<nav>
      <a href="/">Home</a>
      <a href="/en/destinations/salzburg-city">Salzburg city</a>
      <a href="/en/events/festivals">Festivals and events</a>
      <a href="/en/booking">Book your stay</a>
      <a href="/en/travel-guide">Travel guide</a>
      <a href="/en/imprint">Imprint</a>
    </nav>`);
    const links = [...document.querySelectorAll("a[href]")];
    const selected = selectRepresentativePages(links, new URL("https://tourism.example/"));

    const paths = selected.map((item) => item.url.pathname);
    expect(paths).not.toContain("/en/imprint");
    expect(paths.some((path) => path.startsWith("/en/destinations") || path.startsWith("/en/events"))).toBe(true);
    expect(paths).toContain("/en/booking");
  });

  it("chooses complementary detail, offer and policy pages instead of the first links", () => {
    const { document } = parseHTML(`<nav>
      <a href="/">Home</a>
      <a href="/about">About</a>
      <a href="/properties/alpinest">Explore AlpiNest apartment</a>
      <a href="/booking">Check availability</a>
      <a href="/faq">Guest policies and FAQ</a>
      <a href="https://elsewhere.example/product">External</a>
    </nav>`);
    const links = [...document.querySelectorAll("a[href]")];
    const selected = selectRepresentativePages(links, new URL("https://alpina.travel/"));

    expect(selected).toHaveLength(3);
    expect(selected.map((item) => item.role)).toEqual(["detail", "offer", "policy"]);
    expect(selected.map((item) => item.url.pathname)).toEqual(["/properties/alpinest", "/booking", "/faq"]);
  });
});

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

  it("prefers inventory over editorial when the site plainly sells things", () => {
    const { document } = parseHTML(`<nav>
      <a href="/">Home</a>
      <a href="/articles/how-to-finance-a-bus">How to finance a bus</a>
      <a href="/articles/electric-coaches-explained">Electric coaches explained</a>
      <a href="/used-buses-for-sale/">Used buses for sale</a>
      <a href="/new-buses-for-sale/">New buses for sale</a>
      <a href="/contact">Contact us</a>
    </nav>`);
    const selected = selectRepresentativePages([...document.querySelectorAll("a[href]")], new URL("https://buses.example/"));

    expect(selected[0].url.pathname).toBe("/used-buses-for-sale/");
    expect(selected.filter((item) => item.url.pathname.startsWith("/articles/")).length).toBeLessThanOrEqual(1);
  });

  it("keeps a shop's catalog ahead of its customer-service and order pages", () => {
    const { document } = parseHTML(`<nav>
      <a href="/">Home</a>
      <a href="/collections/necklaces">Necklaces</a>
      <a href="/customer-service">Customer service</a>
      <a href="/orders/track">Track your order</a>
      <a href="/cart">Cart</a>
      <a href="/help">Help</a>
    </nav>`);
    const selected = selectRepresentativePages([...document.querySelectorAll("a[href]")], new URL("https://jewels.example/"));

    const paths = selected.map((item) => item.url.pathname);
    expect(paths[0]).toBe("/collections/necklaces");
    expect(paths).not.toContain("/customer-service");
    expect(paths).not.toContain("/orders/track");
    expect(paths).not.toContain("/cart");
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

describe("scan depth", () => {
  const nav = `<nav>
    <a href="/">Home</a>
    <a href="/rooms">Rooms</a>
    <a href="/rooms/suite">The suite</a>
    <a href="/restaurant">Restaurant</a>
    <a href="/spa">Spa</a>
    <a href="/offers">Offers and packages</a>
    <a href="/booking">Book your stay</a>
    <a href="/contact">Contact us</a>
    <a href="/guide/valley">Valley guide</a>
    <a href="/guide/winter">Winter guide</a>
    <a href="/events">Events</a>
    <a href="/faq">Questions and answers</a>
    <a href="/press">Press</a>
  </nav>`;

  it("reads three secondary pages for the free basic scan", () => {
    const { document } = parseHTML(nav);
    const links = [...document.querySelectorAll("a[href]")];

    // Four pages in the report: the entry page the caller gave, plus three sampled.
    expect(selectRepresentativePages(links, new URL("https://hotel.example/"))).toHaveLength(3);
  });

  it("reads further when a deep scan asks it to, and still samples rather than crawls", () => {
    const { document } = parseHTML(nav);
    const links = [...document.querySelectorAll("a[href]")];

    const deep = selectRepresentativePages(links, new URL("https://hotel.example/"), 12);
    expect(deep.length).toBeGreaterThan(3);
    expect(deep.length).toBeLessThanOrEqual(11);
    expect(new Set(deep.map((page) => page.url.pathname)).size).toBe(deep.length);
  });
});

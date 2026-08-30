import { parseHTML } from "linkedom";
import { selectRepresentativePages } from "../../src/server/adapters/scrape/NativeFetch.js";

describe("representative page selection", () => {
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

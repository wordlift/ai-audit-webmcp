// @vitest-environment jsdom
import { captureReviewToken, engineKeyFor, saveEngineKey } from "../../src/client/engine/engineKeys";
import { reviewPrompt } from "../../src/client/components/reviewPrompt";

describe("where the browser keeps its claim", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("takes a review token from the link's fragment, keeps it for the tab, and takes it off the address", () => {
    window.history.replaceState(null, "", "/reports/4a8a04c0-e247-4bec-a440-d9f3506f9212#review=tok_abc");
    captureReviewToken();
    expect(window.location.hash).toBe("");
    expect(window.location.pathname).toBe("/reports/4a8a04c0-e247-4bec-a440-d9f3506f9212");
    expect(engineKeyFor("alpina.travel")).toBe("tok_abc");
    // The holder's own key wins over a review token.
    saveEngineKey("alpina.travel", "key_holder");
    expect(engineKeyFor("alpina.travel")).toBe("key_holder");
  });

  it("puts the token where no server sees it", () => {
    expect(reviewPrompt("4a8a04c0-e247-4bec-a440-d9f3506f9212", "tok_abc")).toMatch(/\/reports\/4a8a04c0-e247-4bec-a440-d9f3506f9212#review=tok_abc/);
    expect(reviewPrompt("4a8a04c0-e247-4bec-a440-d9f3506f9212")).not.toMatch(/review=/);
  });
});

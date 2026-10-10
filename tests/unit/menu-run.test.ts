import { describe, expect, it } from "vitest";
import { isMenuRun } from "../../src/server/services/AuditOrchestrator.js";

describe("a menu read as one name", () => {
  const labels = ["ispirazioni", "ricette", "guide", "racconti", "junior suite", "idee regalo"];

  it("is two or more of the page's link labels in a row", () => {
    expect(isMenuRun("Ispirazioni Ricette Guide Racconti", labels)).toBe(true);
    expect(isMenuRun("Ricette  Guide", labels)).toBe(true);
  });

  it("is not a name the site links once, nor a name with words of its own", () => {
    expect(isMenuRun("Junior Suite", labels)).toBe(false);
    expect(isMenuRun("Idee regalo", labels)).toBe(false);
    expect(isMenuRun("Ricette di Natale", labels)).toBe(false);
    expect(isMenuRun("Basecamp", [])).toBe(false);
  });
});

import { detectWordLift, detectWordLiftMarker } from "../../src/domain/evidence/detectWordLift.js";
import type { DomainEntity } from "../../src/shared/types/index.js";

const entity = (overrides: Partial<DomainEntity>): DomainEntity => ({
  id: "https://alpina.travel/#organization",
  types: ["Organization"],
  name: "Alpina.travel",
  alternateNames: [],
  sourceUrls: ["https://alpina.travel/"],
  sameAs: [],
  offers: [],
  confidence: 0.9,
  ...overrides,
});

describe("detecting that a site publishes with WordLift", () => {
  it("reads it from an entity id on the data.wordlift.io dataset", () => {
    const result = detectWordLift([
      entity({}),
      entity({ id: "https://data.wordlift.io/wl01855/alpinest-feriendorf-lungau", name: "AlpiNest Feriendorf Lungau" }),
    ]);

    expect(result).toEqual({
      name: "WordLift",
      evidence: "Entity ids are published on data.wordlift.io (AlpiNest Feriendorf Lungau)",
      sourceUrl: "https://alpina.travel/",
    });
  });

  it("reads it from a sameAs link when the id is the site's own", () => {
    const result = detectWordLift([entity({ sameAs: ["https://data.wordlift.io/wl01855/alpina-travel"] })]);
    expect(result?.name).toBe("WordLift");
  });

  it("falls back to a page marker the collector saw, and claims nothing without one", () => {
    const marked = detectWordLift([entity({})], {
      marker: "The WordLift WordPress plugin is installed",
      sourceUrl: "https://example.com/",
    });
    expect(marked?.evidence).toMatch(/WordPress plugin/);

    expect(detectWordLift([entity({})])).toBeUndefined();
  });
});

describe("page fingerprints", () => {
  it("recognizes the dataset, the plugin, and the SDK — and nothing else", () => {
    expect(detectWordLiftMarker('{"@id":"https://data.wordlift.io/wl01855/x"}')).toMatch(/data\.wordlift\.io/);
    expect(detectWordLiftMarker('<link href="https://wordlift.io/data/https/alpina.travel/">')).toMatch(/dataset URI/);
    expect(detectWordLiftMarker('<script src="/wp-content/plugins/wordlift/js/x.js">')).toMatch(/WordPress plugin/);
    expect(detectWordLiftMarker('<script src="https://cloud.wordlift.io/app.js">')).toMatch(/SDK/);
    expect(detectWordLiftMarker("<html><p>We write about WordLift sometimes.</p></html>")).toBeNull();
  });
});

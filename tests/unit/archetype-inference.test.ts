import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { inferArchetype } from "../../src/domain/classification/inferArchetype.js";

describe("archetype inference", () => {
  const model = loadActionModel();

  it("combines Google category confidence with behavioral evidence", () => {
    const result = inferArchetype(model, [{ name: "/Travel/Hotels & Accommodations", confidence: 0.9 }], [
      "schema:LodgingBusiness",
      "path:booking",
    ]);
    expect(result.primaryArchetype).toBe("travel-hospitality");
    expect(result.provisional).toBe(false);
    expect(result.rankedArchetypes[0].score).toBe(7.7);
  });

  it("uses a provisional baseline when vertical evidence is inadequate", () => {
    const result = inferArchetype(model, [{ name: "/People & Society", confidence: 0.6 }], []);
    expect(result.primaryArchetype).toBe("other");
    expect(result.provisional).toBe(true);
    expect(result.provisionalReason).toMatch(/not enough/i);
  });

  it("applies an explicit override without changing ranked observed evidence", () => {
    const observed = inferArchetype(model, [{ name: "/Shopping", confidence: 0.9 }], ["schema:Product"]);
    const overridden = inferArchetype(
      model,
      [{ name: "/Shopping", confidence: 0.9 }],
      ["schema:Product"],
      "publisher-content",
    );
    expect(overridden.primaryArchetype).toBe("publisher-content");
    expect(overridden.override).toBe("publisher-content");
    expect(overridden.rankedArchetypes).toEqual(observed.rankedArchetypes);
    expect(overridden.provisional).toBe(false);
  });
});

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

  it("classifies a brand by its product vertical, without a /Shopping category", () => {
    // illy.com's real classification: coffee content at 98%, kitchen appliances at 48%.
    const inference = inferArchetype(
      model,
      [
        { name: "/Food & Drink/Beverages/Coffee & Tea", confidence: 0.98 },
        { name: "/Home & Garden/Kitchen & Dining/Small Kitchen Appliances", confidence: 0.48 },
      ],
      [],
    );

    expect(inference.primaryArchetype).toBe("commerce-retail");
    expect(inference.provisional).toBe(false);
  });

  it("keeps a food blog editorial: content behavior outranks the product vertical", () => {
    const inference = inferArchetype(
      model,
      [{ name: "/Food & Drink/Cooking & Recipes", confidence: 0.95 }],
      ["schema:BlogPosting", "schema:Article"],
    );

    expect(inference.primaryArchetype).toBe("publisher-content");
  });

  it("reads a restaurant as hospitality, where booking a table is the act", () => {
    const inference = inferArchetype(
      model,
      [{ name: "/Food & Drink/Restaurants", confidence: 0.9 }],
      ["path:booking"],
    );

    expect(inference.primaryArchetype).toBe("travel-hospitality");
  });
});

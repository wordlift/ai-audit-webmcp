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

  it("accepts a dominant archetype even when Google spreads low confidence over its categories", () => {
    // nike.com: three shopping-flavored categories, none above 0.26, and nothing else scored.
    const result = inferArchetype(
      model,
      [
        { name: "/Shopping/Apparel/Athletic Apparel", confidence: 0.26 },
        { name: "/Shopping/Apparel/Footwear", confidence: 0.16 },
        { name: "/Sports/Sports Fan Gear & Apparel", confidence: 0.13 },
      ],
      [],
    );
    expect(result.primaryArchetype).toBe("commerce-retail");
    expect(result.provisional).toBe(false);
  });

  it("reads the product branches of the taxonomy as commerce", () => {
    // sephora.com: cosmetics and skin care, no /Shopping category at all, a basket link.
    const sephora = inferArchetype(
      model,
      [
        { name: "/Beauty & Fitness/Face & Body Care/Make-Up & Cosmetics", confidence: 0.4 },
        { name: "/Beauty & Fitness/Face & Body Care/Skin & Nail Care", confidence: 0.4 },
      ],
      ["path:cart"],
    );
    expect(sephora.primaryArchetype).toBe("commerce-retail");
    expect(sephora.provisional).toBe(false);

    // ikea.com: furnishings and decor with a faint department-store category.
    const ikea = inferArchetype(
      model,
      [
        { name: "/Home & Garden/Home Furnishings/Other", confidence: 0.83 },
        { name: "/Home & Garden/Home & Interior Decor", confidence: 0.57 },
        { name: "/Shopping/Mass Merchants & Department Stores", confidence: 0.37 },
      ],
      [],
    );
    expect(ikea.primaryArchetype).toBe("commerce-retail");
  });

  it("still holds back when the little evidence there is points two ways", () => {
    const result = inferArchetype(
      model,
      [
        { name: "/Shopping/Apparel", confidence: 0.2 },
        { name: "/News/Sports News", confidence: 0.2 },
      ],
      [],
    );
    expect(result.primaryArchetype).toBe("other");
    expect(result.provisional).toBe(true);
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

import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";

describe("action model", () => {
  const model = loadActionModel();

  it("loads a complete, versioned model with six compact templates", () => {
    expect(model.manifest.version).toBe("0.1.0");
    expect(model.templates.size).toBe(6);
    for (const template of model.templates.values()) {
      expect(template.actions.length).toBeGreaterThan(0);
      expect(template.actions.length).toBeLessThanOrEqual(12);
    }
  });

  it("compiles stable order, stages, IDs, and expectation provenance", () => {
    const first = compileActionGraph(model, "travel-hospitality", ["category:/Travel"]);
    const second = compileActionGraph(model, "travel-hospitality", ["category:/Travel"]);
    expect(second).toEqual(first);
    expect(first.stages.map((stage) => stage.stage)).toEqual([
      "discover",
      "understand-decide",
      "act",
      "manage",
    ]);
    expect(first.actions.map((action) => action.order)).toEqual(first.actions.map((_, index) => index));
    expect(new Set(first.actions.map((action) => action.id)).size).toBe(first.actions.length);
    expect(first.actions.every((action) => action.inputSchema && action.outputSchema)).toBe(true);
    expect(first.actions[0].expectationSource).toEqual([
      "archetype:travel-hospitality",
      "category:/Travel",
    ]);
  });
});

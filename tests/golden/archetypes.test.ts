import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";

describe("six archetype golden journeys", () => {
  const model = loadActionModel();

  it.each([
    ["commerce-retail", [2, 4, 4, 2]],
    ["publisher-content", [2, 3, 2, 1]],
    ["travel-hospitality", [2, 4, 2, 2]],
    ["finance-insurance", [2, 4, 2, 1]],
    ["saas", [1, 3, 2, 2]],
    ["other", [1, 2, 1, 1]],
  ] as const)("compiles %s into the agreed four-stage density", (archetype, counts) => {
    const graph = compileActionGraph(model, archetype);
    expect(graph.stages.map((stage) => stage.actions.length)).toEqual(counts);
    expect(graph.actions.map(({ id, stage, order }) => ({ id, stage, order }))).toMatchSnapshot();
  });
});

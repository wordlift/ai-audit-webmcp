import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { deriveCapability } from "../../src/domain/action-model/deriveState.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { rankPriorities } from "../../src/domain/action-model/rankPriorities.js";

describe("priority ranking", () => {
  it("returns a stable top three using severity, feasibility, and display order", () => {
    const actions = compileActionGraph(loadActionModel(), "commerce-retail").actions;
    const capabilities = actions.map((action, index) => deriveCapability(action, index === 0 ? [{
      id: "human-search",
      actionId: action.id,
      audience: "human",
      kind: "form",
      sourceUrl: "https://shop.example/",
      claim: "Humans can search",
      confidence: 1,
      verification: "observed",
      collectedAt: "2026-08-27T05:00:00.000Z",
    }] : []));
    const first = rankPriorities(capabilities);
    expect(rankPriorities(capabilities)).toEqual(first);
    expect(first).toHaveLength(3);
    expect(first[0].priorityScore).toBeGreaterThanOrEqual(first[1].priorityScore);
  });
});

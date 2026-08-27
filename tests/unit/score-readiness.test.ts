import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { deriveCapability } from "../../src/domain/action-model/deriveState.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { scoreReadiness } from "../../src/domain/action-model/scoreReadiness.js";

describe("verification-only readiness", () => {
  it("awards points only to invoked agent and sidecar capabilities", () => {
    const actions = compileActionGraph(loadActionModel(), "other").actions;
    const capabilities = actions.map((action, index) =>
      deriveCapability(
        action,
        index < 2
          ? [{
              id: `e-${index}`,
              actionId: action.id,
              audience: "agent",
              kind: index === 0 ? "webmcp" : "discovery",
              sourceUrl: "https://example.com/",
              claim: "Machine interface",
              confidence: 1,
              verification: index === 0 ? "invoked" : "declared",
              collectedAt: "2026-08-27T05:00:00.000Z",
            }]
          : [],
      ),
    );
    const score = scoreReadiness(capabilities);
    expect(score.verifiedWeight).toBe(actions[0].importance);
    expect(score.value).toBe(Math.round((100 * actions[0].importance) / score.expectedWeight));
    expect(score.counts.unverified).toBe(1);
  });
});

import jsonld from "jsonld";
import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { compileActionContract } from "../../src/domain/action-model/compileContract.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { actionContractSchema } from "../../src/shared/schemas/report.js";

describe("action contract compiler", () => {
  it("creates deterministic valid JSON-LD contracts for every action", async () => {
    const model = loadActionModel();
    for (const archetype of model.templates.keys()) {
      for (const action of compileActionGraph(model, archetype).actions) {
        const first = compileActionContract(action, "https://example.com/");
        expect(compileActionContract(action, "https://example.com/")).toEqual(first);
        expect(actionContractSchema.parse(JSON.parse(JSON.stringify(first)))).toEqual(first);
        const expanded = await jsonld.expand(first as jsonld.JsonLdDocument, {
          documentLoader: async (url) => {
            if (url !== "https://schema.org") throw new Error(`Unexpected remote context: ${url}`);
            return {
              contextUrl: null,
              documentUrl: url,
              document: { "@context": { "@vocab": "https://schema.org/" } },
            };
          },
        });
        expect(expanded).toHaveLength(1);
        if (action.intent === "transactional") {
          expect(first.governance.requiresAuthorization).toBe(true);
          expect(first.governance.requiresConfirmation).toBe(true);
          expect(first.governance.sideEffects).not.toBe("none");
        }
      }
    }
  });
});

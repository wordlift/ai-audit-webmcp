import jsonld from "jsonld";
import { compileActionGraph } from "../../src/domain/action-model/compileGraph.js";
import { compileActionContract } from "../../src/domain/action-model/compileContract.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";
import { actionContractSchema } from "../../src/shared/schemas/report.js";

describe("action contract compiler", () => {
  it("gives every action a concrete input and output schema, not a placeholder", () => {
    const model = loadActionModel();
    for (const action of model.actions.values()) {
      const input = action.inputSchema as { properties?: Record<string, unknown> };
      const output = action.outputSchema as { properties?: Record<string, unknown> };
      expect(Object.keys(input.properties ?? {}).length, `${action.id} input`).toBeGreaterThan(0);
      expect(Object.keys(output.properties ?? {}).length, `${action.id} output`).toBeGreaterThan(0);
    }
  });

  it("names the commercial fields an implementer needs on offer.lookup and checkout.create", () => {
    const model = loadActionModel();
    const offer = model.actions.get("offer.lookup")!;
    const offerInput = offer.inputSchema as { properties: Record<string, unknown> };
    const offerOutput = offer.outputSchema as { properties: Record<string, unknown> };
    expect(Object.keys(offerInput.properties)).toEqual(
      expect.arrayContaining(["offerId", "plan", "billingTerm", "currency"]),
    );
    expect(Object.keys(offerOutput.properties)).toEqual(
      expect.arrayContaining(["price", "introductoryPrice", "renewalPrice", "currency"]),
    );

    const checkoutOutput = model.actions.get("checkout.create")!.outputSchema as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(checkoutOutput.properties)).toEqual(expect.arrayContaining(["checkoutId", "checkoutUrl", "total"]));
    expect(checkoutOutput.required).toContain("checkoutUrl");
  });

  it("grounds the contract's input fields in the offers the audit actually read", () => {
    const model = loadActionModel();
    const action = compileActionGraph(model, "commerce-retail").actions.find((item) => item.id === "offer.lookup");
    const contract = compileActionContract(action!, "https://example.com/", [], undefined, [
      { id: "https://example.com/#offer-basic", name: "Basic", price: 2.95, priceCurrency: "USD" },
      { id: "https://example.com/#offer-plus", name: "Plus", price: 5.45, priceCurrency: "USD" },
    ]);
    const properties = (contract.inputSchema as { properties: Record<string, { examples?: unknown[] }> }).properties;
    expect(properties.offerId.examples).toEqual(["https://example.com/#offer-basic", "https://example.com/#offer-plus"]);
    expect(properties.plan.examples).toEqual(["Basic", "Plus"]);
    expect(properties.currency.examples).toEqual(["USD"]);

    // Without observed offers the model schema passes through untouched.
    const bare = compileActionContract(action!, "https://example.com/");
    expect((bare.inputSchema as { properties: Record<string, { examples?: unknown[] }> }).properties.offerId.examples).toBeUndefined();
  });

  it("reaches offerId fields nested inside checkout line items", () => {
    const model = loadActionModel();
    const action = compileActionGraph(model, "commerce-retail").actions.find((item) => item.id === "checkout.create");
    const contract = compileActionContract(action!, "https://example.com/", [], undefined, [
      { id: "offer-1", name: "Starter", priceCurrency: "EUR" },
    ]);
    const input = contract.inputSchema as {
      properties: { items: { items: { properties: Record<string, { examples?: unknown[] }> } } };
    };
    expect(input.properties.items.items.properties.offerId.examples).toEqual(["offer-1"]);
  });

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
              contextUrl: undefined,
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

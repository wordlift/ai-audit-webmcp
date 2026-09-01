import {
  compileActionGraph,
  specializeActionLabels,
  withObservedActions,
} from "../../src/domain/action-model/compileGraph.js";
import { loadActionModel } from "../../src/domain/action-model/loadModel.js";

const model = loadActionModel();

describe("observed actions beyond the archetype", () => {
  it("keeps an action the template does not expect when the site was observed to offer it", () => {
    const saas = compileActionGraph(model, "saas");
    expect(saas.actions.some((action) => action.id === "checkout.create")).toBe(false);

    const actions = withObservedActions(model, saas.actions, ["checkout.create", "offer.lookup"]);
    const checkout = actions.find((action) => action.id === "checkout.create");
    expect(checkout?.expected).toBe(false);
    expect(checkout?.expectationSource).toEqual(["evidence:observed"]);
    // Template actions stay first and untouched.
    expect(actions.slice(0, saas.actions.length)).toEqual(saas.actions);
  });

  it("adds nothing for evidence the template already expects or the model does not know", () => {
    const saas = compileActionGraph(model, "saas");
    expect(withObservedActions(model, saas.actions, ["plans.compare", "unknown.action"])).toEqual(saas.actions);
  });
});

describe("category-driven label specialization", () => {
  it("rewords availability for a hosting registrar without touching the action's identity", () => {
    const actions = compileActionGraph(model, "commerce-retail").actions;
    const specialized = specializeActionLabels(
      actions,
      ["/Internet & Telecom/Web Services/Web Hosting & Domain Registration"],
      model.labelOverrides,
    );
    const availability = specialized.find((action) => action.id === "availability.check");
    expect(availability?.label).toBe("Check domain availability");
    expect(availability?.governance).toEqual(actions.find((action) => action.id === "availability.check")?.governance);
  });

  it("leaves labels generic when no category matches", () => {
    const actions = compileActionGraph(model, "commerce-retail").actions;
    expect(specializeActionLabels(actions, ["/Shopping/Apparel"], model.labelOverrides)).toEqual(actions);
  });

  it("specializes from the site's own entities when the categories stay vague", () => {
    // Google files Bluehost under generic web services, but the site's Product is the tell.
    const actions = compileActionGraph(model, "commerce-retail").actions;
    const specialized = specializeActionLabels(
      actions,
      ["/Internet & Telecom/Web Services/Other", "WordPress hosting"],
      model.labelOverrides,
    );
    expect(specialized.find((action) => action.id === "availability.check")?.label).toBe("Check domain availability");
  });
});

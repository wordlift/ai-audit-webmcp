import type { z } from "zod";
import type { archetypeSchema, capabilityStageSchema } from "../../shared/schemas/report.js";
import type { ActionModel } from "./loadModel.js";
import type { ActionDefinition, LabelOverride } from "./schemas.js";

export interface CompiledAction extends ActionDefinition {
  order: number;
  expected: boolean;
  expectationSource: string[];
}
export interface CompiledActionGraph {
  archetype: z.infer<typeof archetypeSchema>;
  modelVersion: string;
  stages: Array<{ stage: z.infer<typeof capabilityStageSchema>; actions: CompiledAction[] }>;
  actions: CompiledAction[];
}

const stageOrder = ["discover", "understand-decide", "act", "manage"] as const;

export function compileActionGraph(
  model: ActionModel,
  archetype: z.infer<typeof archetypeSchema>,
  categoryProvenance: string[] = [],
): CompiledActionGraph {
  const template = model.templates.get(archetype);
  if (!template) throw new Error(`No action template for ${archetype}`);
  const expectationSource = [`archetype:${archetype}`, ...categoryProvenance].sort();
  const actions = template.actions.map((id, order) => ({
    ...(model.actions.get(id) as ActionDefinition),
    order,
    expected: true as const,
    expectationSource,
  }));
  return {
    archetype,
    modelVersion: model.manifest.version,
    stages: stageOrder.map((stage) => ({ stage, actions: actions.filter((action) => action.stage === stage) })),
    actions,
  };
}

/**
 * Evidence the audit collected never disappears because the archetype changed: an action the
 * template does not expect, but the site was observed to offer, joins the graph as unexpected.
 * It keeps its evidence-based state while staying out of the readiness score and the priorities.
 */
export function withObservedActions(
  model: ActionModel,
  actions: CompiledAction[],
  observedActionIds: Iterable<string>,
): CompiledAction[] {
  const known = new Set(actions.map((action) => action.id));
  const observed = [...new Set(observedActionIds)]
    .sort()
    .filter((id) => !known.has(id) && model.actions.has(id))
    .map((id, index) => ({
      ...(model.actions.get(id) as ActionDefinition),
      order: actions.length + index,
      expected: false,
      expectationSource: ["evidence:observed"],
    }));
  return observed.length > 0 ? [...actions, ...observed] : actions;
}

/**
 * The model's labels are generic on purpose; the site's own context makes them concrete —
 * "Check availability" reads as "Check domain availability" when the site sells hosting. The
 * terms are what the audit read from the site itself: its content categories and the names of
 * the entities it publishes. Only the wording specializes: identity, governance, and schemas
 * stay the model's.
 */
export function specializeActionLabels(
  actions: CompiledAction[],
  contextTerms: string[],
  overrides: LabelOverride[],
): CompiledAction[] {
  if (overrides.length === 0 || contextTerms.length === 0) return actions;
  const lowered = contextTerms.map((term) => term.toLowerCase());
  return actions.map((action) => {
    const rule = overrides.find(
      (candidate) =>
        candidate.actionId === action.id &&
        lowered.some((term) => term.includes(candidate.contextIncludes.toLowerCase())),
    );
    if (!rule) return action;
    return { ...action, label: rule.label, description: rule.description ?? action.description };
  });
}

import type { z } from "zod";
import type { archetypeSchema, capabilityStageSchema } from "../../shared/schemas/report.js";
import type { ActionModel } from "./loadModel.js";
import type { ActionDefinition } from "./schemas.js";

export interface CompiledAction extends ActionDefinition {
  order: number;
  expected: true;
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

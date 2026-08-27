import type { z } from "zod";
import { archetypeSchema } from "../../shared/schemas/report.js";
import type { ActionModel } from "../action-model/loadModel.js";

export interface CategoryInput { name: string; confidence: number }
export interface ArchetypeInference {
  primaryArchetype: z.infer<typeof archetypeSchema>;
  rankedArchetypes: Array<{ archetype: z.infer<typeof archetypeSchema>; score: number }>;
  margin: number;
  provisional: boolean;
  provisionalReason?: string;
  override?: z.infer<typeof archetypeSchema>;
}

export function inferArchetype(
  model: ActionModel,
  categories: CategoryInput[],
  signals: string[],
  override?: z.infer<typeof archetypeSchema>,
): ArchetypeInference {
  const scores = new Map(archetypeSchema.options.map((archetype) => [archetype, 0]));
  for (const category of categories) {
    for (const rule of model.categoryRules) {
      if (category.name.startsWith(rule.prefix)) {
        scores.set(rule.archetype, (scores.get(rule.archetype) ?? 0) + category.confidence * rule.weight);
      }
    }
  }
  for (const signal of new Set(signals)) {
    for (const rule of model.behaviorRules) {
      if (signal === rule.signal) scores.set(rule.archetype, (scores.get(rule.archetype) ?? 0) + rule.weight);
    }
  }
  const rankedArchetypes = [...scores.entries()]
    .map(([archetype, score]) => ({ archetype, score: Number(score.toFixed(4)) }))
    .sort((left, right) => right.score - left.score || left.archetype.localeCompare(right.archetype));
  const top = rankedArchetypes[0];
  const second = rankedArchetypes[1];
  const margin = Number((top.score - second.score).toFixed(4));
  const insufficient = top.score < model.manifest.classification.evidenceFloor;
  const ambiguous = margin < model.manifest.classification.marginFloor;
  const inferred = insufficient ? "other" : top.archetype;
  return {
    primaryArchetype: override ?? inferred,
    rankedArchetypes,
    margin,
    provisional: !override && (insufficient || ambiguous),
    provisionalReason: !override && insufficient
      ? "Not enough vertical evidence; using the cross-site baseline."
      : !override && ambiguous
        ? "The leading archetypes are too close to classify confidently."
        : undefined,
    override,
  };
}

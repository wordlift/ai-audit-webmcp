import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { archetypeSchema } from "../../shared/schemas/report.js";
import {
  actionDefinitionSchema,
  archetypeTemplateSchema,
  behaviorRuleSchema,
  categoryRuleSchema,
  manifestSchema,
  type ActionDefinition,
  type ActionModelManifest,
  type ArchetypeTemplate,
  type BehaviorRule,
  type CategoryRule,
} from "./schemas.js";

export interface ActionModel {
  manifest: ActionModelManifest;
  actions: Map<string, ActionDefinition>;
  templates: Map<z.infer<typeof archetypeSchema>, ArchetypeTemplate>;
  categoryRules: CategoryRule[];
  behaviorRules: BehaviorRule[];
}
const archetypes = archetypeSchema.options;

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function loadActionModel(version = "0.1.0", root = process.cwd()): ActionModel {
  const directory = path.join(root, "action-model", `v${version}`);
  const manifest = manifestSchema.parse(readJson(path.join(directory, "manifest.json")));
  if (manifest.version !== version) throw new Error(`Action model directory and manifest version differ`);

  const actionList = z.array(actionDefinitionSchema).parse(readJson(path.join(directory, "actions.json")));
  const actions = new Map(actionList.map((action) => [action.id, action]));
  if (actions.size !== actionList.length) throw new Error("Action IDs must be unique");

  const templates = new Map<z.infer<typeof archetypeSchema>, ArchetypeTemplate>();
  for (const archetype of archetypes) {
    const template = archetypeTemplateSchema.parse(
      readJson(path.join(directory, "archetypes", `${archetype}.json`)),
    );
    if (template.id !== archetype) throw new Error(`Template ${archetype} has a mismatched ID`);
    for (const actionId of template.actions) {
      if (!actions.has(actionId)) throw new Error(`Template ${archetype} references unknown action ${actionId}`);
    }
    for (const actionId of Object.keys(template.labels ?? {})) {
      if (!template.actions.includes(actionId)) {
        throw new Error(`Template ${archetype} renames ${actionId}, which is not in its journey`);
      }
    }
    templates.set(archetype, template);
  }

  return {
    manifest,
    actions,
    templates,
    categoryRules: z.array(categoryRuleSchema).parse(readJson(path.join(directory, "mappings/google-categories.json"))),
    behaviorRules: z.array(behaviorRuleSchema).parse(readJson(path.join(directory, "mappings/behavior-rules.json"))),
  };
}

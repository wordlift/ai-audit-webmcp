import { recommendationFor } from "../../shared/format/recommendation.js";
import type { CapabilityResult, PriorityGap } from "../../shared/types/index.js";

export { recommendationFor };

const severity = { missing: 3, "human-only": 2, unverified: 1 } as const;
const feasibility = { missing: 0, "human-only": 2, unverified: 1 } as const;

export function rankPriorities(capabilities: CapabilityResult[], limit = 3): PriorityGap[] {
  return capabilities
    .map((capability, order) => ({ capability, order }))
    .filter(
      (item): item is typeof item & { capability: CapabilityResult & { state: keyof typeof severity } } =>
        item.capability.expected && item.capability.state in severity,
    )
    .map(({ capability, order }) => ({
      actionId: capability.actionId,
      label: capability.label,
      state: capability.state,
      priorityScore: capability.importance * severity[capability.state] + feasibility[capability.state],
      reason: recommendationFor(capability),
      order,
    }))
    .sort((left, right) =>
      right.priorityScore - left.priorityScore || left.order - right.order || left.actionId.localeCompare(right.actionId),
    )
    .slice(0, limit)
    .map(({ order: _order, ...priority }) => priority);
}

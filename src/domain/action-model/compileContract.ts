import { actionContractSchema } from "../../shared/schemas/report.js";
import type { ActionContract, CapabilityEvidence } from "../../shared/types/index.js";
import type { CompiledAction } from "./compileGraph.js";

export function compileActionContract(
  action: CompiledAction,
  siteUrl: string,
  evidence: CapabilityEvidence[] = [],
  object?: { id: string; name: string; types: string[] },
): ActionContract {
  const canonicalSiteUrl = new URL(siteUrl).toString();
  const contract = {
    "@context": [
      "https://schema.org",
      { wlcap: "https://wordlift.io/vocab/agent-capability/" },
    ],
    "@id": `urn:wordlift:capability:${action.id}`,
    "@type": ["Action", "wlcap:CapabilityContract"],
    name: action.label,
    object: object
      ? { "@id": object.id, name: object.name, type: object.types }
      : { "@id": canonicalSiteUrl },
    stage: action.stage,
    intent: action.intent,
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
    governance: action.governance,
    recommendedDelivery: action.recommendedDelivery,
    modelVersion: action.expectationSource.find((item) => item.startsWith("model:"))?.slice(6) ?? "0.1.0",
    expectationSource: [
      ...action.expectationSource,
      ...evidence.map((item) => `evidence:${item.id}`),
    ].sort(),
  };
  return actionContractSchema.parse(contract);
}

import { actionContractSchema } from "../../shared/schemas/report.js";
import type { ActionContract, CapabilityEvidence, DomainEntity } from "../../shared/types/index.js";
import type { CompiledAction } from "./compileGraph.js";

export function compileActionContract(
  action: CompiledAction,
  siteUrl: string,
  evidence: CapabilityEvidence[] = [],
  object?: { id: string; name: string; types: string[] },
  offers: DomainEntity["offers"] = [],
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
    inputSchema: groundSchemaInOffers(action.inputSchema, offers),
    outputSchema: action.outputSchema,
    governance: action.governance,
    recommendedDelivery: action.recommendedDelivery,
    modelVersion: action.expectationSource.find((item) => item.startsWith("model:"))?.slice(6) ?? "0.1.0",
    // The report schema caps this list at 20 entries; the model's own sources come first.
    expectationSource: [
      ...action.expectationSource.slice(0, 8),
      ...evidence.map((item) => `evidence:${item.id}`),
    ]
      .slice(0, 20)
      .sort(),
  };
  return actionContractSchema.parse(contract);
}

type JsonObject = Record<string, unknown>;

/** Fields whose examples can be filled from an offer the audit actually read on the site. */
const OFFER_EXAMPLE_SOURCES: Record<string, (offer: DomainEntity["offers"][number]) => unknown> = {
  offerId: (offer) => offer.id,
  plan: (offer) => offer.name,
  currency: (offer) => offer.priceCurrency,
};

/**
 * A contract is implementation-ready when its fields point at the site's own data: the offer ids,
 * plan names, and currencies the audit extracted become `examples` on the matching input fields.
 * The schema's shape stays the model's; only observed values are added.
 */
function groundSchemaInOffers(schema: unknown, offers: DomainEntity["offers"]): unknown {
  if (offers.length === 0 || typeof schema !== "object" || schema === null) return schema;
  const clone = structuredClone(schema) as JsonObject;
  let grounded = false;
  for (const [field, read] of Object.entries(OFFER_EXAMPLE_SOURCES)) {
    const values = [...new Set(offers.map(read).filter((value) => value !== undefined && value !== ""))].slice(0, 4);
    if (values.length === 0) continue;
    for (const property of propertiesNamed(clone, field)) {
      property.examples = values;
      grounded = true;
    }
  }
  return grounded ? clone : schema;
}

/** Finds `properties.<name>` at the top level and one level down inside array item schemas. */
function propertiesNamed(schema: JsonObject, name: string): JsonObject[] {
  const found: JsonObject[] = [];
  const visit = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const properties = (node as JsonObject).properties;
    if (typeof properties !== "object" || properties === null) return;
    const property = (properties as JsonObject)[name];
    if (typeof property === "object" && property !== null) found.push(property as JsonObject);
    for (const child of Object.values(properties as JsonObject)) {
      const items = typeof child === "object" && child !== null ? (child as JsonObject).items : undefined;
      if (items) visit(items);
    }
  };
  visit(schema);
  return found;
}

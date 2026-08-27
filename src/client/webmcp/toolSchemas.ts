/**
 * Static tool metadata. Nothing here is derived from an audited website: untrusted page text
 * must never reach a tool name, description, or input schema.
 */
export const ARCHETYPE_VALUES = [
  "commerce-retail",
  "publisher-content",
  "travel-hospitality",
  "finance-insurance",
  "saas",
  "other",
] as const;

export const AUDIT_WEBSITE_TOOL = {
  name: "audit-website",
  description:
    "Analyze a public website from an AI agent's perspective and return its site archetype, verified action-readiness score, priority capability gaps, action-stage summary, and shareable evidence report.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Public http(s) URL of the website to audit, for example https://example.com.",
      },
      archetype: {
        type: "string",
        enum: ARCHETYPE_VALUES,
        description: "Optional operating archetype to use instead of the inferred one.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

export const EXPLAIN_CAPABILITY_TOOL = {
  name: "explain-capability",
  description:
    "Explain one action from an AI Audit capability map: what the site is expected to support, whether humans and agents can do it today, the supporting evidence, the recommended fix, and the machine-readable action contract.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", description: "Identifier of the report currently open in the page." },
      actionId: {
        type: "string",
        description: "Action identifier from the capability map, for example travel.check-availability.",
      },
    },
    required: ["actionId"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

export const CHECK_ALPINA_AVAILABILITY_TOOL = {
  name: "check-alpina-availability",
  description:
    "Check read-only room availability on alpina.travel for a date range and guest count. This looks up availability only: it creates no booking, holds no inventory, sends no guest details, and takes no payment.",
  inputSchema: {
    type: "object",
    properties: {
      propertyId: { type: "string", description: "Property identifier. Defaults to samspitze-4." },
      checkIn: { type: "string", description: "Arrival date as YYYY-MM-DD." },
      checkOut: { type: "string", description: "Departure date as YYYY-MM-DD, after the arrival date." },
      adults: { type: "integer", minimum: 1, maximum: 6, description: "Number of adults." },
      childrenAges: {
        type: "array",
        items: { type: "integer", minimum: 0, maximum: 17 },
        description: "Ages of accompanying children, in years.",
      },
      currency: { type: "string", enum: ["EUR"], description: "Quote currency. Only EUR is supported." },
      locale: { type: "string", enum: ["en", "de", "it"], description: "Response locale." },
    },
    required: ["checkIn", "checkOut", "adults"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

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

export const GET_AUDIT_REPORT_TOOL = {
  name: "get-audit-report",
  description:
    "Check on an audit started with audit-website using its reportId: returns the current phase and progress while the audit is still running, and the finished result — site archetype, verified action-readiness score, priority capability gaps, action-stage summary, and shareable evidence report — once it completes.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", description: "The reportId returned by audit-website." },
    },
    required: ["reportId"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

export const INSPECT_SERVICE_MAP_TOOL = {
  name: "inspect-service-map",
  description:
    "Read the machine-generated service map for the open audit report. Call this FIRST when a user wants to review, correct, or human-refine the map — before interviewing the business owner and before refine-service-map. Returns the inferred operating role, every entity with its id and machine priority, the business terminology, and every action with its actionId, evidence, current readiness, and boundary.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", description: "Optional identifier of the report currently open in the page." },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

export const EXPLAIN_CAPABILITY_TOOL = {
  name: "explain-capability",
  description:
    "Explain one action from an AI Audit capability map. Use this when the reviewer needs more evidence before deciding an action's boundary: it returns what the site is expected to support, whether humans and agents can do it today, the supporting evidence, the recommended fix, and the machine-readable action contract.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", description: "Identifier of the report currently open in the page." },
      actionId: {
        type: "string",
        description: "Action identifier from the capability map, for example availability.check.",
      },
    },
    required: ["actionId"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

export const EXPLAIN_FOUNDATION_AUDIT_TOOL = {
  name: "explain-foundation-audit",
  description:
    "Return the complete safe WordLift foundation audit for the open report, including every normalized audit dimension, findings, quick wins, scores, provenance, and detailed data points.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", description: "Optional identifier of the report currently open in the page." },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
} as const;

export const REFINE_SERVICE_MAP_TOOL = {
  name: "refine-service-map",
  description:
    "Call ONLY after inspect-service-map and after collecting the reviewer's decisions. Submits the human's structured judgment about the open report's service map — the business's operating role, its primary entities, its vocabulary, and confirm/reject/boundary decisions per action — and creates a new immutable refined child report: its URL, what changed, and any assertions that could not be applied. Human decisions can never mark an action agent-ready; readiness always requires successful invocation evidence.",
  inputSchema: {
    type: "object",
    properties: {
      reportId: { type: "string", description: "Identifier of the report currently open in the page." },
      businessRole: {
        type: "string",
        description: "The organization's operating role in the reviewer's words, e.g. destination-organization, merchant, marketplace.",
      },
      primaryEntityIds: {
        type: "array",
        items: { type: "string" },
        maxItems: 80,
        description: "Entity ids from this report to promote as the business's primary objects (at most 80).",
      },
      demotedEntityIds: {
        type: "array",
        items: { type: "string" },
        maxItems: 80,
        description: "Entity ids from this report to demote as peripheral (at most 80).",
      },
      terminology: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          properties: {
            term: { type: "string", description: "A word the site uses." },
            meaning: { type: "string", description: "What it means for this business." },
          },
          required: ["term", "meaning"],
          additionalProperties: false,
        },
        description: "Business vocabulary the machine could not know (at most 40 entries). Each entry replaces any machine term of the same name in the lexical graph.",
      },
      terminologyDecisions: {
        type: "array",
        maxItems: 40,
        items: {
          type: "object",
          properties: {
            term: { type: "string", description: "A term currently in the report's lexical graph." },
            decision: {
              type: "string",
              enum: ["confirm", "replace", "reject"],
              description: "confirm keeps the machine's term as reviewed; replace redefines it (meaning required); reject removes it from the lexical graph.",
            },
            meaning: { type: "string", description: "The business's own definition; required when decision is replace." },
          },
          required: ["term", "decision"],
          additionalProperties: false,
        },
        description: "Judgments about the machine's own vocabulary (at most 40 entries).",
      },
      actionDecisions: {
        type: "array",
        maxItems: 80,
        items: {
          type: "object",
          properties: {
            actionId: { type: "string", description: "An action id from this report's capability map." },
            decision: { type: "string", enum: ["confirm", "reject"] },
            boundary: {
              type: "string",
              enum: ["owned", "partner-handoff", "informational-only", "not-applicable"],
              description: "Who is responsible: the site itself, a partner it hands off to, information only, or nobody.",
            },
            rationale: { type: "string", description: "Why, in one or two sentences." },
          },
          required: ["actionId", "decision"],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, untrustedContentHint: true },
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

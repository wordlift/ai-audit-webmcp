import {
  AUDIT_WEBSITE_TOOL,
  EXPLAIN_CAPABILITY_TOOL,
  EXPLAIN_FOUNDATION_AUDIT_TOOL,
  GET_AUDIT_REPORT_TOOL,
  INSPECT_SERVICE_MAP_TOOL,
  withRequiredReportId,
  type ToolDefinition,
} from "../../shared/tools/index.js";
import type { AuditToolService, ToolAnswer } from "../services/AuditToolService.js";

/** A JSON Schema object suitable for MCP tool outputSchema. */
type ToolOutputSchema = Readonly<Record<string, unknown>>;
type RemoteToolDefinition = ToolDefinition & { readonly outputSchema: ToolOutputSchema };

const NULLABLE_STRING = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const NULLABLE_NUMBER = { anyOf: [{ type: "number" }, { type: "null" }] } as const;

const STAGE_COUNT_SCHEMA = {
  type: "object",
  properties: {
    ready: { type: "integer" },
    expected: { type: "integer" },
  },
  required: ["ready", "expected"],
  additionalProperties: false,
} as const;

const AUDIT_FINISHED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reportId: { type: "string" },
    canonicalUrl: { type: "string" },
    archetype: { type: "string" },
    classificationConfidence: { type: "string" },
    agentReadinessScore: { type: "number" },
    foundationAuditScore: NULLABLE_NUMBER,
    foundationSummary: NULLABLE_STRING,
    foundationFindings: { type: "array", items: { type: "string" } },
    foundationQuickWins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          impact: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    foundationDimensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          score: { type: "number" },
          status: { type: "string" },
        },
        required: ["id", "label"],
        additionalProperties: false,
      },
    },
    pagesAnalyzed: { type: "integer" },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          types: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "types"],
        additionalProperties: false,
      },
    },
    publishedWith: NULLABLE_STRING,
    botAccess: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          status: { type: "string" },
        },
        required: ["name", "status"],
        additionalProperties: false,
      },
    },
    priorityGaps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          actionId: { type: "string" },
          label: { type: "string" },
          state: { type: "string" },
          reason: { type: "string" },
        },
        required: ["actionId", "label", "state", "reason"],
        additionalProperties: false,
      },
    },
    stages: {
      type: "object",
      properties: {
        discover: STAGE_COUNT_SCHEMA,
        understandDecide: STAGE_COUNT_SCHEMA,
        act: STAGE_COUNT_SCHEMA,
        manage: STAGE_COUNT_SCHEMA,
      },
      required: ["discover", "understandDecide", "act", "manage"],
      additionalProperties: false,
    },
    reportUrl: { type: "string" },
    partial: { type: "boolean" },
    notes: { type: "array", items: { type: "string" } },
  },
  required: [
    "reportId",
    "canonicalUrl",
    "archetype",
    "classificationConfidence",
    "agentReadinessScore",
    "foundationAuditScore",
    "foundationSummary",
    "foundationFindings",
    "foundationQuickWins",
    "foundationDimensions",
    "pagesAnalyzed",
    "entities",
    "publishedWith",
    "botAccess",
    "priorityGaps",
    "stages",
    "reportUrl",
    "partial",
    "notes",
  ],
  additionalProperties: false,
} as const;

const AUDIT_RUNNING_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reportId: { type: "string" },
    status: { type: "string", enum: ["running"] },
    phase: { type: "string" },
    reportUrl: { type: "string" },
    statusTool: { type: "string", enum: ["get-audit-report"] },
    pagesAnalyzed: { type: "integer" },
    foundationAuditReady: { type: "boolean" },
    note: { type: "string" },
  },
  required: ["reportId", "status", "phase", "reportUrl", "statusTool", "note"],
  additionalProperties: false,
} as const;

const AUDIT_OUTPUT_SCHEMA = {
  type: "object",
  description:
    "Either a completed evidence-backed audit summary or a running result with a reportId that can be passed to get-audit-report.",
  oneOf: [AUDIT_FINISHED_OUTPUT_SCHEMA, AUDIT_RUNNING_OUTPUT_SCHEMA],
} as const;

const INSPECT_TERMS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reportId: { type: "string" },
    reportUrl: { type: "string" },
    refined: { type: "boolean" },
    operatingRole: {
      type: "object",
      properties: {
        inferred: { type: "string" },
        confidence: { type: "number" },
        source: { type: "string", enum: ["human-provided", "machine-inferred"] },
      },
      required: ["inferred", "confidence", "source"],
      additionalProperties: false,
    },
    entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          machinePriority: { type: "string", enum: ["primary", "secondary", "context"] },
        },
        required: ["id", "name", "type", "machinePriority"],
        additionalProperties: false,
      },
    },
    terminology: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          inferredMeaning: { type: "string" },
          confidence: { type: "number" },
          source: { type: "string" },
        },
        required: ["term", "inferredMeaning", "confidence", "source"],
        additionalProperties: false,
      },
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          actionId: { type: "string" },
          label: { type: "string" },
          stage: { type: "string" },
          expected: { type: "boolean" },
          state: { type: "string" },
          agentReady: { type: "boolean" },
          boundary: NULLABLE_STRING,
          boundarySource: NULLABLE_STRING,
          evidence: { type: "array", items: { type: "string" } },
        },
        required: [
          "actionId",
          "label",
          "stage",
          "expected",
          "state",
          "agentReady",
          "boundary",
          "boundarySource",
          "evidence",
        ],
        additionalProperties: false,
      },
    },
    nextStep: { type: "string" },
  },
  required: ["reportId", "reportUrl", "refined", "operatingRole", "entities", "terminology", "actions", "nextStep"],
  additionalProperties: false,
} as const;

const EXPLAIN_CAPABILITY_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reportId: { type: "string" },
    actionId: { type: "string" },
    label: { type: "string" },
    description: { type: "string" },
    stage: { type: "string" },
    intent: { type: "string" },
    expected: { type: "boolean" },
    expectationSource: { type: "array", items: { type: "string" } },
    state: { type: "string" },
    humanSupport: { type: "boolean" },
    agentSupport: { type: "boolean" },
    appliesTo: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          types: { type: "array", items: { type: "string" } },
        },
        required: ["id", "name", "types"],
        additionalProperties: false,
      },
    },
    interfaces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          protocol: { type: "string" },
          status: { type: "string" },
          sourceUrl: { type: "string" },
        },
        required: ["name", "protocol", "status", "sourceUrl"],
        additionalProperties: false,
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          audience: { type: "string" },
          kind: { type: "string" },
          verification: { type: "string" },
          claim: { type: "string" },
          sourceUrl: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["audience", "kind", "verification", "claim", "sourceUrl", "confidence"],
        additionalProperties: false,
      },
    },
    recommendation: NULLABLE_STRING,
    governance: {
      anyOf: [
        {
          type: "object",
          properties: {
            requiresAuthentication: { type: "boolean" },
            requiresAuthorization: { type: "boolean" },
            requiresConfirmation: { type: "boolean" },
            sideEffects: { type: "string" },
          },
          required: ["requiresAuthentication", "requiresAuthorization", "requiresConfirmation", "sideEffects"],
          additionalProperties: false,
        },
        { type: "null" },
      ],
    },
    recommendedDelivery: NULLABLE_STRING,
    contractUrl: NULLABLE_STRING,
    boundary: NULLABLE_STRING,
    boundaryRationale: NULLABLE_STRING,
  },
  required: [
    "reportId",
    "actionId",
    "label",
    "description",
    "stage",
    "intent",
    "expected",
    "expectationSource",
    "state",
    "humanSupport",
    "agentSupport",
    "appliesTo",
    "interfaces",
    "evidence",
    "recommendation",
    "governance",
    "recommendedDelivery",
    "contractUrl",
    "boundary",
    "boundaryRationale",
  ],
  additionalProperties: false,
} as const;

const FOUNDATION_AUDIT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reportId: { type: "string" },
    canonicalUrl: { type: "string" },
    score: { type: "number" },
    summary: { type: "string" },
    findings: { type: "array", items: { type: "string" } },
    quickWins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          impact: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    dimensions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          score: { type: "number" },
          status: { type: "string" },
          explanation: { type: "string" },
          details: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
              },
              required: ["label", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "label", "details"],
        additionalProperties: false,
      },
    },
    provider: { type: "string" },
    collectedAt: NULLABLE_STRING,
    sourceUrl: NULLABLE_STRING,
    mainAuditUrl: { type: "string" },
  },
  required: [
    "reportId",
    "canonicalUrl",
    "score",
    "summary",
    "findings",
    "quickWins",
    "dimensions",
    "provider",
    "collectedAt",
    "sourceUrl",
    "mainAuditUrl",
  ],
  additionalProperties: false,
} as const;

/**
 * The AI Audit as a public remote MCP server offers.
 *
 * Two things are deliberately absent. The Alpina availability tool is the sidecar demo, bound to
 * one allowlisted upstream, and has no meaning to a caller auditing their own site. Publishing a
 * human refinement is also deliberately absent from this anonymous remote surface: that action
 * requires user-bound authorization and must not rely on a bearer secret carried in model-visible
 * tool results. Refinement remains available on the browser/WebMCP surface, where the reviewer is
 * acting on the open report.
 *
 * The deprecated `*-service-map` names stay registered in the browser, where callers wrote them
 * down before the rename; this surface is new and has no such history to keep working.
 */
export interface RemoteTool {
  definition: RemoteToolDefinition;
  call(service: AuditToolService, args: unknown): Promise<ToolAnswer<unknown>>;
}

const REMOTE_AUDIT_WEBSITE_TOOL: RemoteToolDefinition = {
  ...AUDIT_WEBSITE_TOOL,
  outputSchema: AUDIT_OUTPUT_SCHEMA,
};

const REMOTE_GET_AUDIT_REPORT_TOOL: RemoteToolDefinition = {
  ...withRequiredReportId(GET_AUDIT_REPORT_TOOL),
  outputSchema: AUDIT_OUTPUT_SCHEMA,
};

/**
 * The shared in-page definition names the browser refinement tool. The anonymous remote surface
 * intentionally does not publish that tool, so its description must not instruct a model to call
 * something that is absent from tools/list.
 */
const REMOTE_INSPECT_TERMS_TOOL: RemoteToolDefinition = {
  ...withRequiredReportId(INSPECT_SERVICE_MAP_TOOL),
  description:
    "Read the machine-generated Terms of Action for an audit report before proposing corrections. Returns the inferred operating role, every entity with its id and machine priority, the business terminology, and every action with its actionId, evidence, current readiness, and boundary. Use this first when a user wants to review or correct the machine's reading; the public remote plugin can then produce a confirmed correction plan but does not persist a human refinement.",
  outputSchema: INSPECT_TERMS_OUTPUT_SCHEMA,
};

const REMOTE_EXPLAIN_CAPABILITY_TOOL: RemoteToolDefinition = {
  ...withRequiredReportId(EXPLAIN_CAPABILITY_TOOL),
  outputSchema: EXPLAIN_CAPABILITY_OUTPUT_SCHEMA,
};

/**
 * The shared definition is also used by the in-page browser surface, where "open report" is
 * meaningful. The remote MCP always addresses reports explicitly by reportId, so keep the public
 * contract transport-accurate for directory reviewers and models.
 */
const REMOTE_FOUNDATION_AUDIT_TOOL: RemoteToolDefinition = {
  ...withRequiredReportId(EXPLAIN_FOUNDATION_AUDIT_TOOL),
  description:
    "Return the complete safe WordLift foundation audit for the report identified by reportId, including every normalized audit dimension, findings, quick wins, scores, provenance, and detailed data points.",
  outputSchema: FOUNDATION_AUDIT_OUTPUT_SCHEMA,
};

export const REMOTE_TOOLS: readonly RemoteTool[] = [
  {
    definition: REMOTE_AUDIT_WEBSITE_TOOL,
    call: (service, args) => service.auditWebsite(args),
  },
  {
    definition: REMOTE_GET_AUDIT_REPORT_TOOL,
    call: (service, args) => service.getAuditReport(args),
  },
  {
    definition: REMOTE_INSPECT_TERMS_TOOL,
    call: (service, args) => service.inspectTermsOfAction(args),
  },
  {
    definition: REMOTE_EXPLAIN_CAPABILITY_TOOL,
    call: (service, args) => service.explainCapability(args),
  },
  {
    definition: REMOTE_FOUNDATION_AUDIT_TOOL,
    call: (service, args) => service.explainFoundationAudit(args),
  },
];

export function remoteTool(name: string): RemoteTool | undefined {
  return REMOTE_TOOLS.find((tool) => tool.definition.name === name);
}

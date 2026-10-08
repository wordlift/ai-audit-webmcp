import { LeadDeliveryError, type AnnouncedReport, type DeliverableReport, type LeadDelivery } from "./LeadDelivery.js";
import type { DeepScanLead } from "./LeadStore.js";
import { leadSignalsText, type LeadSignalName } from "../../../domain/engine/signals.js";

/**
 * Delivery through the same HubSpot form the WordLift AI Audit already submits to: the Forms v3
 * submission endpoint, the same portal, the same form, the same field names. Reusing the form
 * rather than inventing a second one means one contact record per person, whichever audit they
 * arrived through.
 *
 * The form's other fields — name, company, role, country — are collected by the audit's own sign-up
 * modal. This surface asks for an address and nothing else, so it sends an address and nothing else:
 * inventing a name to fill a field is the thing the skill is explicitly told never to do.
 *
 * Which is also how a submission from here is told apart from one from the older audit: that one
 * always carries a name and a company and quotes a page on audit.wordlift.io. Every submission from
 * this service names its own surface in the form context, and — where the portal has a property for
 * it — in a field, so the three ways in are distinguishable without inference.
 */
export type HubSpotRegion = "na1" | "eu1";

export interface HubSpotOptions {
  portalId: string;
  formGuid: string;
  /**
   * Which HubSpot data region hosts the portal. An EU portal has its own submission host, and
   * although the default host currently routes EU submissions too, that is not what HubSpot
   * documents — a portal's region is not something to leave to a redirect.
   */
  region?: HubSpotRegion;
  /**
   * A form property that records which surface a lead came from, when the portal has one. HubSpot
   * rejects a whole submission that names a field the form does not have, so this stays opt-in:
   * without it the surface is still named in the submission context.
   */
  sourceField?: string;
  /**
   * The form properties that hold qualification signals, by signal name. Opt-in per property for the
   * same reason as the source field; the signals always travel as lines at the end of the summary.
   */
  signalFields?: Partial<Record<LeadSignalName, string>>;
  /**
   * A form property that says how far the audit got for this contact: `requested` on the first
   * write, `completed` on the second. Opt-in for the same reason; without it the two writes are
   * told apart by the fields they carry (the first has no score).
   */
  statusField?: string;
  /** Overridable for tests; production is HubSpot's public submission host. */
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const SUBMISSION_HOSTS: Record<HubSpotRegion, string> = {
  na1: "https://api.hsforms.com/submissions/v3/integration/submit",
  eu1: "https://api-eu1.hsforms.com/submissions/v3/integration/submit",
};
const DEFAULT_TIMEOUT_MS = 10_000;

/** The form is plain text; markdown emphasis arrives as literal asterisks in an email. */
function plainText(value: string): string {
  return value.replace(/[*_`]/g, "");
}

/**
 * How each way in names itself. Stable strings: they end up in HubSpot reports, and a value that
 * changes shape between releases splits one source into two lines of a funnel.
 */
const SOURCE_VALUES: Record<DeepScanLead["source"], string> = {
  web: "ai-audit-webmcp:web-form",
  webmcp: "ai-audit-webmcp:in-page-agent",
  mcp: "ai-audit-webmcp:mcp-server",
};

/** A note about what moved names itself apart from the report it follows, so the portal can route it. */
const MOVEMENT_NAME = "WordLift AI Audit — what moved";

const SOURCE_NAMES: Record<DeepScanLead["source"], string> = {
  web: "WordLift AI Audit — report (web form)",
  webmcp: "WordLift AI Audit — report (in-page agent)",
  mcp: "WordLift AI Audit — report (MCP server)",
};

/** The two writes, as the portal sees them. Stable strings, like the sources. */
const STATUS_VALUES = { requested: "requested", completed: "completed" } as const;

export class HubSpotLeadDelivery implements LeadDelivery {
  readonly name = "hubspot";

  constructor(private readonly options: HubSpotOptions) {}

  /**
   * The first write: the address, the site and where the report will be. HubSpot creates the
   * contact from the address, or finds it; the second write updates the same contact's properties.
   */
  async announce(lead: DeepScanLead, report: AnnouncedReport): Promise<void> {
    await this.submit(lead, report.reportUrl, "report", [
      { name: "email", value: lead.email },
      { name: "audited_url", value: report.canonicalUrl },
      ...(this.options.sourceField ? [{ name: this.options.sourceField, value: SOURCE_VALUES[lead.source] }] : []),
      ...(this.options.statusField ? [{ name: this.options.statusField, value: STATUS_VALUES.requested }] : []),
    ]);
  }

  async deliver(lead: DeepScanLead, report: DeliverableReport): Promise<void> {
    await this.submit(lead, report.reportUrl, report.subject ?? "report", [
      { name: "email", value: lead.email },
      { name: "audited_url", value: report.canonicalUrl },
      { name: "audit_score", value: String(report.agentReadinessScore) },
      { name: "audit_summary", value: plainText(`${report.reportUrl}\n\n${report.summary}${report.signals ? `\n\n${leadSignalsText(report.signals)}` : ""}`) },
      ...(this.options.sourceField ? [{ name: this.options.sourceField, value: SOURCE_VALUES[lead.source] }] : []),
      ...(this.options.statusField && report.subject !== "movement" ? [{ name: this.options.statusField, value: STATUS_VALUES.completed }] : []),
      ...(report.signals
        ? Object.entries(this.options.signalFields ?? {}).map(([signal, property]) => ({ name: property as string, value: report.signals![signal as LeadSignalName] }))
        : []),
    ]);
  }

  private async submit(
    lead: DeepScanLead,
    pageUri: string,
    subject: "report" | "movement",
    fields: Array<{ name: string; value: string }>,
  ): Promise<void> {
    const base = this.options.endpoint ?? SUBMISSION_HOSTS[this.options.region ?? "na1"];
    const endpoint = `${base}/${this.options.portalId}/${this.options.formGuid}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const send = this.options.fetchImpl ?? fetch;
    try {
      const response = await send(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields,
          context: { pageUri, pageName: subject === "movement" ? MOVEMENT_NAME : SOURCE_NAMES[lead.source] },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // HubSpot's error body quotes the submitted values back, including the address, so only
        // its shape travels into an exception: the status and the error type it names.
        throw new LeadDeliveryError(`HubSpot refused the submission (${await errorType(response)})`, response.status);
      }
    } catch (error) {
      if (error instanceof LeadDeliveryError) throw error;
      throw new LeadDeliveryError(
        error instanceof Error && error.name === "AbortError"
          ? "HubSpot did not answer in time"
          : "HubSpot could not be reached",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

async function errorType(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errors?: Array<{ errorType?: unknown }>; category?: unknown };
    const first = body.errors?.[0]?.errorType ?? body.category;
    return typeof first === "string" ? first : `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

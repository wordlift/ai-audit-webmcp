import { LeadDeliveryError, type DeliverableReport, type LeadDelivery } from "./LeadDelivery.js";
import type { DeepScanLead } from "./LeadStore.js";

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
export interface HubSpotOptions {
  portalId: string;
  formGuid: string;
  /**
   * A form property that records which surface a lead came from, when the portal has one. HubSpot
   * rejects a whole submission that names a field the form does not have, so this stays opt-in:
   * without it the surface is still named in the submission context.
   */
  sourceField?: string;
  /** Overridable for tests; production is HubSpot's public submission host. */
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_ENDPOINT = "https://api.hsforms.com/submissions/v3/integration/submit";
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

const SOURCE_NAMES: Record<DeepScanLead["source"], string> = {
  web: "WordLift AI Audit — deep scan (web form)",
  webmcp: "WordLift AI Audit — deep scan (in-page agent)",
  mcp: "WordLift AI Audit — deep scan (MCP server)",
};

export class HubSpotLeadDelivery implements LeadDelivery {
  readonly name = "hubspot";

  constructor(private readonly options: HubSpotOptions) {}

  async deliver(lead: DeepScanLead, report: DeliverableReport): Promise<void> {
    const endpoint = `${this.options.endpoint ?? DEFAULT_ENDPOINT}/${this.options.portalId}/${this.options.formGuid}`;
    const fields = [
      { name: "email", value: lead.email },
      { name: "audited_url", value: report.canonicalUrl },
      { name: "audit_score", value: String(report.agentReadinessScore) },
      { name: "audit_summary", value: plainText(`${report.reportUrl}\n\n${report.summary}`) },
      ...(this.options.sourceField ? [{ name: this.options.sourceField, value: SOURCE_VALUES[lead.source] }] : []),
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const send = this.options.fetchImpl ?? fetch;
    try {
      const response = await send(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fields,
          context: { pageUri: report.reportUrl, pageName: SOURCE_NAMES[lead.source] },
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

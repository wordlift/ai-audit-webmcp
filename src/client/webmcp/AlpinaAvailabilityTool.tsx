import { useWebMCP } from "use-webmcp-tool";
import { useNavigate } from "react-router-dom";
import { checkAlpinaAvailability, type AlpinaAvailabilityResponse } from "../api/client";
import { CHECK_ALPINA_AVAILABILITY_TOOL } from "./toolSchemas";

interface AlpinaToolArgs {
  propertyId?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  adults?: unknown;
  childrenAges?: unknown;
  locale?: unknown;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new Error(`Ask the guest for ${field} as a YYYY-MM-DD date before checking availability.`);
  }
  return value;
}

/**
 * The approved read-only sidecar tool. It is registered only on an Alpina report, asks for missing
 * dates instead of inventing them, and never creates a booking.
 */
export function AlpinaAvailabilityTool({ reportId, enabled }: { reportId?: string; enabled: boolean }) {
  const navigate = useNavigate();

  useWebMCP<AlpinaToolArgs, AlpinaAvailabilityResponse>({
    name: CHECK_ALPINA_AVAILABILITY_TOOL.name,
    description: CHECK_ALPINA_AVAILABILITY_TOOL.description,
    inputSchema: CHECK_ALPINA_AVAILABILITY_TOOL.inputSchema,
    annotations: CHECK_ALPINA_AVAILABILITY_TOOL.annotations,
    enabled,
    execute: async (args) => {
      const adults = typeof args?.adults === "number" ? args.adults : Number.NaN;
      if (!Number.isInteger(adults) || adults < 1) {
        throw new Error("Ask the guest how many adults are travelling before checking availability.");
      }

      const result = await checkAlpinaAvailability({
        reportId,
        propertyId: typeof args?.propertyId === "string" ? args.propertyId : undefined,
        checkIn: requireDate(args?.checkIn, "the arrival date"),
        checkOut: requireDate(args?.checkOut, "the departure date"),
        adults,
        childrenAges: Array.isArray(args?.childrenAges)
          ? args.childrenAges.filter((age): age is number => typeof age === "number")
          : undefined,
        locale: args?.locale === "de" || args?.locale === "it" ? args.locale : "en",
      });

      if (result.updatedReportUrl) navigate(result.updatedReportUrl);
      return result;
    },
    formatOutput: (result) => ({
      content: [{ type: "text", text: describeAvailability(result) }],
      structuredContent: result,
    }),
  });

  return null;
}

export function describeAvailability(result: AlpinaAvailabilityResponse): string {
  const lines = [
    result.available
      ? `${result.propertyId} is available for ${result.checkIn} to ${result.checkOut} (${result.nights} nights, ${result.totalGuests} guests).`
      : `${result.propertyId} is ${result.status} for ${result.checkIn} to ${result.checkOut}.`,
  ];

  if (result.quote) {
    lines.push(`Quoted total: ${result.quote.total.toFixed(2)} ${result.quote.currency}.`);
    if (result.quote.cancellationSummary) lines.push(`Cancellation policy: ${result.quote.cancellationSummary}`);
    if (result.quote.taxes?.length) lines.push(`Taxes and fees: ${result.quote.taxes.join(" ")}`);
  }
  if (result.checkoutUrl) lines.push(`A person can complete the booking at ${result.checkoutUrl}`);
  if (result.expiresAt) lines.push(`This answer expires at ${result.expiresAt}.`);
  lines.push(result.notice);
  if (result.updatedReportUrl) lines.push(`Updated capability map: ${result.updatedReportUrl}`);
  if (result.reportUpdateError) lines.push(`The capability map was not updated: ${result.reportUpdateError}`);

  return lines.join("\n");
}

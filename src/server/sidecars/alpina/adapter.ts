import { z } from "zod";
import type { CapabilityEvidence } from "../../../shared/types/index.js";
import {
  ALPINA_AVAILABILITY_ENDPOINT,
  READ_ONLY_NOTICE,
  alpinaAvailabilityInputSchema,
  alpinaAvailabilityResultSchema,
  type AlpinaAvailabilityRequest,
  type AlpinaAvailabilityResult,
} from "./schemas.js";

/** Upstream shape, read loosely: only allowlisted fields below are ever forwarded. */
const upstreamSchema = z
  .object({
    propertyId: z.string().optional(),
    status: z.string().optional(),
    available: z.boolean().optional(),
    checkIn: z.string().optional(),
    checkOut: z.string().optional(),
    adults: z.number().optional(),
    childrenAges: z.array(z.number()).optional(),
    totalGuests: z.number().optional(),
    quote: z
      .object({
        total: z.object({ amount: z.number().optional(), currency: z.string().optional() }).loose().optional(),
        breakdown: z
          .object({
            instantConfirmation: z.boolean().optional(),
            cancellationPolicy: z.object({ summary: z.string().optional() }).loose().optional(),
            taxes: z.array(z.string()).optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
    checkoutUrl: z.string().optional(),
    checkedAt: z.string().optional(),
    expiresAt: z.string().optional(),
    requiresRevalidation: z.boolean().optional(),
  })
  .loose();

export class AlpinaSidecarError extends Error {
  constructor(
    readonly code: "invalid_input" | "upstream_unavailable" | "upstream_invalid" | "upstream_timeout",
    message: string,
    readonly status: 400 | 502 | 504 = 502,
  ) {
    super(message);
    this.name = "AlpinaSidecarError";
  }
}

export interface AlpinaAdapterOptions {
  timeoutMs?: number;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

/**
 * A hand-written, allowlisted adapter for one public read-only endpoint. It looks up availability
 * and nothing else: no booking session, no inventory hold, no guest data, no payment.
 */
export class AlpinaAvailabilitySidecar {
  readonly actionId = "availability.check";

  constructor(private readonly options: AlpinaAdapterOptions = {}) {}

  parse(input: unknown): AlpinaAvailabilityRequest {
    const parsed = alpinaAvailabilityInputSchema.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AlpinaSidecarError("invalid_input", issue ? `${issue.path.join(".") || "input"}: ${issue.message}` : "Invalid input", 400);
    }
    return parsed.data;
  }

  async check(input: unknown): Promise<AlpinaAvailabilityResult> {
    const request = this.parse(input);
    const upstream = await this.call(request);
    return this.normalize(request, upstream);
  }

  private async call(request: AlpinaAvailabilityRequest): Promise<z.infer<typeof upstreamSchema>> {
    const endpoint = new URL(ALPINA_AVAILABILITY_ENDPOINT);
    endpoint.searchParams.set("propertyId", request.propertyId);
    endpoint.searchParams.set("checkIn", request.checkIn);
    endpoint.searchParams.set("checkOut", request.checkOut);
    endpoint.searchParams.set("adults", String(request.adults));
    if (request.childrenAges.length > 0) endpoint.searchParams.set("childrenAges", request.childrenAges.join(","));
    endpoint.searchParams.set("currency", request.currency);
    endpoint.searchParams.set("locale", request.locale);

    const fetchImpl = this.options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);

    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) {
        throw new AlpinaSidecarError("upstream_unavailable", `The availability service returned status ${response.status}.`);
      }
      return upstreamSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof AlpinaSidecarError) throw error;
      if (controller.signal.aborted) {
        throw new AlpinaSidecarError("upstream_timeout", "The availability service did not respond in time.", 504);
      }
      if (error instanceof z.ZodError) {
        throw new AlpinaSidecarError("upstream_invalid", "The availability service returned an unreadable response.");
      }
      throw new AlpinaSidecarError("upstream_unavailable", "The availability service could not be reached.");
    } finally {
      clearTimeout(timer);
    }
  }

  private normalize(request: AlpinaAvailabilityRequest, upstream: z.infer<typeof upstreamSchema>): AlpinaAvailabilityResult {
    const nights = Math.round(
      (Date.parse(`${request.checkOut}T00:00:00Z`) - Date.parse(`${request.checkIn}T00:00:00Z`)) / 86_400_000,
    );
    const amount = upstream.quote?.total?.amount;
    const currency = upstream.quote?.total?.currency;

    return alpinaAvailabilityResultSchema.parse({
      source: ALPINA_AVAILABILITY_ENDPOINT,
      propertyId: upstream.propertyId ?? request.propertyId,
      available: upstream.available ?? upstream.status === "available",
      status: upstream.status === "available" ? "available" : upstream.status === "unavailable" ? "unavailable" : "unknown",
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      nights,
      adults: request.adults,
      childrenAges: request.childrenAges,
      totalGuests: upstream.totalGuests ?? request.adults + request.childrenAges.length,
      quote:
        typeof amount === "number" && currency === "EUR"
          ? {
              total: amount,
              currency: "EUR" as const,
              instantConfirmation: upstream.quote?.breakdown?.instantConfirmation,
              cancellationSummary: upstream.quote?.breakdown?.cancellationPolicy?.summary?.slice(0, 600),
              taxes: upstream.quote?.breakdown?.taxes?.slice(0, 10).map((tax) => tax.slice(0, 300)),
            }
          : undefined,
      checkoutUrl: upstream.checkoutUrl,
      checkedAt: upstream.checkedAt ?? this.now().toISOString(),
      expiresAt: upstream.expiresAt,
      requiresRevalidation: upstream.requiresRevalidation ?? true,
      readOnly: true as const,
      notice: READ_ONLY_NOTICE,
    });
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

/**
 * Evidence for a successful controlled invocation. Only this — an actual call that returned a
 * usable answer — may move an action to `sidecar-enabled`.
 */
export function sidecarInvocationEvidence(result: AlpinaAvailabilityResult): CapabilityEvidence {
  return {
    id: `sidecar:alpina-availability:${result.checkIn}:${result.checkOut}`,
    actionId: "availability.check",
    audience: "agent",
    kind: "tool-result",
    sourceUrl: result.source,
    claim: `An agent successfully checked availability for ${result.checkIn} to ${result.checkOut} through the approved WordLift sidecar (${result.status})`,
    confidence: 1,
    verification: "invoked",
    collectedAt: result.checkedAt,
  };
}

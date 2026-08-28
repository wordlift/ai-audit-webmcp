import { z } from "zod";

export const ALPINA_AVAILABILITY_ENDPOINT = "https://alpina.travel/api/booking/availability";
export const MAX_TOTAL_GUESTS = 6;
export const MAX_NIGHTS = 30;
export const MAX_DAYS_AHEAD = 365;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD date format")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "That is not a real date");

/**
 * The sidecar's input contract. There is deliberately no upstream URL parameter: the endpoint is
 * fixed in code, so an agent can never redirect this call somewhere else.
 */
export const alpinaAvailabilityInputSchema = z
  .object({
    reportId: z.string().uuid().optional(),
    propertyId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,39}$/i, "Unknown property identifier")
      .default("samspitze-4"),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.number().int().min(1).max(MAX_TOTAL_GUESTS),
    childrenAges: z.array(z.number().int().min(0).max(17)).max(MAX_TOTAL_GUESTS - 1).default([]),
    currency: z.literal("EUR").default("EUR"),
    locale: z.enum(["en", "de", "it"]).default("en"),
  })
  .strict()
  .superRefine((input, context) => {
    const checkIn = Date.parse(`${input.checkIn}T00:00:00Z`);
    const checkOut = Date.parse(`${input.checkOut}T00:00:00Z`);
    const nights = (checkOut - checkIn) / 86_400_000;

    if (nights <= 0) {
      context.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in" });
    }
    if (nights > MAX_NIGHTS) {
      context.addIssue({ code: "custom", path: ["checkOut"], message: `Stays longer than ${MAX_NIGHTS} nights are not checked here` });
    }
    if (input.adults + input.childrenAges.length > MAX_TOTAL_GUESTS) {
      context.addIssue({ code: "custom", path: ["adults"], message: `This property is checked for at most ${MAX_TOTAL_GUESTS} guests` });
    }
  });

/**
 * The entity a sidecar answer is grounded in, copied verbatim from the report's Key Entities. It
 * exists only when the audited site itself published the entity — never synthesized here.
 */
export const sidecarEntityContextSchema = z
  .object({
    id: z.string().min(1).max(160),
    type: z.string().min(1).max(60),
    name: z.string().min(1).max(200),
    sourceUrl: z.string().min(1).max(600),
    method: z.literal("json-ld"),
    collectedAt: z.string(),
  })
  .strict();

export type SidecarEntityContext = z.infer<typeof sidecarEntityContextSchema>;

export type AlpinaAvailabilityInput = z.input<typeof alpinaAvailabilityInputSchema>;
export type AlpinaAvailabilityRequest = z.output<typeof alpinaAvailabilityInputSchema>;

/** Only these upstream fields are forwarded; anything else the provider returns is dropped. */
export const alpinaAvailabilityResultSchema = z
  .object({
    source: z.literal(ALPINA_AVAILABILITY_ENDPOINT),
    propertyId: z.string().max(60),
    available: z.boolean(),
    status: z.enum(["available", "unavailable", "unknown"]),
    checkIn: isoDate,
    checkOut: isoDate,
    nights: z.number().int().positive(),
    adults: z.number().int().positive(),
    childrenAges: z.array(z.number().int()),
    totalGuests: z.number().int().positive(),
    quote: z
      .object({
        total: z.number().nonnegative(),
        currency: z.literal("EUR"),
        instantConfirmation: z.boolean().optional(),
        cancellationSummary: z.string().max(600).optional(),
        taxes: z.array(z.string().max(300)).max(10).optional(),
      })
      .strict()
      .optional(),
    checkoutUrl: z.string().url().max(2_048).optional(),
    checkedAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    requiresRevalidation: z.boolean(),
    readOnly: z.literal(true),
    notice: z.string().max(300),
  })
  .strict();

export type AlpinaAvailabilityResult = z.infer<typeof alpinaAvailabilityResultSchema>;

export const READ_ONLY_NOTICE =
  "Availability and pricing are time-sensitive and must be revalidated. This lookup created no booking, held no inventory, sent no guest details, and took no payment.";

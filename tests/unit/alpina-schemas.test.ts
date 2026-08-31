import { AlpinaAvailabilitySidecar, AlpinaSidecarError, resolveSidecarEntity } from "../../src/server/sidecars/alpina/adapter.js";
import { alpinaAvailabilityInputSchema } from "../../src/server/sidecars/alpina/schemas.js";
import type { DomainEntity } from "../../src/shared/types/index.js";

const sidecar = new AlpinaAvailabilitySidecar();

describe("Alpina sidecar input contract", () => {
  it("applies documented defaults", () => {
    const parsed = alpinaAvailabilityInputSchema.parse({ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2 });

    expect(parsed).toMatchObject({ propertyId: "samspitze-4", currency: "EUR", locale: "en", childrenAges: [] });
  });

  it.each([
    [{ checkIn: "2026-09-12", checkOut: "2026-09-12", adults: 2 }, /after check-in/],
    [{ checkIn: "2026-09-15", checkOut: "2026-09-12", adults: 2 }, /after check-in/],
    [{ checkIn: "12/09/2026", checkOut: "2026-09-15", adults: 2 }, /YYYY-MM-DD/],
    [{ checkIn: "2026-09-12", checkOut: "2026-11-30", adults: 2 }, /longer than 30 nights/],
    [{ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 5, childrenAges: [4, 6] }, /at most 6 guests/],
    [{ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 0 }, /.*/],
  ])("rejects %j", (input, message) => {
    expect(() => sidecar.parse(input)).toThrowError(message);
  });

  it("refuses a caller-supplied upstream URL", () => {
    expect(() =>
      sidecar.parse({
        checkIn: "2026-09-12",
        checkOut: "2026-09-15",
        adults: 2,
        upstreamUrl: "https://attacker.example/api",
      }),
    ).toThrowError(AlpinaSidecarError);
  });

  it("keeps the endpoint fixed in code", () => {
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ status: "available", available: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    return new AlpinaAvailabilitySidecar({ fetchImpl: fetchImpl as unknown as typeof fetch })
      .check({ checkIn: "2026-09-12", checkOut: "2026-09-15", adults: 2, propertyId: "samspitze-4" })
      .then(() => {
        expect(requested[0]).toMatch(/^https:\/\/alpina\.travel\/api\/booking\/availability\?/);
        expect(requested[0]).toContain("checkIn=2026-09-12");
        expect(requested[0]).toContain("adults=2");
      });
  });
});

describe("resolving the entity a sidecar answer is about", () => {
  const COLLECTED_AT = "2026-08-27T05:00:00.000Z";
  const entity = (overrides: Partial<DomainEntity>): DomainEntity => ({
    id: "https://alpina.travel/#organization",
    types: ["LodgingBusiness"],
    name: "Alpina Travel",
    alternateNames: [],
    sourceUrls: ["https://alpina.travel/"],
    sameAs: [],
    offers: [],
    confidence: 0.9,
    ...overrides,
  });
  const entities = [
    entity({}),
    entity({ id: "https://alpina.travel/#samspitze-4", types: ["Apartment"], name: "Samspitze 4" }),
  ];

  it("matches the property identifier against the entity's identity", () => {
    expect(resolveSidecarEntity(entities, "samspitze-4", COLLECTED_AT)).toEqual({
      id: "https://alpina.travel/#samspitze-4",
      type: "Apartment",
      name: "Samspitze 4",
      sourceUrl: "https://alpina.travel/",
      method: "json-ld",
      collectedAt: COLLECTED_AT,
    });
  });

  it("slug-matches a name when the id carries no hint", () => {
    const renamed = [entity({ id: "urn:entity:2", types: ["WebPage", "Apartment"], name: "Samspitze 4" })];
    expect(resolveSidecarEntity(renamed, "samspitze-4", COLLECTED_AT)?.type).toBe("Apartment");
  });

  it("returns nothing rather than guessing", () => {
    expect(resolveSidecarEntity(entities, "some-other-property", COLLECTED_AT)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { argumentsFrom, fieldsFrom, missingRequired } from "../../src/client/components/capabilityTestForm.js";

describe("the form a tool's schema asks for", () => {
  const schema = {
    type: "object",
    properties: {
      product_id: { type: "string", description: "The product's id" },
      checkIn: { type: "string", format: "date" },
      departure_date: { type: "string" },
      adults: { type: "integer", minimum: 1, maximum: 6, default: 2 },
      currency: { type: "string", enum: ["EUR", "USD"] },
      include_sold_out: { type: "boolean", default: false },
    },
    required: ["product_id", "checkIn"],
  };

  it("types each field by what the schema says, marks the required ones, and keeps the defaults", () => {
    const fields = fieldsFrom(schema);
    expect(fields.map((field) => [field.name, field.kind, field.required])).toEqual([
      ["product_id", "text", true],
      ["checkIn", "date", true],
      ["departure_date", "date", false],
      ["adults", "number", false],
      ["currency", "select", false],
      ["include_sold_out", "boolean", false],
    ]);
    expect(fields[0]!.label).toBe("Product id");
    expect(fields[0]!.description).toBe("The product's id");
    expect(fields[3]).toMatchObject({ defaultValue: 2, minimum: 1, maximum: 6 });
    expect(fields[4]!.options).toEqual(["EUR", "USD"]);
    expect(fieldsFrom(undefined)).toEqual([]);
  });

  it("sends what the person typed as the tool expects it, and leaves blanks out", () => {
    const fields = fieldsFrom(schema);
    expect(argumentsFrom(fields, { product_id: " samspitze-4 ", checkIn: "2026-09-12", departure_date: "", adults: "3", currency: "EUR", include_sold_out: false })).toEqual({
      product_id: "samspitze-4",
      checkIn: "2026-09-12",
      adults: 3,
      currency: "EUR",
    });
  });

  it("names the first required field that is missing", () => {
    const fields = fieldsFrom(schema);
    expect(missingRequired(fields, { product_id: "", checkIn: "2026-09-12" })).toBe("Product id");
    expect(missingRequired(fields, { product_id: "x", checkIn: "" })).toBe("Check in");
    expect(missingRequired(fields, { product_id: "x", checkIn: "2026-09-12" })).toBeNull();
  });
});

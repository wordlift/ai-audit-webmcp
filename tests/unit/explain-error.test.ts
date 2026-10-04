import { describe, expect, it } from "vitest";
import { explainReportError, onlyFoundationMissing } from "../../src/shared/format/explainError.js";

describe("what a stored error means for the reader", () => {
  it("says the foundation audit is missing and why, never the status code or the provider's words", () => {
    const upstream = explainReportError({ code: "audit_upstream_error", message: "The audit service returned status 500.", stage: "audit" } as never);
    expect(upstream).toBe("The WordLift foundation audit did not complete because the service did not answer, so there is no foundation score this time. Run again to try it once more.");
    expect(upstream).not.toMatch(/500|status|upstream/);
    expect(explainReportError({ code: "audit_timeout", message: "Timed out after 30000ms", stage: "audit" } as never)).toContain("because it took too long");
    expect(explainReportError({ code: "audit_rate_limited", message: "429", stage: "audit" } as never)).toContain("because the service was busy");
    expect(explainReportError({ code: "audit_unreachable", message: "ECONNREFUSED", stage: "audit" } as never)).toContain("because the service could not be reached");
  });

  it("keeps the other reasons as they were", () => {
    expect(explainReportError({ code: "collection_timeout", message: "x", stage: "collect" } as never)).toBe("The site took too long to answer, so its pages could not be read.");
  });

  it("tells a report missing only its foundation score from one whose reading of the site went wrong", () => {
    const foundation = { code: "audit_timeout", phase: "understanding" as const, provider: "wordlift-ai-audit", message: "The audit service took too long to respond.", retryable: true };
    expect(onlyFoundationMissing([foundation])).toBe(true);
    expect(onlyFoundationMissing([foundation, { code: "thin_sample", phase: "understanding" as const, message: "Only 2 representative pages could be read.", retryable: true }])).toBe(false);
    expect(onlyFoundationMissing([])).toBe(false);
  });
});

import type { ReportError } from "../types/index.js";

const AUDIT_CODES = new Set([
  "audit_failed",
  "audit_timeout",
  "audit_upstream_error",
  "audit_unreachable",
  "audit_rate_limited",
  "audit_empty_response",
  "audit_invalid_response",
  "audit_unauthorized",
]);

/** What a stored error means for the reader, in one sentence, without the provider's vocabulary. */
export function explainReportError(error: ReportError): string {
  if (AUDIT_CODES.has(error.code)) {
    const reason = error.message.replace(/\.$/, "").replace(/^The audit service/, "the audit service");
    return `The WordLift foundation audit did not complete (${reason}), so there is no foundation score.`;
  }
  switch (error.code) {
    case "collection_timeout":
      return "The site took too long to answer, so its pages could not be read.";
    case "collector_failed":
      return "The site's pages could not be read.";
    case "classifier_unavailable":
      return `Classification fell back to observed behavior: ${error.message}`;
    default:
      return error.message;
  }
}

const COLLECTION_CODES = new Set(["site_blocked", "collection_timeout", "collector_failed", "dns_failure"]);

/**
 * The errors worth a reader's attention. When the site could not be read at all, the classifier's
 * complaint about missing text says nothing the collection error has not already said.
 */
export function visibleErrors(errors: ReportError[]): ReportError[] {
  const collectionFailed = errors.some((error) => COLLECTION_CODES.has(error.code));
  return collectionFailed ? errors.filter((error) => error.code !== "classifier_unavailable") : errors;
}

/** A heading for a report that could not be built, chosen by what actually went wrong. */
export function failureTitle(errors: ReportError[]): string {
  const codes = new Set(errors.map((error) => error.code));
  if (codes.has("site_blocked")) return "This site blocks automated access";
  if (codes.has("collection_timeout")) return "This site took too long to answer";
  if (codes.has("dns_failure")) return "This site could not be reached";
  return "We could not understand this site";
}

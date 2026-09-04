import { UnknownFixtureError } from "../adapters/fixtures/FixtureProvider.js";
import { ReportRequestError } from "../errors.js";
import { UrlPolicyError } from "../security/urlPolicy.js";

/**
 * A tool failure a caller can act on: why it failed, and what to do next. Anything not raised as
 * one of these reaches the transport as a generic failure, so provider internals and audited-site
 * content never travel out in an error message.
 */
export class ToolCallError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ToolCallError";
  }
}

/**
 * The typed failures raised deeper in the audit, said in a tool call's terms. Their messages are
 * this project's own words — a refused destination, an expired report, an unknown fixture — never a
 * provider's, so they can travel to the caller unchanged. Anything else stays generic.
 */
export function asToolError(error: unknown): ToolCallError | null {
  if (error instanceof ToolCallError) return error;
  if (error instanceof UrlPolicyError) return new ToolCallError(error.message, error.code, error.status);
  if (error instanceof ReportRequestError) return new ToolCallError(error.message, error.code, error.status);
  if (error instanceof UnknownFixtureError) return new ToolCallError(error.message, "fixture_not_registered", 400);
  return null;
}

export function reportNotFound(reportId: string): ToolCallError {
  return new ToolCallError(
    `No report ${reportId} exists, or it has expired. Run audit-website to create one.`,
    "report_not_found",
    404,
  );
}

export function reportStillRunning(reportId: string, phase: string): ToolCallError {
  return new ToolCallError(
    `The audit is still running (phase: ${phase}). Call get-audit-report with reportId ${reportId} until it completes.`,
    "report_running",
    409,
  );
}

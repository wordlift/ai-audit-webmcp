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

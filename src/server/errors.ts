/** A failure whose message is safe to show the caller (no provider internals, no target content). */
export class ReportRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 502 | 504 = 400,
    readonly code = "report_request_invalid",
  ) {
    super(message);
    this.name = "ReportRequestError";
  }
}

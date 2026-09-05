import { reportRecordSchema, runningReportResponseSchema } from "../../shared/schemas/report.js";
import type { Archetype, HumanAssertion, ReportRecord, ScanDepth } from "../../shared/types/index.js";

const POLL_INTERVAL_MS = 1_500;
const POLL_TIMEOUT_MS = 180_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function requestJson(input: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const message = typeof record.message === "string" ? record.message : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, typeof record.error === "string" ? record.error : undefined);
  }
  return { status: response.status, body };
}

export interface CreateReportOptions {
  archetype?: Archetype;
  fixtureId?: string;
  /** "deep" reads more of the site and requires an address the report is sent to. */
  depth?: ScanDepth;
  email?: string;
  /** Which surface asked, so the page's form and an agent driving the page stay distinguishable. */
  surface?: "web" | "webmcp";
  requestId?: string;
  signal?: AbortSignal;
  /** Overridable so tests do not wait on real timers. */
  waitMs?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** The POST alone. A refusal — a rate limit, a rejected address, an unsafe URL — surfaces here. */
async function postReport(url: string, requestId: string, options: CreateReportOptions) {
  return requestJson("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requestId,
      url,
      archetypeOverride: options.archetype ?? null,
      fixtureId: options.fixtureId ?? null,
      ...(options.depth ? { depth: options.depth } : {}),
      ...(options.email ? { email: options.email } : {}),
      ...(options.surface ? { surface: options.surface } : {}),
    }),
    signal: options.signal,
  });
}

async function terminalFrom(
  accepted: { status: number; body: unknown },
  options: CreateReportOptions,
): Promise<ReportRecord> {
  if (accepted.status === 202) {
    const running = runningReportResponseSchema.parse(accepted.body);
    return waitForTerminalReport(running.reportId, options);
  }
  const report = reportRecordSchema.parse(accepted.body);
  return report.status === "running" ? waitForTerminalReport(report.id, options) : report;
}

/**
 * Creates a report and resolves only once a terminal revision exists. A 202 means the same
 * requestId is still running, so the caller recovers the stored state by polling rather than
 * reporting "audit started" as a result.
 */
export async function createReport(url: string, options: CreateReportOptions = {}): Promise<ReportRecord> {
  const requestId = options.requestId ?? crypto.randomUUID();
  return terminalFrom(await postReport(url, requestId, options), options);
}

export interface StartedReport {
  /** The report id is the caller's requestId, so the page exists as soon as the record does. */
  reportId: string;
  /**
   * Resolves when the service has accepted the audit, and rejects with its refusal. A caller that
   * only watches `ready` cannot tell "started" from "refused" until a minute later, which is how a
   * rate limit or a rejected address ends up announced as success.
   */
  accepted: Promise<void>;
  ready: Promise<ReportRecord>;
}

/**
 * Starts an audit and returns immediately with the id. `ready` resolves at the terminal report;
 * the caller can navigate to /reports/{reportId} right away and watch the record fill in.
 */
export function startReport(url: string, options: CreateReportOptions = {}): StartedReport {
  const requestId = options.requestId ?? crypto.randomUUID();
  const posted = postReport(url, requestId, options);
  const accepted = posted.then(() => undefined);
  const ready = posted.then((response) => terminalFrom(response, options));
  // Two promises come off one request, and most callers want only one of them. Marking both as
  // observed keeps the one nobody awaited from surfacing as an unhandled rejection; each still
  // rejects for whoever does await it.
  accepted.catch(() => undefined);
  ready.catch(() => undefined);
  return { reportId: requestId, accepted, ready };
}

export async function waitForTerminalReport(reportId: string, options: CreateReportOptions = {}): Promise<ReportRecord> {
  const wait = options.waitMs ?? defaultWait;
  const now = options.now ?? (() => Date.now());
  const deadline = now() + POLL_TIMEOUT_MS;

  for (;;) {
    const report = await getReport(reportId);
    if (report.status !== "running") return report;
    if (now() >= deadline) {
      throw new ApiError("The audit is taking longer than expected. Open the report link to check again.", 504);
    }
    await wait(POLL_INTERVAL_MS);
  }
}

export async function getReport(reportId: string): Promise<ReportRecord> {
  const { body } = await requestJson(`/api/reports/${reportId}`);
  return reportRecordSchema.parse(body);
}

export async function getPinnedAlpinaReport(): Promise<ReportRecord> {
  const { body } = await requestJson("/api/demo/alpina");
  return reportRecordSchema.parse(body);
}

export async function recompileReport(reportId: string, archetype: Archetype): Promise<ReportRecord> {
  const { body } = await requestJson(`/api/reports/${reportId}/recompile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archetype }),
  });
  return reportRecordSchema.parse(body);
}

/** Applies a reviewer's structured judgment as an immutable child revision. */
export async function refineReport(reportId: string, assertions: HumanAssertion): Promise<ReportRecord> {
  const { body } = await requestJson(`/api/reports/${reportId}/refine`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(assertions),
  });
  return reportRecordSchema.parse(body);
}

export interface AlpinaAvailabilityInput {
  reportId?: string;
  propertyId?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  childrenAges?: number[];
  locale?: "en" | "de" | "it";
}

export interface AlpinaAvailabilityResponse {
  source: string;
  propertyId: string;
  available: boolean;
  status: "available" | "unavailable" | "unknown";
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  childrenAges: number[];
  totalGuests: number;
  quote?: { total: number; currency: string; instantConfirmation?: boolean; cancellationSummary?: string; taxes?: string[] };
  checkoutUrl?: string;
  checkedAt: string;
  expiresAt?: string;
  requiresRevalidation: boolean;
  readOnly: true;
  notice: string;
  entity?: { id: string; type: string; name: string; sourceUrl: string; method: string; collectedAt: string };
  updatedReportId?: string;
  updatedReportUrl?: string;
  reportUpdateError?: string;
}

/** Read-only availability lookup through the approved server-side sidecar. */
export async function checkAlpinaAvailability(input: AlpinaAvailabilityInput): Promise<AlpinaAvailabilityResponse> {
  const { body } = await requestJson("/api/sidecars/alpina/availability", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return body as AlpinaAvailabilityResponse;
}

export function contractPath(reportId: string, actionId: string): string {
  return `/api/reports/${reportId}/contracts/${encodeURIComponent(actionId)}`;
}

export function absoluteUrl(path: string): string {
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

export function reportPageUrl(reportId: string): string {
  return absoluteUrl(`/reports/${reportId}`);
}

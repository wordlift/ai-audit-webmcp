import { reportRecordSchema } from "../../shared/schemas/report.js";
import type { Archetype, ReportRecord } from "../../shared/types/index.js";

async function requestJson(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  const response = await fetch(input, init);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "message" in body ? String(body.message) : `Request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export async function createReport(url: string): Promise<ReportRecord> {
  return reportRecordSchema.parse(await requestJson("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), url }),
  }));
}

export async function getReport(reportId: string): Promise<ReportRecord> {
  return reportRecordSchema.parse(await requestJson(`/api/reports/${reportId}`));
}

export async function recompileReport(reportId: string, archetype: Archetype): Promise<ReportRecord> {
  return reportRecordSchema.parse(await requestJson(`/api/reports/${reportId}/recompile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ archetype }),
  }));
}

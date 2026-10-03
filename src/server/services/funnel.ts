import type { PageEvent, ServerEvent } from "../../shared/format/funnel.js";

/**
 * One structured line per funnel step, for log-based metrics: Cloud Logging counts `funnel` lines
 * by name without anything else to run. The report id is public; nothing about a person is logged.
 */
export function funnel(name: PageEvent | ServerEvent, reportId: string, detail?: Record<string, string>): void {
  if (process.env.NODE_ENV === "test") return;
  console.log(JSON.stringify({ severity: "INFO", event: "funnel", name, reportId, ...detail }));
}

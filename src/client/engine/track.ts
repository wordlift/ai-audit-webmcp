import type { PageEvent } from "../../shared/format/funnel.js";

/** Reports a funnel step the page alone sees. Fire and forget: it survives the page being left, and never fails anything. */
export function track(reportId: string, name: PageEvent): void {
  if (typeof fetch !== "function" || !/^[0-9a-f-]{36}$/i.test(reportId)) return;
  try {
    void fetch(`/api/reports/${reportId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Counting is never worth an error.
  }
}

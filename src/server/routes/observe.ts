import { Router } from "express";
import type { LeadStore } from "../adapters/leads/index.js";
import { unsubscribeKey } from "../services/Observer.js";

/**
 * The one link in every note that stops them. It stops the re-reads too, and leaves the report
 * exactly where it is. The key is bound to the address, so the report's public link alone cannot
 * silence the person who asked for the notes.
 */
export function createObserveRouter(leads: LeadStore, now: () => Date = () => new Date()): Router {
  const router = Router();

  router.get("/unsubscribe/:reportId/:key", async (request, response) => {
    const reportId = String(request.params.reportId ?? "");
    const key = String(request.params.key ?? "");
    const lead = /^[0-9a-f-]{36}$/i.test(reportId) ? await leads.get(reportId).catch(() => null) : null;
    if (!lead || key !== unsubscribeKey(lead)) {
      response.status(404).type("text/plain; charset=utf-8").send("This link does not match an address we hold. Nothing was changed.");
      return;
    }
    if (!lead.unsubscribedAt) await leads.markUnsubscribed(reportId, now().toISOString());
    response
      .status(200)
      .type("text/plain; charset=utf-8")
      .send("Done. You will not hear from us about this site again, and it will not be read again on your behalf. The report stays at its link.");
  });

  return router;
}

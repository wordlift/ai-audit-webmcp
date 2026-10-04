import { Router } from "express";
import type { LeadStore } from "../adapters/leads/index.js";
import { unsubscribeKey, type Observer } from "../services/Observer.js";

/**
 * Two doors for Observe. The one link in every note that stops them: it stops the re-reads too,
 * and leaves the report exactly where it is; the key is bound to the address, so the report's
 * public link alone cannot silence the person who asked for the notes. And the tick a scheduler
 * calls once a day, behind a token, so the weekly re-read happens whether or not an instance was
 * awake to remember it.
 */
export function createObserveRouter(leads: LeadStore, now: () => Date = () => new Date(), observer: Observer | null = null): Router {
  const router = Router();

  router.post("/tick", async (request, response) => {
    if (!observer) {
      response.status(404).json({ error: "observe_not_configured", message: "Observe is not configured here." });
      return;
    }
    if (!observer.mayTick(request.get("x-observe-token"))) {
      response.status(401).json({ error: "observe_tick_refused", message: "The tick needs the token the scheduler holds." });
      return;
    }
    const outcomes = await observer.tick();
    response.json({ at: now().toISOString(), ran: outcomes.length, outcomes, ...observer.summary() });
  });

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

/**
 * The funnel the brief measures, one name per step, shared by the page and the server so a name
 * cannot drift between the two. The page reports what only it sees (a prompt copied, a door
 * opened); the server logs what it does (an audit finished, a review filed, an engine claimed).
 * Counts and names only: nobody is identified by any of it.
 */
export const PAGE_EVENTS = [
  "engine_explored",
  "review_prompt_copied",
  "ask_prompt_copied",
  "capability_opened",
  "ownership_started",
  "door_claim-context",
  "door_build-context",
  "door_monitor",
  "door_activate",
  "door_agent-ready",
  "door_keep",
] as const;

export const SERVER_EVENTS = ["audit_completed", "review_filed", "review_carried", "engine_claimed", "owner_verified"] as const;

export type PageEvent = (typeof PAGE_EVENTS)[number];
export type ServerEvent = (typeof SERVER_EVENTS)[number];

export function isPageEvent(name: unknown): name is PageEvent {
  return typeof name === "string" && (PAGE_EVENTS as readonly string[]).includes(name);
}

/** The dashboard intent a door event stands for, or null. */
export function doorIntent(name: PageEvent): string | null {
  return name.startsWith("door_") ? name.slice("door_".length) : null;
}

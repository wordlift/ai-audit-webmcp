/**
 * Where a person goes next, once they have seen what agents can and cannot do on their site.
 *
 * One door, the same on every surface: a conversation. The dashboard is for someone who already
 * runs WordLift; the person who just ran a free audit wants to talk, and that is where the lead
 * lands (the fourth brief, 2026-10-08).
 */
export const TALK_TO_US_URL = "https://wordlift.io/book-a-demo/";

/** The door with the report and, when one is named, the action that led there. */
export function talkToUsUrl(reportId?: string, action?: string): string {
  const url = new URL(TALK_TO_US_URL);
  url.searchParams.set("source", "ai-audit");
  if (reportId) url.searchParams.set("report", reportId);
  if (action) url.searchParams.set("action", action);
  return url.toString();
}

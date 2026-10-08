/**
 * Where this browser keeps its claim on a site's Context Engine. The key is handed out once, when
 * the engine is claimed, and lives in this browser only; a review run in another browser (ChatGPT's)
 * arrives with a day-long review token in the report link's fragment instead, which no server sees
 * and which is taken off the address at once so it is never shared with the page's link.
 */
const KEY_PREFIX = "wl-engine-key:";
const REVIEW_TOKEN = "wl-engine-review";
export const REVIEW_PARAM = "review";

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** The site a report's engine belongs to: the one that was asked for, as the server keys it. */
export function engineHostFor(report: { requestedUrl: string }): string {
  return hostOf(report.requestedUrl);
}

export function saveEngineKey(host: string, key: string): void {
  try {
    storage("local")?.setItem(`${KEY_PREFIX}${host}`, key);
  } catch {
    // A browser that keeps nothing still claimed the engine; it just cannot act as the holder later.
  }
}

/** The key this browser holds for a site, or the review token it arrived with. */
export function engineKeyFor(host: string): string | null {
  try {
    return storage("local")?.getItem(`${KEY_PREFIX}${host}`) ?? storage("session")?.getItem(REVIEW_TOKEN) ?? null;
  } catch {
    return null;
  }
}

/** Takes a review token off the address and keeps it for this tab. */
export function captureReviewToken(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const token = fragment.get(REVIEW_PARAM);
  if (!token) return;
  try {
    storage("session")?.setItem(REVIEW_TOKEN, token.slice(0, 200));
  } catch {
    // Nothing kept: the review files on the report, not on the engine.
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

/**
 * The key a review is filed under, claiming the site's Context Engine for this browser first when
 * nobody holds it yet. A correction is the moment someone shows they care about the model; before
 * 2026-10-08 the claim rode on an email address, which is now asked while the audit runs and may be
 * skipped. A browser that already holds the engine keeps its key; a pending key never replaces one
 * it holds; a server without engines answers with nothing and the review is filed unkept.
 */
export async function keyForReview(
  report: { id: string; requestedUrl: string },
  claim: (reportId: string) => Promise<{ engine: { host: string }; key: string; standing: string }>,
): Promise<string | null> {
  const host = engineHostFor(report);
  const held = engineKeyFor(host);
  if (held) return held;
  try {
    const result = await claim(report.id);
    if (result.standing === "holder" || !engineKeyFor(result.engine.host)) saveEngineKey(result.engine.host, result.key);
    return result.key;
  } catch {
    return null;
  }
}

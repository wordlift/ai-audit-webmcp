/**
 * Where this browser keeps its claim on a site's Context Engine. The key is handed out once, when
 * the engine is claimed, and lives in this browser only; a review run in another browser (ChatGPT's)
 * arrives with a day-long review token in the report link instead, which is taken off the address
 * at once so it is never shared with the page's link.
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
  const token = url.searchParams.get(REVIEW_PARAM);
  if (!token) return;
  try {
    storage("session")?.setItem(REVIEW_TOKEN, token.slice(0, 200));
  } catch {
    // Nothing kept: the review files on the report, not on the engine.
  }
  url.searchParams.delete(REVIEW_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

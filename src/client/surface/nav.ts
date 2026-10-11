import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

/**
 * One report, three intentions, and the precise layer beside them. The mode rides on the anchors
 * the report always had (#step-fix, #own-it, #full-audit), so every link written before still lands
 * where it meant to; what is selected rides in the query, so it survives opening and closing detail
 * and travels to the reviewed version a save returns.
 */
export type ReportMode = "audit" | "fix" | "evidence";

export const MODE_HASH: Record<ReportMode, string> = { audit: "", fix: "#step-fix", evidence: "#full-audit" };

const FIX_ANCHORS = new Set(["#step-fix", "#fix", "#own-it", "#understand", "#ownership"]);

export function modeFromHash(hash: string): ReportMode {
  if (FIX_ANCHORS.has(hash)) return "fix";
  if (hash === "#full-audit" || hash === "#evidence" || hash.startsWith("#audit-")) return "evidence";
  return "audit";
}

export type FixTab = "model" | "capabilities" | "vocabulary";

export function fixTab(value: string | null, hash = ""): FixTab {
  if (value === "model" || value === "vocabulary" || value === "capabilities") return value;
  // The anchors that used to sit beside the model keep leading to it.
  return hash === "#understand" || hash === "#ownership" ? "model" : "capabilities";
}

/** What the report keeps in the address: the view, the filter and what is selected. */
export const KEPT_PARAMS = ["view", "filter", "action", "inspect", "others"] as const;

/** The same selection on another report: where a save or a new version lands. */
export function reportHref(reportId: string, mode: ReportMode, search: URLSearchParams | string = ""): string {
  const current = typeof search === "string" ? new URLSearchParams(search) : search;
  const kept = new URLSearchParams();
  for (const name of KEPT_PARAMS) {
    const value = current.get(name);
    if (value) kept.set(name, value);
  }
  const query = kept.toString();
  return `/reports/${reportId}${query ? `?${query}` : ""}${MODE_HASH[mode]}`;
}

export function useReportNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = modeFromHash(location.hash);

  /** Change what is selected without leaving the view; null clears a value. */
  const select = useCallback(
    (changes: Record<string, string | null>, nextMode?: ReportMode) => {
      const next = new URLSearchParams(location.search);
      for (const [name, value] of Object.entries(changes)) {
        if (value === null) next.delete(name);
        else next.set(name, value);
      }
      const query = next.toString();
      const hash = nextMode ? MODE_HASH[nextMode] : location.hash;
      navigate({ pathname: location.pathname, search: query ? `?${query}` : "", hash }, { replace: !nextMode, preventScrollReset: true });
    },
    [location.pathname, location.search, location.hash, navigate],
  );

  return { mode, params, select, hash: location.hash, search: location.search };
}

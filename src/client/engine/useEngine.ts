import { useCallback, useEffect, useState } from "react";
import type { ReportRecord } from "../../shared/types/index.js";
import { getEngine, type EngineWithStanding } from "../api/client";
import { engineHostFor, engineKeyFor } from "./engineKeys";

const CHANGED = "wl-engine-changed";

/** Tells every part of the page reading the engine that it moved: a claim, a verification, a review. */
export function announceEngineChange(): void {
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * The site's Context Engine for a report, read again whenever the person comes back to the tab (a
 * review in ChatGPT may have changed it meanwhile) and whenever this page changes it. A site with
 * no engine, or a server without engines, reads as null and nothing is shown.
 */
export function useEngine(report: ReportRecord): { engine: EngineWithStanding | null; host: string; key: string | null; refresh: () => void } {
  const host = engineHostFor(report);
  const [engine, setEngine] = useState<EngineWithStanding | null>(null);
  const [key, setKey] = useState<string | null>(() => engineKeyFor(host));

  const refresh = useCallback(() => {
    const current = engineKeyFor(host);
    setKey(current);
    getEngine(report.id, current)
      .then(setEngine)
      .catch(() => setEngine(null));
  }, [report.id, host]);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(CHANGED, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(CHANGED, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { engine, host, key, refresh };
}

import { createContext, useContext, type ReactNode } from "react";
import type { ReportRecord } from "../../shared/types/index.js";
import type { EngineWithStanding } from "../api/client";
import { useEngine } from "./useEngine";

interface EngineState {
  engine: EngineWithStanding | null;
  host: string;
  key: string | null;
}

const EngineContext = createContext<EngineState | null>(null);

/** One read of the site's Context Engine for a whole page, shared by everything on it. */
export function EngineProvider({ report, children }: { report: ReportRecord; children: ReactNode }) {
  const { engine, host, key } = useEngine(report);
  return <EngineContext.Provider value={{ engine, host, key }}>{children}</EngineContext.Provider>;
}

/** The page's engine, or nothing when the component is rendered outside a report page. */
export function useReportEngine(): EngineState {
  return useContext(EngineContext) ?? { engine: null, host: "", key: null };
}

/** Whether this browser holds the engine, as its reviewer or its owner. */
export function holds(engine: EngineWithStanding | null): boolean {
  return engine?.standing === "reviewer" || engine?.standing === "owner";
}

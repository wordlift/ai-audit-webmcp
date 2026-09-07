/**
 * The ledger: who read a report, by class and by day, and which agents activated a capability on
 * a site. Counts only. No address, no user agent, no path beyond the report id is ever stored,
 * and every row expires with the report it counts for.
 */
export type VisitCounts = Record<string, number>;

export interface DayVisits {
  reportId: string;
  day: string;
  counts: VisitCounts;
  expiresAt: string;
}

export interface ActivationCount {
  day: string;
  tool: string;
  surface: string;
  outcome: string;
  count: number;
}

export interface VisitStore {
  /** Adds to a report's counts for one day; a row that does not exist yet is created. */
  addVisits(reportId: string, day: string, counts: VisitCounts, expiresAt: string): Promise<void>;
  visits(reportId: string): Promise<DayVisits[]>;
  /** Adds to a site's activation counts for one day; keyed by domain because a sidecar serves the site across reports. */
  addActivations(site: string, day: string, counts: Record<string, number>, expiresAt: string): Promise<void>;
  activations(site: string): Promise<ActivationCount[]>;
}

/** `tool|surface|outcome`: one flat key per activation kind, so a store can increment it in place. */
export function activationKey(tool: string, surface: string, outcome: string): string {
  return [tool, surface, outcome].map((part) => part.replace(/[|.]/g, "-")).join("|");
}

export function parseActivationKey(key: string): Pick<ActivationCount, "tool" | "surface" | "outcome"> | null {
  const [tool, surface, outcome] = key.split("|");
  return tool && surface && outcome ? { tool, surface, outcome } : null;
}

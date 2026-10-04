import type { ContextEngine } from "../../../shared/schemas/contextEngine.js";

/**
 * One engine per host, kept apart from reports: a report expires, the engine is what stays. Nothing
 * that serves a public report reads the secrets here; the routes hand out a view without them.
 */
export interface ContextEngineStore {
  get(host: string): Promise<ContextEngine | null>;
  /**
   * Reads, changes and writes one engine as a single step, so two writers never lose each other's
   * change: a claim racing a review, a door opened while a verification lands. The change is a plain
   * function of what is stored now; returning null leaves the record as it is.
   */
  update(host: string, change: (current: ContextEngine | null) => ContextEngine | null): Promise<ContextEngine | null>;
}

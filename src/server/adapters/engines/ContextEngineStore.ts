import type { ContextEngine } from "../../../shared/schemas/contextEngine.js";

/**
 * One engine per host, kept apart from reports: a report expires, the engine is what stays. Nothing
 * that serves a public report reads the secrets here; the routes hand out a view without them.
 */
export interface ContextEngineStore {
  get(host: string): Promise<ContextEngine | null>;
  put(engine: ContextEngine): Promise<ContextEngine>;
}

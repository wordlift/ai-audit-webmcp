import { contextEngineSchema, type ContextEngine } from "../../../shared/schemas/contextEngine.js";
import type { ContextEngineStore } from "./ContextEngineStore.js";

export class MemoryContextEngineStore implements ContextEngineStore {
  readonly #engines = new Map<string, ContextEngine>();

  async get(host: string): Promise<ContextEngine | null> {
    const engine = this.#engines.get(host);
    return engine ? structuredClone(engine) : null;
  }

  // Synchronous from read to write: nothing else runs in between on one event loop.
  async update(host: string, change: (current: ContextEngine | null) => ContextEngine | null): Promise<ContextEngine | null> {
    const current = this.#engines.get(host);
    const next = change(current ? structuredClone(current) : null);
    if (!next) return current ? structuredClone(current) : null;
    const engine = contextEngineSchema.parse(next);
    this.#engines.set(host, structuredClone(engine));
    return engine;
  }
}

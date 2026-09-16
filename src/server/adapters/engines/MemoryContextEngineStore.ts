import { contextEngineSchema, type ContextEngine } from "../../../shared/schemas/contextEngine.js";
import type { ContextEngineStore } from "./ContextEngineStore.js";

export class MemoryContextEngineStore implements ContextEngineStore {
  readonly #engines = new Map<string, ContextEngine>();

  async get(host: string): Promise<ContextEngine | null> {
    const engine = this.#engines.get(host);
    return engine ? structuredClone(engine) : null;
  }

  async put(input: ContextEngine): Promise<ContextEngine> {
    const engine = contextEngineSchema.parse(input);
    this.#engines.set(engine.host, structuredClone(engine));
    return engine;
  }
}

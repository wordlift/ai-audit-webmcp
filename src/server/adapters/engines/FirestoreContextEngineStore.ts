import { Firestore } from "@google-cloud/firestore";
import { contextEngineSchema, type ContextEngine } from "../../../shared/schemas/contextEngine.js";
import type { ContextEngineStore } from "./ContextEngineStore.js";

/** One document per host in `contextEngines`. No TTL: an engine outlives the reports it remembers. */
export class FirestoreContextEngineStore implements ContextEngineStore {
  constructor(private readonly firestore: Firestore, private readonly prefix = "") {}

  static fromProject(projectId?: string, prefix = "") {
    return new FirestoreContextEngineStore(new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }), prefix);
  }

  private get collection() {
    return this.firestore.collection(`${this.prefix}contextEngines`);
  }

  async get(host: string): Promise<ContextEngine | null> {
    const snapshot = await this.collection.doc(host).get();
    if (!snapshot.exists) return null;
    const parsed = contextEngineSchema.safeParse(snapshot.data());
    return parsed.success ? parsed.data : null;
  }

  async put(input: ContextEngine): Promise<ContextEngine> {
    const engine = contextEngineSchema.parse(input);
    await this.collection.doc(engine.host).set(engine);
    return engine;
  }
}

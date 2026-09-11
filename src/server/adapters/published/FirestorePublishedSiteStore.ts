import { Firestore } from "@google-cloud/firestore";
import type { PublishedSite, PublishedSiteStore } from "./PublishedSiteStore.js";

/**
 * One document per host in `publishedSites`. `expiresAt` carries the same TTL policy the reports
 * collection uses, created once, see OPERATIONS.md; a site that keeps publishing is refreshed by
 * every audit that sees it, so only a site nobody audits for a month falls out.
 */
export class FirestorePublishedSiteStore implements PublishedSiteStore {
  constructor(private readonly firestore: Firestore, private readonly now = () => new Date(), private readonly prefix = "") {}

  static fromProject(projectId?: string, prefix = "") {
    return new FirestorePublishedSiteStore(new Firestore({ ignoreUndefinedProperties: true, ...(projectId ? { projectId } : {}) }), undefined, prefix);
  }

  private get collection() {
    return this.firestore.collection(`${this.prefix}publishedSites`);
  }

  async put(site: PublishedSite): Promise<void> {
    await this.collection.doc(site.host).set(site);
  }

  async remove(host: string): Promise<void> {
    await this.collection.doc(host).delete();
  }

  async get(host: string): Promise<PublishedSite | null> {
    const snapshot = await this.collection.doc(host).get();
    if (!snapshot.exists) return null;
    const site = snapshot.data() as PublishedSite;
    return new Date(site.expiresAt) > this.now() ? site : null;
  }

  async list(limit = 500): Promise<PublishedSite[]> {
    const snapshot = await this.collection.orderBy("seenAt", "desc").limit(limit).get();
    const now = this.now();
    return snapshot.docs.map((document) => document.data() as PublishedSite).filter((site) => new Date(site.expiresAt) > now);
  }
}

import type { PublishedSite, PublishedSiteStore } from "./PublishedSiteStore.js";

export class MemoryPublishedSiteStore implements PublishedSiteStore {
  readonly #sites = new Map<string, PublishedSite>();

  constructor(private readonly now = () => new Date()) {}

  async put(site: PublishedSite): Promise<void> {
    this.#sites.set(site.host, structuredClone(site));
  }

  async remove(host: string): Promise<void> {
    this.#sites.delete(host);
  }

  async get(host: string): Promise<PublishedSite | null> {
    const site = this.#sites.get(host);
    return site && new Date(site.expiresAt) > this.now() ? structuredClone(site) : null;
  }

  async list(limit = 500): Promise<PublishedSite[]> {
    const now = this.now();
    return [...this.#sites.values()]
      .filter((site) => new Date(site.expiresAt) > now)
      .sort((left, right) => right.seenAt.localeCompare(left.seenAt))
      .slice(0, limit)
      .map((site) => structuredClone(site));
  }
}

import type { CatalogEntry } from "../scrape/agentCatalog.js";

/**
 * The sites that publish through us, as observed from outside: the newest audit of a site found,
 * on the site's own domain, a catalog carrying the Terms of Action this service writes. One row
 * per host, refreshed by every audit that still sees it, removed by the first that does not, so
 * the feed never points a registry at a catalog that is gone. The WordLift platform may write the
 * same rows for the sites its plugin keeps current; this is the shape both sides fill.
 */
export interface PublishedSite {
  host: string;
  /** The catalog on the site's own domain, and its entries as last read. */
  catalogUrl: string;
  entries: CatalogEntry[];
  /** The audit that last saw it. */
  reportId: string;
  seenAt: string;
  expiresAt: string;
}

export interface PublishedSiteStore {
  /** Records or refreshes a site; the row is keyed by host, so a re-read replaces the last one. */
  put(site: PublishedSite): Promise<void>;
  /** Forgets a site whose catalog no longer carries our Terms of Action. */
  remove(host: string): Promise<void>;
  get(host: string): Promise<PublishedSite | null>;
  /** The sites still published, most recently seen first, bounded. */
  list(limit?: number): Promise<PublishedSite[]>;
}

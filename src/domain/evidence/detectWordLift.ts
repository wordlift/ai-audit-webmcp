import type { DomainEntity } from "../../shared/types/index.js";

const DATASET_PREFIX = "https://data.wordlift.io/";

export interface PublishingPlatform {
  name: "WordLift";
  evidence: string;
  sourceUrl: string;
}

/** A raw-page marker the collector found: the plugin path, the SDK host, or a dataset reference. */
export interface WordLiftMarker {
  marker: string;
  sourceUrl: string;
}

/**
 * Detects that the audited site publishes its structured data with WordLift — from the site's own
 * output, never guessed. Three installations exist in the wild and each leaves its own mark:
 * entity ids on the shared data.wordlift.io dataset; a server-side install publishing the dataset
 * on the client's own `data.` subdomain (data.brand.example/…); or the browser SDK and
 * WordPress plugin, which the collector fingerprints on the page. Returns undefined when the site
 * shows none of them.
 */
export function detectWordLift(
  entities: DomainEntity[],
  marker?: WordLiftMarker,
  siteUrl?: string,
): PublishingPlatform | undefined {
  const shared = entities.find(
    (entity) => entity.id.startsWith(DATASET_PREFIX) || entity.sameAs.some((link) => link.startsWith(DATASET_PREFIX)),
  );
  if (shared) {
    return {
      name: "WordLift",
      evidence: `Entity ids are published on data.wordlift.io (${shared.name})`,
      sourceUrl: shared.sourceUrls[0],
    };
  }

  // A collector marker may be a confirmed one (the dataset portal answered as WordLift), so it
  // outranks the pattern inference below.
  if (marker) return { name: "WordLift", evidence: marker.marker, sourceUrl: marker.sourceUrl };

  const served = siteUrl ? wordLiftDatasetEntity(entities, siteUrl) : undefined;
  if (served) {
    return {
      name: "WordLift",
      evidence: `Entity ids are published on the site's own dataset subdomain, ${new URL(served.id).hostname} (${served.name}) — WordLift's server-side pattern`,
      sourceUrl: served.sourceUrls[0],
    };
  }

  return undefined;
}

/**
 * The entity, if any, whose id lives on the site's own `data.` subdomain — the shape a WordLift
 * server-side install publishes (data.brand.example/…). The collector uses this to pick
 * the one id worth confirming against the dataset portal.
 */
export function wordLiftDatasetEntity<T extends { id: string; sameAs: string[] }>(
  entities: T[],
  siteUrl: string,
): T | undefined {
  const dataset = datasetSubdomainPrefix(siteUrl);
  if (!dataset) return undefined;
  return entities.find(
    (entity) => entity.id.startsWith(dataset) || entity.sameAs.some((link) => link.startsWith(dataset)),
  );
}

/** The `data.` twin of the audited host: data.{registrable domain}, with the www stripped. */
function datasetSubdomainPrefix(siteUrl: string): string | null {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./, "");
    if (!host || host.startsWith("data.")) return null;
    return `https://data.${host}/`;
  } catch {
    return null;
  }
}

const PAGE_MARKERS: Array<{ pattern: RegExp; marker: string }> = [
  { pattern: /data\.wordlift\.io\//i, marker: "The page's JSON-LD references the data.wordlift.io dataset" },
  { pattern: /wordlift\.io\/data\//i, marker: "The page names its WordLift dataset URI" },
  { pattern: /\/wp-content\/plugins\/wordlift/i, marker: "The WordLift WordPress plugin is installed" },
  { pattern: /(cdn|cloud)\.wordlift\.io/i, marker: "The page loads the WordLift SDK" },
];

/** Scans a raw page body for WordLift's own fingerprints. Returns the first marker, or null. */
export function detectWordLiftMarker(body: string): string | null {
  for (const { pattern, marker } of PAGE_MARKERS) {
    if (pattern.test(body)) return marker;
  }
  return null;
}

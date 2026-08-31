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
 * output, never guessed: entity ids or sameAs links on the data.wordlift.io dataset, or a page
 * marker (WordPress plugin path, SDK host) the collector saw. Returns undefined when the site
 * names no platform.
 */
export function detectWordLift(entities: DomainEntity[], marker?: WordLiftMarker): PublishingPlatform | undefined {
  const published = entities.find(
    (entity) => entity.id.startsWith(DATASET_PREFIX) || entity.sameAs.some((link) => link.startsWith(DATASET_PREFIX)),
  );
  if (published) {
    return {
      name: "WordLift",
      evidence: `Entity ids are published on data.wordlift.io (${published.name})`,
      sourceUrl: published.sourceUrls[0],
    };
  }
  if (marker) return { name: "WordLift", evidence: marker.marker, sourceUrl: marker.sourceUrl };
  return undefined;
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

import type { Firestore } from "@google-cloud/firestore";
import { describe, expect, it } from "vitest";
import { FirestoreClaimStore } from "../../src/server/adapters/claims/FirestoreClaimStore.js";
import { FirestoreLeadStore } from "../../src/server/adapters/leads/FirestoreLeadStore.js";
import { FirestorePublishedSiteStore } from "../../src/server/adapters/published/FirestorePublishedSiteStore.js";
import { FirestoreReportStore } from "../../src/server/adapters/store/FirestoreReportStore.js";
import { FirestoreVisitStore } from "../../src/server/adapters/visits/FirestoreVisitStore.js";

/** A Firestore that remembers every collection name it was asked for and answers empty to everything. */
function firestore(seen: string[]): Firestore {
  const empty = { exists: false, data: () => undefined, docs: [] as unknown[] };
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    get: async () => empty,
    doc: () => ({ get: async () => empty, set: async () => undefined, create: async () => undefined, update: async () => undefined, delete: async () => undefined }),
  });
  return { collection: (name: string) => { seen.push(name); return chain; } } as unknown as Firestore;
}

describe("a preview keeps its own Firestore collections", () => {
  it("puts the prefix in front of every collection name, on every store", async () => {
    const seen: string[] = [];
    const db = firestore(seen);
    await new FirestoreReportStore(db, 900_000, () => new Date(), "preview_").get("r1");
    await new FirestoreReportStore(db, 900_000, () => new Date(), "preview_").findRecent("https://alpina.travel/", new Date(0));
    await new FirestoreVisitStore(db, () => new Date(), "preview_").visits("r1");
    await new FirestoreVisitStore(db, () => new Date(), "preview_").activations("alpina.travel");
    await new FirestoreLeadStore(db, () => new Date(), "preview_").get("r1");
    await new FirestoreClaimStore(db, () => new Date(), "preview_").get("r1");
    await new FirestorePublishedSiteStore(db, () => new Date(), "preview_").get("alpina.travel");
    expect([...new Set(seen)].sort()).toEqual(["preview_activations", "preview_deepScanLeads", "preview_publishedSites", "preview_reportClaims", "preview_reports", "preview_visits"]);
  });

  it("names the production collections as before when no prefix is given", async () => {
    const seen: string[] = [];
    const db = firestore(seen);
    await new FirestoreReportStore(db).get("r1");
    await new FirestoreVisitStore(db).visits("r1");
    await new FirestoreLeadStore(db).get("r1");
    await new FirestoreClaimStore(db).get("r1");
    await new FirestorePublishedSiteStore(db).get("alpina.travel");
    expect([...new Set(seen)].sort()).toEqual(["deepScanLeads", "publishedSites", "reportClaims", "reports", "visits"]);
  });
});

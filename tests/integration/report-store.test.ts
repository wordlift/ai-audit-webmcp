import { randomUUID } from "node:crypto";
import type { Firestore } from "@google-cloud/firestore";
import { FirestoreReportStore } from "../../src/server/adapters/store/FirestoreReportStore.js";
import { MemoryReportStore } from "../../src/server/adapters/store/MemoryReportStore.js";
import type { ReportRecord } from "../../src/shared/types/index.js";

const currentTime = new Date("2026-08-27T05:00:00.000Z");

function report(overrides: Partial<ReportRecord> = {}): ReportRecord {
  return {
    id: randomUUID(),
    status: "completed",
    phase: "complete",
    mode: "demo",
    requestedUrl: "https://example.com/",
    createdAt: currentTime.toISOString(),
    completedAt: currentTime.toISOString(),
    expiresAt: "2026-09-27T05:00:00.000Z",
    actionModelVersion: "0.1.0",
    errors: [],
    evidenceTruncated: false,
    ...overrides,
  };
}

describe("MemoryReportStore", () => {
  it("stores defensive copies and never overwrites an immutable report", async () => {
    const store = new MemoryReportStore(900_000, () => currentTime);
    const original = report();
    await store.put(original);

    const loaded = await store.get(original.id);
    expect(loaded).toEqual(original);
    if (loaded) loaded.errors.push({ code: "mutation", phase: "complete", message: "No", retryable: false });
    expect((await store.get(original.id))?.errors).toEqual([]);
    await expect(store.put(original)).rejects.toThrow(/already exists/);
  });

  it("creates a child revision without modifying its parent", async () => {
    const store = new MemoryReportStore(900_000, () => currentTime);
    const parent = report();
    const child = report({ parentReportId: parent.id, requestedUrl: parent.requestedUrl });
    await store.put(parent);
    await store.createRevision(parent.id, child);

    expect(await store.get(parent.id)).toEqual(parent);
    expect((await store.get(child.id))?.parentReportId).toBe(parent.id);
  });

  it("finalizes a running record exactly once", async () => {
    const store = new MemoryReportStore(900_000, () => currentTime);
    const running = report({ status: "running", phase: "understanding", completedAt: undefined });
    const completed = { ...running, status: "completed" as const, phase: "complete" as const, completedAt: currentTime.toISOString() };
    await store.put(running);
    await expect(store.finalize(completed)).resolves.toEqual(completed);
    await expect(store.finalize(completed)).rejects.toThrow(/not an active running report/);
  });

  it("hides expired reports and rejects an orphan revision", async () => {
    const store = new MemoryReportStore(900_000, () => currentTime);
    const expired = report({ expiresAt: "2026-08-26T05:00:00.000Z" });
    await store.put(expired);
    expect(await store.get(expired.id)).toBeNull();

    const child = report({ parentReportId: randomUUID() });
    await expect(store.createRevision(child.parentReportId as string, child)).rejects.toThrow(/not found or has expired/);
  });
});

describe("FirestoreReportStore contract", () => {
  it("uses create-only writes and a transaction for immutable child revisions", async () => {
    const records = new Map<string, ReportRecord>();
    const document = (id: string) => ({
      create: vi.fn(async (value: ReportRecord) => {
        if (records.has(id)) throw new Error("already exists");
        records.set(id, structuredClone(value));
      }),
      get: vi.fn(async () => ({ exists: records.has(id), data: () => records.get(id) })),
    });
    const collection = { doc: vi.fn((id: string) => document(id)) };
    const transaction = {
      get: vi.fn(async (reference: ReturnType<typeof document>) => reference.get()),
      create: vi.fn((reference: ReturnType<typeof document>, value: ReportRecord) => reference.create(value)),
      set: vi.fn((reference: ReturnType<typeof document>, value: ReportRecord) => {
        records.set(value.id, structuredClone(value));
        return reference;
      }),
    };
    const firestore = {
      collection: vi.fn(() => collection),
      runTransaction: vi.fn(async (callback: (value: typeof transaction) => Promise<void>) => callback(transaction)),
    } as unknown as Firestore;
    const store = new FirestoreReportStore(firestore, 900_000, () => currentTime);
    const parent = report();
    const child = report({ parentReportId: parent.id });

    await store.put(parent);
    await store.createRevision(parent.id, child);

    expect(firestore.runTransaction).toHaveBeenCalledOnce();
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(await store.get(parent.id)).toEqual(parent);
    expect(await store.get(child.id)).toEqual(child);
  });
});

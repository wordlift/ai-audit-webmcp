import { parseActivationKey, type ActivationCount, type DayVisits, type VisitCounts, type VisitStore } from "./VisitStore.js";

export class MemoryVisitStore implements VisitStore {
  readonly #visits = new Map<string, DayVisits>();
  readonly #activations = new Map<string, { site: string; day: string; counts: Record<string, number>; expiresAt: string }>();

  constructor(private readonly now = () => new Date()) {}

  async addVisits(reportId: string, day: string, counts: VisitCounts, expiresAt: string): Promise<void> {
    const key = `${reportId}_${day}`;
    const row = this.#visits.get(key) ?? { reportId, day, counts: {}, expiresAt };
    for (const [cls, count] of Object.entries(counts)) row.counts[cls] = (row.counts[cls] ?? 0) + count;
    this.#visits.set(key, row);
  }

  async visits(reportId: string): Promise<DayVisits[]> {
    const now = this.now();
    return [...this.#visits.values()]
      .filter((row) => row.reportId === reportId && new Date(row.expiresAt) > now)
      .sort((left, right) => left.day.localeCompare(right.day))
      .map((row) => ({ ...row, counts: { ...row.counts } }));
  }

  async addActivations(site: string, day: string, counts: Record<string, number>, expiresAt: string): Promise<void> {
    const key = `${site}_${day}`;
    const row = this.#activations.get(key) ?? { site, day, counts: {}, expiresAt };
    for (const [activation, count] of Object.entries(counts)) row.counts[activation] = (row.counts[activation] ?? 0) + count;
    this.#activations.set(key, row);
  }

  async activations(site: string): Promise<ActivationCount[]> {
    const now = this.now();
    return [...this.#activations.values()]
      .filter((row) => row.site === site && new Date(row.expiresAt) > now)
      .sort((left, right) => left.day.localeCompare(right.day))
      .flatMap((row) =>
        Object.entries(row.counts).flatMap(([key, count]) => {
          const parsed = parseActivationKey(key);
          return parsed ? [{ day: row.day, ...parsed, count }] : [];
        }),
      );
  }
}

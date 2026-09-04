import { reportClaimSchema, type ClaimStore, type ReportClaim } from "./ClaimStore.js";

export class MemoryClaimStore implements ClaimStore {
  readonly #claims = new Map<string, ReportClaim>();

  constructor(private readonly now = () => new Date()) {}

  async put(input: ReportClaim): Promise<ReportClaim> {
    const claim = reportClaimSchema.parse(input);
    this.#claims.set(claim.reportId, claim);
    return { ...claim };
  }

  async get(reportId: string): Promise<ReportClaim | null> {
    const claim = this.#claims.get(reportId);
    if (!claim || new Date(claim.expiresAt) <= this.now()) return null;
    return { ...claim };
  }
}

import type {
  CapabilityEvidence,
  ContentCategory,
  FoundationAuditSummary,
  ReportError,
} from "../../../shared/types/index.js";

/**
 * What a foundation-audit provider contributes to a report. The provider never returns its own
 * response shape: it maps into these public domain objects so live and fixture modes compile
 * through exactly the same code path.
 */
export interface AuditEvidenceBundle {
  url: string;
  status: "completed" | "partial" | "failed";
  foundation?: FoundationAuditSummary;
  /** Behavioral signals for archetype inference, for example `schema:LodgingBusiness`. */
  signals: string[];
  /** Categories, when the provider supplies them; live mode gets these from the classifier. */
  categories?: ContentCategory[];
  evidence: CapabilityEvidence[];
  errors: ReportError[];
}

export interface AuditProvider {
  readonly name: string;
  audit(url: URL): Promise<AuditEvidenceBundle>;
}

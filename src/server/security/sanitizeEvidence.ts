import {
  capabilityEvidenceSchema,
  MAX_EVIDENCE_ITEMS,
  MAX_EVIDENCE_SNIPPET_LENGTH,
} from "../../shared/schemas/report.js";
import type { CapabilityEvidence } from "../../shared/types/index.js";

export interface SanitizedEvidence {
  evidence: CapabilityEvidence[];
  truncated: boolean;
}

function isControlCharacter(codePoint: number): boolean {
  return codePoint < 32 || (codePoint >= 127 && codePoint < 160);
}

function collapse(value: string, limit: number): string {
  let out = "";
  for (const character of value) {
    out += isControlCharacter(character.codePointAt(0) ?? 32) ? " " : character;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * Bounds and de-noises collected evidence before it is stored or shown. Site-controlled text is
 * treated as data: control characters are stripped, lengths are capped, and the item count is
 * limited so one hostile page cannot inflate a stored report.
 */
export function sanitizeEvidence(input: unknown[], maxItems = MAX_EVIDENCE_ITEMS): SanitizedEvidence {
  const seen = new Set<string>();
  const evidence: CapabilityEvidence[] = [];
  let truncated = false;

  for (const candidate of input) {
    if (evidence.length >= maxItems) {
      truncated = true;
      break;
    }
    if (!candidate || typeof candidate !== "object") {
      truncated = true;
      continue;
    }

    const raw = candidate as Record<string, unknown>;
    const shaped: Record<string, unknown> = {
      ...raw,
      id: typeof raw.id === "string" ? collapse(raw.id, 160) : raw.id,
      claim: typeof raw.claim === "string" ? collapse(raw.claim, 600) : raw.claim,
    };
    if (typeof raw.snippet === "string") {
      shaped.snippet = collapse(raw.snippet, MAX_EVIDENCE_SNIPPET_LENGTH);
    } else {
      delete shaped.snippet;
    }

    const parsed = capabilityEvidenceSchema.safeParse(shaped);
    if (!parsed.success) {
      truncated = true;
      continue;
    }
    if (seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    evidence.push(parsed.data);
  }

  evidence.sort((left, right) =>
    left.actionId === right.actionId ? left.id.localeCompare(right.id) : left.actionId.localeCompare(right.actionId),
  );

  return { evidence, truncated };
}

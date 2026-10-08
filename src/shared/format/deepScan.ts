import type { ScanDepth } from "../types/index.js";

/**
 * There is one scan, and the words used for it everywhere: in a tool description, in a report
 * page, in the sentence an agent reads back to the person who asked.
 *
 * It reads five representative pages for everyone and asks for nothing. An email address buys
 * nothing more than delivery: the finished report goes to that address, and the address goes
 * nowhere near the report. The deep scan of twelve pages for an address was retired on
 * 2026-10-08 (the fourth brief); `depth` is still accepted wherever it was, and means nothing.
 */
export const SCAN_PAGES = 5;
/** The old name for the only scan, kept for callers that named it. */
export const BASIC_SCAN_PAGES = SCAN_PAGES;
/**
 * The most pages a stored report may carry. The retired deep scan read twelve, and a report
 * stored then must still parse today; no new report reaches it.
 */
export const MAX_REPORT_PAGES = 12;

export function pagesForDepth(_depth: ScanDepth | undefined): number {
  return SCAN_PAGES;
}

export function describeDepth(_depth: ScanDepth | undefined): string {
  return `scan of ${SCAN_PAGES} representative pages`;
}

/**
 * An address, shown. Enough for a person to recognise the one they gave, not enough to harvest
 * from a transcript, a log line, or a conversation someone shares onward.
 */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - head.length, 1))}@${domain}`;
}

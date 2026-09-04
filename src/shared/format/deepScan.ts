import type { ScanDepth } from "../types/index.js";

/**
 * The two scans, and the words used for them everywhere: in a tool description, in a report page,
 * in the sentence an agent reads back to the person who asked.
 *
 * The basic scan is what every visitor gets for nothing. The deep scan reads more of the site and
 * is what an email address buys — the report goes to that address, and the address goes nowhere
 * near the report.
 */
export const BASIC_SCAN_PAGES = 4;
export const DEEP_SCAN_PAGES = 12;

export function pagesForDepth(depth: ScanDepth | undefined): number {
  return depth === "deep" ? DEEP_SCAN_PAGES : BASIC_SCAN_PAGES;
}

export function describeDepth(depth: ScanDepth | undefined): string {
  return depth === "deep" ? `deep scan (up to ${DEEP_SCAN_PAGES} pages)` : `basic scan (${BASIC_SCAN_PAGES} pages)`;
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

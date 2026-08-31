/**
 * The upstream foundation audit writes prose with markdown syntax in it. The report renders
 * plain text, so the syntax is stripped rather than displayed literally.
 */
export function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

/** The hero shows the lead of the summary, not the whole essay; the full text lives in the panel. */
export function summaryLead(value: string, maxLength = 260): string {
  const text = stripMarkdown(value);
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const sentenceEnd = cut.lastIndexOf(". ");
  return sentenceEnd > 80 ? cut.slice(0, sentenceEnd + 1) : `${cut.trimEnd()}…`;
}

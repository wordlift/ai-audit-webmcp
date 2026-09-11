import { reportPageUrl } from "../api/client";

/**
 * The prompt that turns ChatGPT into the reviewer: it opens the report, inspects the machine draft,
 * interviews the person about the business, and files the answers here through the refine tool.
 * One text, used wherever the review is offered, so the interview is the same from every door.
 */
/**
 * The prompt that lets an agent use the model this report built: open the page, read the business
 * as modelled, answer in plain words, and keep declared, inferred and verified apart.
 */
export function askAgentPrompt(reportId: string): string {
  return [
    `Open this report in your browser: ${reportPageUrl(reportId)}`,
    "Use inspect-business-model. Tell me in plain words what this business offers, which entities matter most, which of them are only inferred from the text rather than declared by the site, and which actions an AI agent can perform there today. Use explain-entity to check anything. Keep the difference between declared, inferred and verified in your answer.",
  ].join("\n\n");
}

export function reviewPrompt(reportId: string): string {
  return [
    `Review the machine-generated Terms of Action on this page: ${reportPageUrl(reportId)}`,
    "First use inspect-terms-of-action. Then interview me about the operating role, the primary entities, the terminology, and the boundary of every expected action (owned, partner handoff, informational only, or not applicable). Use explain-capability whenever evidence is unclear.",
    "Once we have resolved the decisions, call refine-terms-of-action. Do not alter evidence-based agent readiness.",
  ].join("\n\n");
}

import { reportPageUrl } from "../api/client";

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

/**
 * The prompt that turns ChatGPT into the reviewer of the model: understand it back to the person,
 * ask only the questions that change it, then file the answers through the refine tool. The fuller
 * Terms of Action interview is the skill's; this one is the first review, short enough to finish.
 */
export function reviewPrompt(reportId: string, reviewToken?: string | null): string {
  const link = reviewToken ? `${reportPageUrl(reportId)}?review=${encodeURIComponent(reviewToken)}` : reportPageUrl(reportId);
  return [
    `Open this report in your browser and review what WordLift understood about this business: ${link}`,
    "First, understand. Use inspect-business-model, then tell me in plain words what WordLift thinks this business is, what it offers and where, which of that the site declares, which was only inferred from its content, and the few things agents should be able to do here. No ontology terms.",
    "Then, question. Ask me only what would change the model, a few questions at a time: is this the business, is this one of our main offerings, is this relationship right, which of these are not ours, and for the actions that matter, do we handle them ourselves or through a partner. Use explain-entity or explain-capability when you need the evidence.",
    "Then, refine. Once the answers are settled, call inspect-terms-of-action, then refine-terms-of-action with what I confirmed: primaryEntityIds for what matters, demotedEntityIds for what is not ours, and the boundaries I gave. Do not alter evidence-based agent readiness; my answers never make an action work.",
  ].join("\n\n");
}

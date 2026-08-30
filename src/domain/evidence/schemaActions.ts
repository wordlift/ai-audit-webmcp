/** Schema.org types that imply an expected action, used by every evidence source. */
export const SCHEMA_ACTION_MAP: Record<string, string[]> = {
  Product: ["detail.retrieve", "offer.lookup"],
  ProductGroup: ["detail.retrieve"],
  Offer: ["offer.lookup"],
  AggregateOffer: ["offer.lookup"],
  Article: ["detail.retrieve", "source.verify"],
  NewsArticle: ["detail.retrieve", "source.verify"],
  BlogPosting: ["detail.retrieve", "source.verify"],
  LodgingBusiness: ["detail.retrieve"],
  Hotel: ["detail.retrieve"],
  Resort: ["detail.retrieve"],
  Apartment: ["detail.retrieve"],
  Accommodation: ["detail.retrieve"],
  FinancialService: ["detail.retrieve", "eligibility.explain"],
  InsuranceAgency: ["eligibility.explain"],
  SoftwareApplication: ["detail.retrieve", "plans.compare"],
  WebApplication: ["detail.retrieve", "plans.compare"],
  FAQPage: ["policy.explain"],
  QAPage: ["policy.explain"],
  HowTo: ["policy.explain"],
  BreadcrumbList: ["site.browse"],
  ItemList: ["site.browse"],
  CollectionPage: ["site.browse"],
  WebSite: ["site.search"],
  SearchAction: ["site.search"],
  Organization: ["source.verify"],
  Person: ["source.verify"],
  Reservation: ["transaction.status"],
  Order: ["transaction.status"],
};

/** Maps a declared tool or endpoint name to the action it most likely serves. */
const NAME_ACTION_RULES: Array<{ pattern: RegExp; actionId: string }> = [
  { pattern: /avail|vacan|calendar/, actionId: "availability.check" },
  { pattern: /search|find|query|lookup_items|list_products/, actionId: "site.search" },
  { pattern: /recommend|suggest/, actionId: "items.recommend" },
  { pattern: /compare/, actionId: "items.compare" },
  { pattern: /price|offer|rate|quote_price/, actionId: "offer.lookup" },
  { pattern: /detail|product|item|room|article/, actionId: "detail.retrieve" },
  { pattern: /cart|basket|checkout_session|create_checkout/, actionId: "checkout.create" },
  { pattern: /complete_order|purchase|pay|complete_checkout/, actionId: "checkout.complete" },
  { pattern: /order_status|order-status|track|status/, actionId: "transaction.status" },
  { pattern: /cancel|modify|change|reschedule/, actionId: "transaction.modify" },
  { pattern: /faq|policy|terms|shipping|return/, actionId: "policy.explain" },
  { pattern: /contact|inquiry|enquiry|message/, actionId: "inquiry.submit" },
  { pattern: /support|ticket|help/, actionId: "support.request" },
  { pattern: /quote/, actionId: "quote.request" },
  { pattern: /apply|application/, actionId: "application.start" },
  { pattern: /eligib/, actionId: "eligibility.explain" },
  { pattern: /subscribe|newsletter/, actionId: "subscription.start" },
  { pattern: /plan|pricing|tier/, actionId: "plans.compare" },
  { pattern: /trial|signup|sign_up|register/, actionId: "trial.start" },
  { pattern: /book|reserv/, actionId: "checkout.create" },
  // Broad fallbacks for namespaced capability ids such as `dev.ucp.shopping.checkout`.
  { pattern: /fulfil/, actionId: "transaction.status" },
  { pattern: /checkout/, actionId: "checkout.create" },
];

export function actionForDeclaredName(name: string): string | null {
  const normalized = name.toLowerCase();
  return NAME_ACTION_RULES.find((rule) => rule.pattern.test(normalized))?.actionId ?? null;
}

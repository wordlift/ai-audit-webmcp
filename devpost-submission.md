# Devpost submission draft — WordLift AI Audit: Context Engine for Agents

Status: draft for review. Items marked **[CONFIRM]** require a final check before submission.

## Project name

**WordLift AI Audit — Context Engine for Agents**

## Tagline

Turn any website into an evidence-backed service map: what it knows, what it offers, and what AI agents can actually do.

## Inspiration

Websites were designed as pages for people. AI agents need something different: trusted knowledge about the things a business offers and functions they can safely call.

Most “AI readiness” audits stop at crawlability, metadata, or the presence of a manifest. Those are useful foundations, but they do not answer the operational question: **which action can an agent perform, for which entity, through which interface, and what proves it works?**

WordLift already delivers a context engine based on knowledge graphs. We extended that idea with an action layer so a site owner can move from content and entities to an implementable agent service map.

## What it does

Enter any safe public URL. WordLift AI Audit then:

1. **Analyzes four useful pages, not just the homepage.** It selects an entry page plus complementary detail, offer/action, and policy/contact pages when available.
2. **Preserves the full WordLift foundation audit.** SEO, site files, structured data, content structure, image accessibility, automation readiness, JavaScript behavior, findings, and quick wins run in parallel and remain available as expandable technical evidence.
3. **Classifies the site.** Google content categories and observed business signals infer one of six operating archetypes: commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, or other.
4. **Builds the context graph.** The domain graph captures organizations, products, services, places, articles, people, offers, and provenance. The lexical graph captures categories, names, aliases, and topics.
5. **Compiles the expected action layer.** Classification chooses a deterministic action journey; entity types bind each action to the real thing it applies to.
6. **Checks interfaces and evidence — by calling them.** Human pages and forms are separated from structured data, APIs, MCP, and WebMCP tools. Linked MCP endpoints get a handshake and safe read-only calls; a declared schema.org SearchAction template is executed once with a query taken from the page, and only results that acknowledge the query count as a completed call. A declaration is never confused with a successful invocation.
7. **Shows the path forward.** Every gap has a recommendation and a JSON-LD contract describing the entity, inputs, outputs, governance, and delivery mechanism required.

The report page opens the moment the audit starts and fills in as each provider lands — entities from the collector, the foundation score from the audit — so the wait is spent reading results. The user then gets an executive summary and three priority gaps. The complete WordLift audit (score, AI-crawler access, quick wins, audited dimensions with details folded away), the context graph, interface evidence, and contracts stay one click away, so technical depth never interrupts the conversational flow.

## Why classification matters

Classification is not a decorative label. It is the compiler input for the capability model.

- A commerce site should expose product discovery, offers, availability, checkout, and order-management actions.
- A publisher should expose content retrieval, author/source verification, recommendations, and subscriptions.
- A travel site should expose property discovery, offers, availability, booking handoff, and reservation management.
- Finance and insurance sites need product comparison, eligibility, quotes, applications, policies, and claims.
- SaaS sites need feature and documentation discovery, plan comparison, trials, sales, support, and account management.
- An uncertain site receives a conservative generic graph and an honest provisional classification.

The same public compiler, schemas, scoring rules, and UI handle all six archetypes. Alpina.travel is one controlled proof case, not product-specific logic.

## The Context Engine

The visual report makes one connected system clear:

**Domain graph → Lexical graph → Action layer → Delivery and evidence**

Select an entity such as a product, article, software application, financial service, or lodging business. The action graph immediately highlights what an agent should be able to do with that entity, which interfaces currently support the action, and what contract would close the gap.

This is ontology-backed internally, but the user never needs to learn an ontology. They see a capability map and a practical implementation plan.

## WebMCP leverage

The application is itself a browser-native WebMCP surface using the imperative `navigator.modelContext` API (it also serves the Community Group draft's `document.modelContext`, so the tools register wherever the browser looks):

- `audit-website` accepts any safe public URL and opens the report page at once. A fast audit returns the archetype, scores, page and entity summary, AI-crawler access, priorities, and shareable report URL in one call; a longer one returns the report id immediately so the agent's call never times out.
- `get-audit-report` turns that report id into progress while the audit runs and into the finished summary once a terminal report exists.
- `explain-capability` returns the entity bindings, human and agent interfaces, evidence, recommendation, and contract for one action.
- `explain-foundation-audit` returns the WordLift foundation audit of the open report: score, dimensions, findings, and quick wins.
- `refine-service-map` closes the loop: ChatGPT interviews the human about how the business actually works — its role, its primary entities, its vocabulary, who owns each action — and submits those structured decisions. The result is a new immutable **human-refined service map** with provenance and rationale on every changed node. A human decision can never mark an action agent-ready; readiness always requires invocation evidence.

These five generic tools are the product: the audit itself is the WebMCP surface, and the refinement makes it a human-guided compiler — website evidence in, machine draft out, human insight through ChatGPT, governed agent contracts at the end. A fifth, deliberately narrow tool (`check-alpina-availability`) remains in the codebase as a contained technical proof that a verified read-only endpoint can earn `sidecar-enabled` — grounded in the report's own entity, booking nothing. Enabling sites that way is future WordLift work, not part of this submission's story.

## Honest readiness

**Declaration earns zero readiness points.** A discovery document, OpenAPI file, structured-data action, or declared tool is evidence, but remains `unverified` until a relevant call succeeds. Only invoked machine interfaces can mark an action `agent-ready` or `sidecar-enabled`.

The WordLift foundation score and agent-readiness score remain separate because they answer different questions: is the site prepared for AI systems, and can an agent actually perform its expected actions?

## Alpina.travel reference proof

The stable Alpina fixture demonstrates the complete journey with four captured pages, domain entities, offers, lexical context, expected travel actions, interface evidence, and contracts. It currently records a **94/100 WordLift foundation score** and **22/100 verified action readiness, with 2 of 10 expected capabilities ready**.

The report does not claim Alpina lacks an availability surface. It distinguishes the existing human/API functionality from browser-native WebMCP verification: declarations stay `unverified`, and only an interface the audit actually called counts as proven. The contained read-only adapter documents how such a call is recorded — in an immutable child report, booking nothing — as a technical proof rather than a product claim.

## How we built it

One deployable TypeScript application combines React 19 and Vite with Express on Cloud Run. Firestore stores immutable anonymous report revisions. The public action model and context schemas are versioned data; the existing private WordLift AI Audit is an optional provider behind a server-side adapter.

Key implementation choices:

- deterministic archetype compilation from stored category and behavior evidence;
- representative-page selection by page role rather than the first links found;
- normalized JSON-LD entity and offer extraction with page provenance;
- explicit `EntityActionBinding` and `ActionInterface` records;
- probes that call what a site declares — MCP endpoints and SearchAction templates — read-only, with nothing invented;
- verification-only scoring and bounded evidence;
- a running report record that fills in as providers land, so the page never shows a bare spinner;
- rendered collection through ScrapingBee with a native-fetch fallback, so a renderer outage degrades the audit instead of blanking it;
- progressive disclosure for rich audit data;
- generic fixtures and tests across all six archetypes;
- SSRF protection, redirect validation, response limits, rate limits, and server-only credentials.

## Challenges

### Moving from pages to functions

The hard design problem was connecting what a site is about with what its users and agents need to do. Classification alone is too broad; entities alone do not define behavior. The solution is a deterministic compiler where archetype supplies expected actions, entity type supplies the object of each action, and observed interfaces supply the proof.

### Preserving detail without overwhelming the conversation

The WordLift Audit API contains valuable technical depth. Returning all of it to the chat would bury the answer. We run it concurrently, summarize only what an agent and human reviewer need first, and retain the complete bounded sections and quick wins in the shareable report.

### Proving rather than detecting

A server crawler can find declarations but cannot prove arbitrary browser-origin WebMCP execution. We keep those states separate and use a controlled adapter for the one runtime proof instead of inflating readiness.

## What we learned

The agentic web needs more than machine-readable pages. It needs an explicit connection between domain entities and governed actions, plus evidence that an agent can invoke the interface safely. Once those layers are separated, the migration path becomes visible and implementable.

## What's next

- richer multi-page entity reconciliation and relationship extraction;
- blended archetypes for complex sites;
- community-contributed entity/action rules and evidence detectors;
- governed enablement of verified endpoints — turning the adapter pattern proven here into a WordLift product;
- publication of the action layer into WordLift knowledge graphs and agentic storefronts.

## Built with

TypeScript, React 19, Vite, Express, Node 22, Zod, WebMCP, `use-webmcp-tool`, Google Cloud Run, Firestore, Google Natural Language V2, WordLift AI Audit API, Vitest, Testing Library, Supertest, Playwright, JSON-LD, and Schema.org.

## Judge path

1. Open [beta.audit.wordlift.io](https://beta.audit.wordlift.io).
2. Enter any site URL, or click one of the suggested sites under the field. The report page opens immediately and fills in through understanding → mapping → checking.
3. Review the classification, pages analyzed, and concise executive summary.
4. In the Context Engine, select a domain entity and watch the action layer filter to the actions bound to it.
5. Open one action to inspect human/agent evidence and its JSON-LD contract.
6. Expand the Full WordLift audit only if deeper technical evidence is useful: it opens on its scoreboard, lists the dimensions that need attention first, and folds raw details away.
7. Open the [stable Alpina reference](https://beta.audit.wordlift.io/demo/alpina) for the controlled availability proof.
8. In a compatible WebMCP browser, ask the app to audit a different site and explain one capability.

No account is required.

## Links

- Live application: [beta.audit.wordlift.io](https://beta.audit.wordlift.io)
- Stable reference: [beta.audit.wordlift.io/demo/alpina](https://beta.audit.wordlift.io/demo/alpina)
- Repository: **[CONFIRM public URL before submission]** `https://github.com/wordlift/ai-audit-webmcp`
- Demo video: **[CONFIRM after recording]**

## AI usage disclosure

The product direction, planning artifacts, implementation, tests, and submission narrative were developed with AI coding assistance under WordLift team review. The runtime may use Google Natural Language classification and the WordLift AI Audit provider. Context compilation, archetype inference from stored evidence, entity/action binding, state derivation, readiness scoring, prioritization, and contract generation are deterministic code.

## Open source

Apache-2.0. The public repository contains the new context compiler, action model, evidence rules, schemas, UI, WebMCP tools, fixtures, adapters, security controls, and tests. Contributors without WordLift credentials can run the complete deterministic demo mode.

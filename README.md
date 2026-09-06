# WordLift AI Audit — WebMCP Context Engine

**The machine reads the website. The human knows the business. ChatGPT compiles both into governed Terms of Action.**

WordLift AI Audit takes any public URL, classifies the site, reads the representative pages, extracts the business entities and language, compiles the actions an agent should be able to perform, and verifies — by calling them — which interfaces actually support those actions. The result is a **machine-generated draft**: a human then reviews it through ChatGPT — correcting the business role, promoting the entities that matter, teaching vocabulary, and deciding who owns each action — and `refine-terms-of-action` compiles those decisions into immutable **human-refined Terms of Action**. The draft keeps working on its own; refinement adds the knowledge only a human has.

**Terms of Action are the business declaration:** what the business owns, what it only describes, what it hands off to partners, and what is not applicable. The **Action Graph** remains the machine-readable artifact that encodes those terms for agents.

- Live application: [beta.audit.wordlift.io](https://beta.audit.wordlift.io)
- Stable reference report: [beta.audit.wordlift.io/demo/alpina](https://beta.audit.wordlift.io/demo/alpina)
- The existing WordLift AI Audit this application extends: [wordlift.io/ai-audit](https://wordlift.io/ai-audit/)
- WordLift: [wordlift.io](https://wordlift.io)

## What a report contains

1. **Executive summary** — the archetype and its confidence, the WordLift foundation score and the verified agent-readiness score side by side (never blended into one number), and the three highest-impact gaps.
2. **The Context Engine** — a domain graph (organizations, products, services, places, articles, people, and offers, each with page provenance), a lexical graph (categories, names, aliases, topics), and the action layer (expected actions, entity–action bindings, interfaces, evidence, contracts). Selecting an entity filters the actions bound to it.
3. **Terms of Action / capability map** — the expected journey for the archetype (discover → understand & decide → act → manage), each action with its human and agent evidence, recommendation, JSON-LD contract, and — after review — its business boundary: owned, partner handoff, informational only, or not applicable.
4. **Full WordLift audit** — the foundation audit behind progressive disclosure: score and summary, AI-crawler access, quick wins, the audited dimensions (those needing attention first, raw details folded away), remaining findings, and the way back to [audit.wordlift.io](https://audit.wordlift.io).

The report page exists from the first second: it polls the running record and shows each provider's result as it lands — entities from the collector, the foundation score from the audit — before the final report replaces them.

## What gets verified, not just detected

| Signal | What the audit does with it |
| --- | --- |
| WebMCP tools registered through `navigator.modelContext` or declared in markup | Read from the page and its scripts; they stay `declared` |
| MCP endpoints linked from the page or named in its server card | Handshake, list tools, call the safe read-only ones; results are `invoked` or `failed` |
| A schema.org `SearchAction` template | Executed once, read-only, with a query taken from the page; confirmed only when the results acknowledge it — a blind 200 stays `declared`, a non-200 is `failed` |
| Discovery documents (`llms.txt`, `skill.md`, `.well-known/*`) | Fetched and validated; a soft 404 is a finding, not a presence |
| Forms, links, structured data | `observed` human evidence and `declared` agent evidence |
| The alpina.travel availability API | Called through a contained read-only adapter — a technical proof that a verified endpoint can earn `sidecar-enabled`; enabling sites this way is future WordLift work, not part of the audit |

**Declaration earns zero readiness points.** Only `invoked` evidence raises the verified agent-readiness score. A site that refuses automated access — a 403, a rate limit, a bot challenge — is reported as blocked rather than audited from its block page; that refusal is exactly what an agent would meet. The compiler supports six operating archetypes — commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, and a conservative fallback — and archetype rules select the expected journey while page and API evidence determine the actual state.

## WebMCP tools

The application is itself a WebMCP surface. It registers tools through the WebMCP imperative API via `use-webmcp-tool` — on `navigator.modelContext` where the browser exposes it (Chrome's preview) and on `document.modelContext` per the Community Group draft; `src/client/webmcp/modelContextAlias.ts` points whichever is missing at the other, so the tools register wherever the browser looks:

- `audit-website` — audits any safe public URL. A fast audit answers in one call with the archetype, both scores, pages and entities, crawler access, priorities, and the report URL; a longer one answers immediately with the report id and points at `get-audit-report`, so the call never times out.
- `get-audit-report` — turns a report id into progress while the audit runs and into the finished summary once a terminal report exists.
- `explain-capability` — one action: the entities it applies to, its interfaces, evidence, governance, recommendation, and contract.
- `explain-foundation-audit` — the WordLift foundation audit of the open report: score, dimensions, findings, quick wins.
- `inspect-terms-of-action` — the read half of the human loop, and the first call in the protocol: the machine-generated **Terms of Action** — inferred operating role, every entity with its id and machine priority, terminology, and every action with its evidence, readiness, and boundary — everything an agent needs to interview the business owner.
- `refine-terms-of-action` — the write half: after the interview, it submits the reviewer's structured decisions (business role, primary entities, terminology, confirm/reject/boundary per action) and returns a new immutable report containing the **human-refined Terms of Action**. Human decisions can never mark an action agent-ready — readiness always requires invocation evidence.
- `check-alpina-availability` — a contained read-only adapter for one allowlisted endpoint, kept as a technical proof of how a verified interface earns `sidecar-enabled` in an immutable child revision. Turning that pattern into a product is future WordLift work, outside this audit.

The report tools register the moment `/reports/:id` loads — before the report itself has rendered — on the top-level document, against `document.modelContext` (with `navigator.modelContext` aliased for Chrome's preview). The intended agent protocol is explicit in the descriptions: **inspect → interview → explain where unclear → refine**. A self-test badge on every report names the registered site tools, and tells readers without WebMCP to open the report in the ChatGPT desktop app's built-in browser.

Tool identifiers are implementation contracts; the product concept they inspect and refine is **Terms of Action**.

## The same tools, without a browser

The audit also answers as a remote MCP server, so an agent that never opens the page can use it:

```text
https://beta.audit.wordlift.io/mcp     Streamable HTTP, stateless, no authentication
```

It offers the six audit tools — the Alpina sidecar stays a browser demo. Both surfaces read one set
of tool definitions (`src/shared/tools/definitions.ts`) and compose their answers with one
application service (`src/server/services/AuditToolService.ts`), so a remote caller and an agent
standing on the page cannot be told different things about the same report. The difference a remote
caller forces is stated rather than forked: with no open page to infer scope from, every
report-scoped tool must be handed its `reportId`.

`plugins/ai-audit/` packages that endpoint with the skill that knows the order the workflow depends
on — audit, inspect, interview, confirm, refine.

## What it costs

Nothing. Auditing a URL, reading a report, sharing its link: no account, no payment. The basic scan
reads four representative pages and asks for nothing at all.

One exchange exists. A **deep scan** reads up to twelve pages and asks for an email address, and the
finished report is sent there. A report page offers it once the free scan has shown what it found —
never before — and an agent can ask for the same thing through `audit-website`. The address is filed beside the report, never inside it — a report is
a public document with a shareable link — and it is masked wherever it is read back. The report is
sent through the same HubSpot form the WordLift AI Audit already uses, so one person is one contact
whichever audit they arrived through.

Refining a report is the one thing not open to everyone: a remote audit hands its caller a
`claimToken`, and only a caller holding it can publish a refinement of that report. Reading stays
free to anyone with the link.

## Run locally

```bash
npm ci
npm run dev:demo      # web app on :5173, API on :3000, no credentials
```

Demo mode is the full pipeline fed by deterministic fixtures for all six archetypes; the home page offers the sample hosts as one-click chips. Live mode needs the providers described in [docs/OPERATIONS.md](docs/OPERATIONS.md):

```bash
cp .env.example .env    # fill in live values
npm run dev
```

Gates, all of which CI runs on every push and pull request:

```bash
npm run verify          # typecheck + unit/integration/component tests + production build
npm run test:e2e        # Playwright; builds and serves the app itself
```

## Repository map

| Path | What lives there |
| --- | --- |
| `action-model/v0.1.0/` | Versioned data: actions, archetype journeys, category and behavior mappings |
| `src/domain/` | Pure compilation: classification, context graph, evidence detection, state derivation, scoring, contracts |
| `src/server/` | Express API, the MCP endpoint, providers (WordLift audit, native-fetch or ScrapingBee collection, Google NLP), stores (reports, deep-scan leads, report claims), the alpina sidecar, security (URL policy, sanitization, rate limits) |
| `src/client/` | React app, report UI, WebMCP tools |
| `src/shared/` | Zod schemas (the report contract), the tool definitions every transport publishes, and the agent-facing summaries |
| `plugins/ai-audit/` | The public plugin: the remote MCP connection and the review skill |
| `fixtures/` | Sanitized, dated site snapshots, one per archetype |
| `tests/` | Unit, integration, component, golden, and e2e suites |
| `docs/` | [Operations](docs/OPERATIONS.md), [brand](docs/BRAND.md), [WebMCP Challenge submission](docs/submission/), [the MCP endpoint and plugin](docs/mcp-plugin/); `docs/hackathon-build/` is the historical planning record |

Developer conventions are in [CONTRIBUTING.md](CONTRIBUTING.md); the working agreement for agent-assisted development is in [AGENTS.md](AGENTS.md).

## Public report contract

Reports expose:

- the inferred archetype, category evidence, confidence, and model version;
- an account-free shareable URL that resolves while the audit is still running;
- up to four audited pages and their roles;
- normalized domain entities, lexical entries, action interfaces, and entity–action bindings;
- a separate WordLift foundation score (with dimensions, quick wins, and crawler access) and a verification-only agent-readiness score;
- the publishing platform when the site's own structured data names one (WordLift's `data.wordlift.io` entity ids, plugin, or SDK) — detected, never guessed;
- three prioritized gaps;
- JSON-LD capability contracts with entity target, inputs, outputs, governance, and recommended delivery;
- bounded evidence and immutable child revisions for overrides, reverification, and sidecar invocations.

Raw HTML, secrets, cookies, private identifiers, and unbounded provider responses are never stored.

## Extend the model

The versioned action model lives in `action-model/v0.1.0/`. Contributors can add or revise Google-category and behavior mappings, archetype journeys, action definitions and governance, evidence detectors, entity-to-action expectations, and approved adapters. The user-facing result is a set of **Terms of Action**, a capability map, and an implementation plan; the ontology is the internal discipline that keeps the graph consistent and ready for publication as the **Action Graph** of a WordLift knowledge graph.

## Hackathon boundary

This public application, its schemas, context compiler, action model, evidence rules, UI, WebMCP tools, fixtures, security controls, and tests are new WebMCP Challenge work. The existing [WordLift AI Audit](https://wordlift.io/ai-audit/) is an optional provider behind a public adapter boundary. alpina.travel is the one client site shown with permission; every other example is a fixture or an unrelated public site.

Licensed under [Apache-2.0](LICENSE).

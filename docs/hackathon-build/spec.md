# Technical Spec

## Overview

WordLift AI Audit is a single deployable TypeScript application that turns a public website URL into an evidence-backed agent capability report. It combines the established private WordLift AI Audit response with fresh public-site evidence, Google content classification, and a deterministic action-model compiler. It then exposes the result both as a shareable visual report and as WebMCP tools that return completed, structured answers to an agent.

The new public repository is a meaningful product layer rather than a thin UI over the private service. It owns:

- URL safety and audit orchestration.
- Google-category-to-archetype inference.
- The versioned expected-action model for six archetypes.
- Human-versus-agent evidence mapping.
- Verification-only readiness scoring and deterministic priority ranking.
- JSON-LD action contract generation.
- The action graph and progressive-disclosure report UI.
- Current WebMCP registration and response contracts.
- A controlled Alpina.travel availability sidecar.
- Demo fixtures, tests, deployment configuration, and contributor extension points.

The private `wordlift/ai-audit` service remains an adapter behind the public boundary. Its API key, Gemini access, and ScrapingBee credentials are never exposed to the browser or committed to the public repository.

### Architectural principles

1. **One deployable application.** React and Express ship in one Cloud Run container. A six-day build does not need a monorepo, message bus, or separate frontend hosting layer.
2. **Deterministic after evidence collection.** External classifiers and live websites can change. Given a stored evidence bundle, category response, archetype override, and action-model version, compilation, state assignment, scoring, priorities, and contracts are deterministic.
3. **Verified means invoked.** A declaration, manifest, OpenAPI document, or detected tool is evidence, but it cannot increase the agent-readiness score until the relevant capability has been successfully verified.
4. **Immutable shareable revisions.** Reclassification and reverification create child reports. A shared report never silently changes underneath a reviewer.
5. **No universal proxy.** The only executable sidecar in the MVP is the allowlisted, read-only Alpina.travel availability adapter.
6. **Evidence is public and bounded.** Store normalized findings and short snippets, never raw pages, secret headers, credentials, or unrestricted model prompts.
7. **Progressive disclosure.** The WebMCP result is concise and machine-parseable. The visual report carries the full action graph, evidence, contracts, and implementation detail.

## Stack

### Runtime and language

- Node.js 22 LTS runtime.
- TypeScript 5.8, strict mode, for browser, server, domain model, fixtures, and tests.
- One npm package and one lockfile.

### Frontend

- React 19.1 and React DOM 19.1.
- Vite 6.2 for development and production assets.
- React Router for `/`, `/reports/:reportId`, and `/demo/alpina`.
- Radix Dialog for the accessible action-detail drawer.
- Lucide React for state and journey icons.
- CSS custom properties and component styles derived from the existing AI Audit visual language. No graph library is required: the journey is an ordered CSS grid, not a force-directed graph.
- `use-webmcp-tool` for lifecycle-safe registration against the current `document.modelContext` API.

### Backend

- Express 4 with TypeScript.
- Zod for all environment, API, adapter, fixture, and stored-report boundaries.
- Native `fetch` plus explicit timeouts; `@mozilla/readability` and LinkeDOM for bounded content extraction.
- `@google-cloud/language` for Google Natural Language V2 content classification.
- `@google-cloud/firestore` for anonymous report persistence.
- `express-rate-limit` for per-IP and global cost protection.

### Verification

- Vitest for domain and adapter tests.
- React Testing Library for report and WebMCP lifecycle tests.
- Supertest for HTTP contracts.
- Playwright for the fixture-backed URL-to-report smoke path.
- Official WebMCP inspector/eval utilities for the manual Chrome demo verification.

### Deployment

- One Docker image deployed to Google Cloud Run in `us-west1`, colocated with the existing private AI Audit service.
- Firestore in Native mode, accessed only by the Cloud Run service account.
- Google Application Default Credentials for Firestore and Natural Language.
- Secret Manager-backed environment variables for WordLift and ScrapingBee credentials.
- Cloud Run request timeout set to 180 seconds; expected audit duration is 30–60 seconds.
- Initial concurrency target: 20 requests per instance; maximum instances capped during the hackathon to protect the private downstream service.

## Architecture

### 1. React application shell

Implements: `prd.md > Epic 1`, `Epic 3`, `Epic 4`, `Epic 7`

The browser application owns the URL form, three-phase progress presentation, report routing, executive summary, deterministic action journey, action-detail drawer, contract copy/download controls, and share link. It never calls WordLift or Google APIs directly.

The visual graph is a four-column ordered journey:

`Discover -> Understand / Decide -> Act -> Manage`

Each action has a stable stage and order from the model. The UI uses state text, icon, border treatment, and color. On narrow screens, stages become stacked sections while preserving order.

### 2. WebMCP tool layer

Implements: `prd.md > Epic 1`, `Epic 3`, `Epic 5`, `Epic 6`

The application registers tools with the current experimental WebMCP API on `document.modelContext`. The existing private AI Audit implementation using `navigator.modelContext` is treated as a historical reference, not copied.

Tool availability follows page lifecycle:

- `audit-website` is available throughout the application.
- `explain-capability` is enabled on a completed report page.
- `check-alpina-availability` is enabled only on an Alpina report or the explicit Alpina demo after the approved sidecar is activated.

All tool errors return `isError: true` through the hook normalization path. Untrusted website text is never placed in tool names, descriptions, or input schemas.

### 3. Report API and orchestrator

Implements: `prd.md > Epic 1`, `Epic 2`, `Epic 3`, `Epic 7`

The Express API validates and normalizes the URL, creates a report record using the caller-generated request UUID, and executes the audit in the same request. This intentionally avoids Cloud Tasks during the six-day build.

The report is written as `running` before the expensive call. If the client reconnects, `GET /api/reports/:id` retrieves the state; a retried `POST` with the same `requestId` is idempotent. Cloud Run keeps the main request open and its configured timeout comfortably exceeds the private API's expected 30–60 second duration.

The orchestrator runs these stages:

1. `understanding`: normalize URL, collect page evidence, call private AI Audit, and classify content.
2. `mapping`: infer or apply the archetype, compile the expected action set, and generate contracts.
3. `checking`: run evidence detectors, derive human and agent states, calculate score and priorities, persist the report.

The UI displays these product phases. The API records the current real phase so a retry or partial failure remains honest.

### 4. Private AI Audit adapter

Implements: `prd.md > preserve existing audit breadth`

`WordLiftAuditProvider` calls `POST /api/audit` on the private service with `Authorization: Key <server-secret>` and `{ "url": "..." }`. Its response is validated and mapped into the public `AuditEvidenceBundle`; no private response type leaks into the domain layer.

The adapter imports established evidence such as:

- overall AI Audit score and executive findings;
- robots, `llms.txt`, agent files, MCP and WebMCP discovery signals;
- structured-data types;
- content structure and semantic HTML;
- automation/form readiness;
- JavaScript rendering and bot accessibility;
- existing quick wins.

The existing score remains visible as an “AI Audit foundation score.” It is not blended into the new agent-capability score, which measures verified actions only.

### 5. Site evidence collector

Implements: `prd.md > Epic 2`, `Epic 4`

The collector obtains a bounded representation of the canonical public page and selected discovery documents. In live WordLift mode it uses ScrapingBee when configured, matching the existing audit stack; a native-fetch implementation is available for local/open deployments.

It extracts:

- canonical URL, title, description, headings, main readable text, and key navigation labels;
- form names, labels, methods, action URLs, and input names without values;
- JSON-LD types and action-related Schema.org properties;
- links to policies, search, account, checkout, booking, support, and status surfaces;
- `robots.txt`, `llms.txt`, `skill.md`, agent-skills index, MCP cards, WebMCP manifest, OpenAPI, and explicitly linked discovery documents.

Collection is capped by bytes, time, redirect count, endpoint count, and evidence count. Raw HTML is held only in memory during the request and discarded after normalized evidence is produced.

### 6. Content classifier and archetype inferer

Implements: `prd.md > Epic 2`

The content classifier sends a cleaned text document to Google Natural Language `classifyText` using the V2 category model. It stores the exact English category strings, confidences, model choice, and collection time.

The archetype inferer is deterministic. It combines category mappings and behavioral signals:

```text
archetypeScore = sum(categoryConfidence * categoryRuleWeight)
               + sum(observedBehaviorRuleWeight)
```

Behavioral examples include:

- `Product`, `Offer`, cart, and checkout signals -> commerce/retail.
- `Article`, `NewsArticle`, publication, and subscription signals -> publisher/content.
- `LodgingBusiness`, `Hotel`, availability, and booking signals -> travel/hospitality.
- `FinancialService`, quote, application, policy, and claim signals -> finance/insurance.
- `SoftwareApplication`, pricing plans, trial, login, and support signals -> SaaS.

The highest score wins. The result is provisional when the top score is below the configured evidence floor or its margin over the second score is below the configured margin. With no adequate vertical evidence, the classifier selects `other` and explains why. Thresholds and weights live in the versioned action-model data, not application code.

Google classification is not claimed to be deterministic across future service versions. Reproducibility begins from the stored category response. A Google API failure falls back to behavior-only inference and must be marked provisional.

### 7. Versioned action model

Implements: `prd.md > Epic 2`, `Epic 4`, `Epic 5`

The action model is data, compiled by code. Version `0.1.0` contains:

- a manifest and provisional public vocabulary context;
- reusable action definitions;
- six archetype templates;
- Google-category-to-archetype rules;
- behavioral and evidence rules;
- contract input/output schemas;
- importance, governance, and stable display order.

Every action definition includes:

```ts
interface ActionDefinition {
  id: string;
  label: string;
  description: string;
  stage: "discover" | "understand-decide" | "act" | "manage";
  intent: "informational" | "transactional";
  importance: 1 | 2 | 3;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  governance: {
    requiresAuthentication: boolean;
    requiresAuthorization: boolean;
    requiresConfirmation: boolean;
    sideEffects: "none" | "reversible" | "irreversible";
  };
  evidenceRules: string[];
  recommendedDelivery: "native-webmcp" | "api-adapter" | "approved-sidecar";
}
```

Initial archetype action sets are deliberately small enough to read in one report:

| Archetype | Discover | Understand / Decide | Act | Manage |
| --- | --- | --- | --- | --- |
| Commerce / retail | search products | product detail, compare, recommend, policies | offer/price, availability, create checkout, complete checkout | order status, cancel/return |
| Publisher / content | search content, browse topics | retrieve article, related content, verify author/source | subscribe, submit inquiry | manage subscription/preferences |
| Travel / hospitality | search stays/experiences | property detail, compare, recommend, policies | check availability, request/booking handoff | booking status, modify/cancel |
| Finance / insurance | discover products | product detail, compare, eligibility/policy explanation | request quote, start application | application/claim status, manage policy |
| SaaS | search features/docs | feature detail, compare plans, pricing, support guidance | start trial, create account, contact sales | subscription/account status, support ticket |
| Other | site search | retrieve detail, FAQ/policy | contact or submit inquiry | request/status follow-up |

Transactional actions are represented and contracted, but the MVP does not execute checkout, booking, payment, applications, claims, cancellation, or account changes.

### 8. Evidence engine and state derivation

Implements: `prd.md > Epic 4`

Evidence is typed and separate from the conclusion it supports:

```ts
interface CapabilityEvidence {
  id: string;
  actionId: string;
  audience: "human" | "agent";
  kind: "page" | "form" | "structured-data" | "discovery" |
        "openapi" | "webmcp" | "api-result" | "tool-result";
  sourceUrl: string;
  claim: string;
  confidence: number;
  verification: "observed" | "declared" | "invoked" | "failed";
  collectedAt: string;
  snippet?: string;
}
```

Aggregate state is derived in this order:

1. `not-expected`: detected action is outside the compiled expected set; excluded from score.
2. `sidecar-enabled`: approved sidecar was discovered and successfully invoked.
3. `agent-ready`: a discoverable machine interface was successfully invoked.
4. `unverified`: agent support was declared or detected but could not be invoked, or evidence conflicts.
5. `human-only`: human support was observed and no agent interface was detected.
6. `missing`: the action is expected and neither human nor agent support has adequate evidence.

Human and agent support remain separate fields even when an aggregate label is shown. A runtime WebMCP tool on an arbitrary third-party page cannot be verified from the server in the MVP; static declarations are therefore `unverified`, never `agent-ready`.

### 9. Scoring and prioritization

Implements: `prd.md > Epic 3`

Agent readiness is verification-only:

```text
readiness = round(
  100 * sum(action.importance for verified agent-ready or sidecar-enabled actions)
      / sum(action.importance for all expected actions)
)
```

`unverified`, `human-only`, and `missing` actions contribute zero readiness points. The report shows their separate counts so a zero score is informative rather than opaque. The existing broad AI Audit score is presented separately.

Priority gaps are ranked deterministically:

```text
priorityScore = importance * gapSeverity + feasibilityBoost

gapSeverity: missing=3, human-only=2, unverified=1
feasibilityBoost: human-only=2, unverified=1, missing=0
```

Ties resolve by archetype display order and stable action ID. This makes the same stored report produce the same top three recommendations.

### 10. Action contract compiler

Implements: `prd.md > Epic 5`

Every human-only, unverified, or missing expected action receives a plain-language recommendation and a JSON-LD contract. The compiler merges the action definition, site identity, expectation source, observed evidence, and recommended delivery path.

The JSON-LD uses Schema.org `Action` and `EntryPoint` where possible, plus a small provisional `wlcap` namespace for governance, evidence, and delivery terms. The project ships the context document and labels it versioned/provisional so it can evolve into the future WordLift action layer without presenting an ontology editor to the user.

Illustrative shape:

```json
{
  "@context": [
    "https://schema.org",
    { "wlcap": "https://wordlift.io/vocab/agent-capability/" }
  ],
  "@id": "urn:wordlift:capability:travel.check-availability",
  "@type": ["Action", "wlcap:CapabilityContract"],
  "name": "Check accommodation availability",
  "object": { "@id": "https://alpina.travel/" },
  "wlcap:stage": "act",
  "wlcap:intent": "informational",
  "wlcap:inputSchema": { "type": "object" },
  "wlcap:outputSchema": { "type": "object" },
  "wlcap:governance": {
    "requiresAuthentication": false,
    "requiresConfirmation": false,
    "sideEffects": "none"
  },
  "wlcap:recommendedDelivery": "approved-sidecar",
  "wlcap:modelVersion": "0.1.0"
}
```

The contract generator must pass JSON Schema validation and a JSON-LD parse test. Contract generation is deterministic and does not use an LLM.

### 11. Report store

Implements: `prd.md > Epic 2`, `Epic 6`, `Epic 7`

Firestore collection `reports` stores one bounded document per report revision. Browser clients do not receive Firestore credentials and never access Firestore directly.

```ts
interface ReportRecord {
  id: string;
  parentReportId?: string;
  status: "running" | "completed" | "partial" | "failed";
  phase: "understanding" | "mapping" | "checking" | "complete";
  mode: "live" | "demo";
  requestedUrl: string;
  canonicalUrl?: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  actionModelVersion: string;
  classification?: ClassificationResult;
  foundationAudit?: FoundationAuditSummary;
  capabilities?: CapabilityResult[];
  score?: ReadinessScore;
  priorities?: PriorityGap[];
  errors: ReportError[];
  evidenceTruncated: boolean;
}
```

Limits:

- maximum 100 normalized evidence items;
- maximum 500 characters per evidence snippet;
- no raw HTML or complete model prompts;
- no credentials, request headers, cookies, or private account identifiers;
- report IDs are random UUIDs and cannot be enumerated through a listing endpoint;
- `expiresAt` defaults to 30 days, with the canonical judge demo explicitly retained through judging;
- a Firestore TTL policy may clean expired reports after the event.

An in-memory store supports local development. Demo fixtures can still be persisted to Firestore when deployed so their report links are shareable.

### 12. Alpina.travel sidecar

Implements: `prd.md > Epic 6`

The sidecar is a hand-written, allowlisted adapter for the public, read-only endpoint:

`GET https://alpina.travel/api/booking/availability`

Inputs:

- `propertyId`, default `samspitze-4`;
- `checkIn` and `checkOut` as `YYYY-MM-DD`;
- `adults`, integer;
- `childrenAges`, integer array serialized upstream as comma-separated ages;
- `currency`, default `EUR`;
- `locale`, default `en`.

The server validates dates, requires check-out after check-in, caps total guests at six, and does not follow a caller-provided upstream URL. Output is allowlisted to availability, normalized status, dates, guest counts, EUR quote fields when returned, checkout handoff URL, `checkedAt`, `expiresAt`, and revalidation policy.

The tool is read-only. It does not create a booking session, hold inventory, send guest data, or perform payment. A successful tool call creates a child report revision containing invocation evidence and marks the action `sidecar-enabled`. The tool returns both availability and the updated report URL.

The live Alpina site already exposes public booking discovery and API surfaces. The demo must not falsely label a live, verified API as nonexistent. The before/after story is therefore:

- before: human form plus API/discovery evidence, with current WebMCP runtime support unverified;
- after: the report application registers the approved current-spec WebMCP tool, invokes it successfully, and records `sidecar-enabled` evidence.

A dated fixture may illustrate the earlier human-only snapshot, but it must be labeled as a captured baseline rather than a live finding.

## File Structure

```text
ai-audit-webmcp/
├── .env.example                         # Safe configuration names and mode examples
├── .gitignore                           # Secrets, build output, emulator data
├── Dockerfile                           # Multi-stage Vite + server build for Cloud Run
├── LICENSE                              # Apache-2.0, subject to WordLift approval before public launch
├── README.md                            # Thesis, quick start, modes, demo, public/private boundary
├── CONTRIBUTING.md                      # Add an action, archetype, detector, fixture, or sidecar
├── SECURITY.md                          # URL-fetch, secret, disclosure, and sidecar trust boundaries
├── package.json                         # Single-package scripts and pinned dependency ranges
├── package-lock.json                    # Reproducible dependency graph
├── tsconfig.json                        # Shared strict TypeScript configuration
├── tsconfig.server.json                 # Node build target
├── vite.config.ts                       # React build and local API proxy
├── firestore.indexes.json               # TTL/single-field configuration
├── action-model/
│   └── v0.1.0/
│       ├── manifest.json                # Version, thresholds, provenance, release date
│       ├── context.jsonld               # Provisional action-contract JSON-LD context
│       ├── actions.json                 # Reusable action definitions and governance
│       ├── archetypes/
│       │   ├── commerce-retail.json     # Ordered commerce journey
│       │   ├── publisher-content.json   # Ordered publisher journey
│       │   ├── travel-hospitality.json  # Ordered travel journey
│       │   ├── finance-insurance.json   # Ordered finance journey
│       │   ├── saas.json                # Ordered SaaS journey
│       │   └── other.json               # Small cross-site baseline
│       └── mappings/
│           ├── google-categories.json   # Exact V2 category/prefix weights
│           ├── behavior-rules.json      # Schema, form, path, and page-signal weights
│           └── evidence-rules.json      # Human/agent detector-to-action mappings
├── fixtures/
│   ├── commerce-retail/                 # Sanitized deterministic audit + site evidence
│   ├── publisher-content/
│   ├── travel-hospitality/
│   │   ├── alpina-before.json           # Clearly dated captured baseline
│   │   └── alpina-live-response.json    # Stable availability adapter response
│   ├── finance-insurance/
│   ├── saas/
│   └── other/
├── public/
│   ├── wordlift-mark.svg                # Approved WordLift brand asset
│   └── action-contract-context.jsonld   # Public copy of versioned JSON-LD context
├── src/
│   ├── client/
│   │   ├── main.tsx                     # Browser entry and router
│   │   ├── App.tsx                      # Shell, branding, global WebMCP tool
│   │   ├── routes/
│   │   │   ├── HomeRoute.tsx            # URL form and three-phase progress
│   │   │   ├── ReportRoute.tsx          # Loads immutable report revision
│   │   │   └── AlpinaDemoRoute.tsx      # Controlled before/after demo
│   │   ├── components/
│   │   │   ├── ExecutiveSummary.tsx     # Archetype, scores, top three gaps
│   │   │   ├── ClassificationCard.tsx   # Category/archetype evidence and override
│   │   │   ├── ActionJourney.tsx        # Four-stage deterministic graph
│   │   │   ├── ActionNode.tsx            # Accessible state representation
│   │   │   ├── ActionDetailDialog.tsx   # Human/agent evidence and recommendation
│   │   │   ├── ContractViewer.tsx       # Explain, copy, download JSON-LD
│   │   │   └── ReportErrorState.tsx     # Partial, failed, missing, expired states
│   │   ├── webmcp/
│   │   │   ├── AuditWebsiteTool.tsx     # `audit-website` registration
│   │   │   ├── ExplainCapabilityTool.tsx# report-scoped explanation tool
│   │   │   └── AlpinaAvailabilityTool.tsx# approved read-only sidecar tool
│   │   ├── api/client.ts                # Typed fetch, idempotency, polling fallback
│   │   └── styles/                      # AI Audit-derived design tokens/components
│   ├── server/
│   │   ├── index.ts                     # Express boot, static SPA, shutdown
│   │   ├── config.ts                    # Zod-validated environment configuration
│   │   ├── routes/
│   │   │   ├── reports.ts               # Create/read/recompile/reverify/contracts
│   │   │   ├── alpina.ts                # Fixed-function availability endpoint
│   │   │   └── health.ts                # Cloud Run health endpoint
│   │   ├── services/
│   │   │   ├── AuditOrchestrator.ts     # Three-phase lifecycle
│   │   │   └── ReportService.ts         # Immutable revisions and URLs
│   │   ├── adapters/
│   │   │   ├── audit/AuditProvider.ts   # Public adapter interface
│   │   │   ├── audit/WordLiftAudit.ts   # Private API implementation
│   │   │   ├── audit/FixtureAudit.ts    # Deterministic open mode
│   │   │   ├── scrape/ScrapeProvider.ts # Collector interface
│   │   │   ├── scrape/ScrapingBee.ts    # Live rendered collection
│   │   │   ├── scrape/NativeFetch.ts    # Open fallback
│   │   │   ├── classify/GoogleNlp.ts    # Natural Language V2 adapter
│   │   │   └── store/                   # Firestore and memory report stores
│   │   ├── security/
│   │   │   ├── urlPolicy.ts             # SSRF and redirect validation
│   │   │   ├── sanitizeEvidence.ts      # Size/content allowlisting
│   │   │   └── rateLimits.ts            # IP and global downstream protection
│   │   └── sidecars/alpina/
│   │       ├── adapter.ts                # Fixed upstream and normalized response
│   │       └── schemas.ts                # Input/output Zod contracts
│   ├── domain/
│   │   ├── classification/              # Category normalization and archetype scoring
│   │   ├── evidence/                    # Detectors, merge, provenance
│   │   └── action-model/
│   │       ├── loadModel.ts              # Validate/version model data
│   │       ├── compileGraph.ts            # Expected action journey
│   │       ├── deriveState.ts             # Evidence -> capability state
│   │       ├── scoreReadiness.ts          # Verification-only score
│   │       ├── rankPriorities.ts          # Stable top-three gaps
│   │       └── compileContract.ts         # JSON-LD action contract
│   └── shared/
│       ├── schemas/                      # API and persisted Zod schemas
│       ├── types/                        # Types inferred from schemas
│       └── format/                       # Chat summary and display formatters
└── tests/
    ├── unit/                             # Compiler, state, score, contract, URL safety
    ├── integration/                      # API, provider, Firestore/memory, sidecar
    ├── component/                        # Graph, detail dialog, WebMCP lifecycle
    ├── e2e/                              # Fixture URL -> shareable report
    └── golden/                           # Expected graphs for all six archetypes
```

## Data Flow

### Primary lifecycle: URL to report

1. The user or `audit-website` tool normalizes a bare domain into an HTTPS URL in the client and creates `requestId = crypto.randomUUID()`.
2. The client calls `POST /api/reports` and shows `understanding`.
3. The server validates the URL, resolves DNS, rejects unsafe destinations, creates `reports/{requestId}` with `running`, and revalidates every redirect.
4. `AuditOrchestrator` calls the selected `AuditProvider` and `ScrapeProvider` in parallel where safe.
5. The collector reduces the page to bounded text, forms, links, structured data, and discovery evidence; raw HTML is discarded after reduction.
6. `GoogleNlp` returns exact V2 categories and confidences. If unavailable, the report records an error and continues with behavior-only provisional classification.
7. The deterministic archetype inferer combines category weights and behavioral evidence, unless an explicit override is present.
8. `compileGraph` loads the pinned action-model version and creates the ordered expected actions with expectation provenance.
9. Evidence detectors attach human and agent evidence. `deriveState` calculates each aggregate capability state.
10. `scoreReadiness` and `rankPriorities` produce the verified score and top three gaps. `compileContract` creates contracts for incomplete capabilities.
11. The server sanitizes and validates the complete `ReportRecord`, writes it to Firestore, and returns it with `/reports/{id}`.
12. The WebMCP tool returns a compact JSON object. The React report renders the same stored result without recomputation.

### Archetype override lifecycle

1. The user selects a new archetype on a provisional report.
2. `POST /api/reports/:id/recompile` loads the stored observed evidence and pinned model version.
3. The server creates a new random child report with `parentReportId`, records the explicit override, recompiles graph/state/score/contracts, and returns a new URL.
4. The original report remains unchanged and shareable.

### Alpina sidecar lifecycle

1. The Alpina report displays current human, API/discovery, and WebMCP verification evidence.
2. The user activates the approved reference sidecar; the page registers `check-alpina-availability` through `document.modelContext`.
3. The agent supplies dates and guests. Missing required fields are surfaced by the JSON Schema before execution.
4. The browser calls the fixed server route. The server validates the request and calls the hard-coded Alpina endpoint.
5. On success, the server normalizes the result and creates a child report revision with invoked WebMCP sidecar evidence.
6. The tool returns the availability payload, source, expiry/revalidation warning, and updated report URL.
7. The new report renders availability as `sidecar-enabled`; it never claims a booking is confirmed.

## Components And Responsibilities

### `AuditOrchestrator`

Implements: `prd.md > Stories 1.1, 1.2, 2.1, 2.3, 3.1`

- Coordinates the three real product phases.
- Chooses live or fixture adapters from server configuration.
- Preserves partial evidence and typed phase errors.
- Never imports UI code or private provider response shapes.

### `ArchetypeInferer`

Implements: `prd.md > Stories 2.1, 2.2, 2.3`

- Loads versioned category and behavior weights.
- Produces primary archetype, ranked alternatives, confidence label, margin, evidence, and provisional reason.
- Accepts explicit override without modifying observed evidence.

### `ActionModelCompiler`

Implements: `prd.md > Stories 2.3, 4.1, 5.2`

- Validates model files at startup.
- Produces stable action order and expectation provenance.
- Keeps AOOE semantics internal while exporting understandable actions and contracts.

### `EvidenceEngine`

Implements: `prd.md > Stories 4.2, 4.3, 6.1, 6.3`

- Maps normalized evidence to actions and audiences.
- Keeps declaration, observation, invocation, and failure distinct.
- Produces conflicts instead of silently selecting a favorable conclusion.

### `ReportService`

Implements: `prd.md > Stories 7.1, 7.2`

- Creates immutable revisions and stable public URLs.
- Enforces report size and retention policy.
- Hides Firestore implementation from routes and domain code.

### `ActionJourney`

Implements: `prd.md > Stories 4.1, 4.2, 4.3`

- Renders the deterministic graph without physics or layout computation.
- Supports keyboard navigation, visible focus, state labels, and dialog return focus.
- Maintains context while detail is expanded.

### WebMCP tool components

Implements: `prd.md > Stories 1.1, 3.1, 5.2, 6.2`

- Register only when the backing UI/context is available.
- Use stable static descriptions and JSON Schemas.
- Convert typed API results into compact agent-oriented output.
- Abort registration on unmount and return truthful `isError` results.

## HTTP API Contracts

### `POST /api/reports`

Request:

```json
{
  "requestId": "4a8a04c0-e247-4bec-a440-d9f3506f9212",
  "url": "alpina.travel",
  "archetypeOverride": null,
  "fixtureId": null
}
```

Rules:

- `requestId` is a UUID and provides idempotency for a bounded retry.
- `archetypeOverride` is one of the six known values and is optional.
- `fixtureId` is accepted only when demo mode is enabled; production live mode rejects arbitrary fixture selection.

Responses:

- `200`: completed or partial `ReportRecord`.
- `202`: same `requestId` is already running; includes `reportId`, `phase`, and retry URL.
- `400`: invalid input.
- `403`: URL violates public-network policy.
- `429`: rate limit.
- `502/504`: no usable evidence could be produced from an upstream failure/timeout.

### `GET /api/reports/:reportId`

Returns the public, sanitized report revision. `404` covers unknown or expired IDs. There is no collection-list endpoint.

### `POST /api/reports/:reportId/recompile`

Request: `{ "archetype": "travel-hospitality" }`.

Returns a new completed report with `parentReportId`; underlying observed evidence is unchanged.

### `POST /api/reports/:reportId/reverify`

Reruns collection and creates a new child report. This is rate-limited as a full audit.

### `GET /api/reports/:reportId/contracts/:actionId`

Returns the JSON-LD action contract with `application/ld+json`, or `404` when the action is not in that report.

### `POST /api/sidecars/alpina/availability`

Request:

```json
{
  "reportId": "optional-parent-report-id",
  "propertyId": "samspitze-4",
  "checkIn": "2026-09-12",
  "checkOut": "2026-09-15",
  "adults": 2,
  "childrenAges": [],
  "currency": "EUR",
  "locale": "en"
}
```

Success:

```json
{
  "source": "https://alpina.travel/api/booking/availability",
  "available": true,
  "status": "available",
  "checkIn": "2026-09-12",
  "checkOut": "2026-09-15",
  "adults": 2,
  "childrenAges": [],
  "totalGuests": 2,
  "checkoutUrl": "https://booking-provider.example/...",
  "checkedAt": "2026-08-26T16:00:00Z",
  "expiresAt": "2026-08-26T16:05:00Z",
  "requiresRevalidation": true,
  "updatedReportUrl": "/reports/child-report-id"
}
```

The adapter forwards only allowlisted upstream fields. An upstream error returns a typed failure and creates no verification claim.

## WebMCP Tool Contracts

### `audit-website`

Description: “Analyze a public website from an AI agent's perspective and return its site archetype, verified action-readiness score, priority capability gaps, action-stage summary, and shareable evidence report.”

Input: `{ "url": "string", "archetype": "optional enum" }`.

Output object:

```json
{
  "reportId": "uuid",
  "canonicalUrl": "https://example.com/",
  "archetype": "travel-hospitality",
  "classificationConfidence": "high",
  "agentReadinessScore": 38,
  "foundationAuditScore": 71,
  "priorityGaps": [
    { "actionId": "travel.check-availability", "label": "Check availability", "state": "human-only", "reason": "..." }
  ],
  "stages": {
    "discover": { "ready": 1, "expected": 2 },
    "understandDecide": { "ready": 2, "expected": 4 },
    "act": { "ready": 0, "expected": 2 },
    "manage": { "ready": 0, "expected": 2 }
  },
  "reportUrl": "https://public-app.example/reports/uuid",
  "partial": false
}
```

The execution promise resolves only when a completed or explicitly partial report exists. “Audit started” is never the final successful result.

### `explain-capability`

Input: `{ "reportId": "uuid", "actionId": "string" }`.

Output: action expectation, aggregate state, separate human/agent support, bounded evidence, recommendation, contract URL, and inline governance summary.

### `check-alpina-availability`

Input mirrors the server sidecar schema without an upstream URL. It is annotated read-only. Output mirrors the normalized success payload and repeats that availability is time-sensitive and no booking has been created.

## External APIs And Dependencies

- [WebMCP Community Group draft](https://webmachinelearning.github.io/webmcp/) — current `document.modelContext` API, tool lifecycle, permissions policy, cancellation, and security considerations.
- [GoogleChromeLabs `use-webmcp-tool`](https://github.com/GoogleChromeLabs/use-webmcp-tool) — React registration helper maintained against the evolving draft.
- [GoogleChromeLabs WebMCP tools and inspector](https://github.com/GoogleChromeLabs/webmcp-tools) — demo inspection and evaluation utilities.
- [Google Natural Language content classification](https://cloud.google.com/natural-language/docs/classifying-text) and [V2 categories](https://cloud.google.com/natural-language/docs/categories) — multi-label content categories and confidences.
- [Cloud Firestore](https://firebase.google.com/docs/firestore) and [TTL policies](https://firebase.google.com/docs/firestore/ttl) — report persistence and expiry.
- [Cloud Run request timeout](https://cloud.google.com/run/docs/configuring/request-timeout) — synchronous audit runtime envelope.
- [React](https://react.dev/), [Vite](https://vite.dev/), [Express](https://expressjs.com/), [Zod](https://zod.dev/), and [Vitest](https://vitest.dev/) — application stack.
- [ScrapingBee documentation](https://www.scrapingbee.com/documentation/) — optional live rendered collection adapter.
- Private [WordLift AI Audit API reference](https://github.com/wordlift/ai-audit/blob/main/API.md) — authenticated 30–60 second foundation audit endpoint.
- [WordLift developer documentation](https://docs.wordlift.io/) — public WordLift integration context.
- [Alpina booking discovery](https://alpina.travel/.well-known/booking-agent.json), [OpenAPI](https://alpina.travel/api/booking/openapi.json), and [agent-readable service map](https://alpina.travel/llms.txt) — controlled availability sidecar source and policies.

## Configuration And Modes

### Live WordLift mode

```text
AUDIT_PROVIDER=wordlift
REPORT_STORE=firestore
SCRAPE_PROVIDER=scrapingbee
CLASSIFIER_PROVIDER=google-nlp
AI_AUDIT_BASE_URL=https://ai-audit-383880673216.us-west1.run.app
WORDLIFT_API_KEY=<secret>
SCRAPINGBEE_API_KEY=<secret>
PUBLIC_APP_URL=https://...
ACTION_MODEL_VERSION=0.1.0
```

Google credentials come from the Cloud Run service account, not an environment JSON key.

### Open demo mode

```text
AUDIT_PROVIDER=fixtures
REPORT_STORE=memory
SCRAPE_PROVIDER=fixtures
CLASSIFIER_PROVIDER=fixtures
PUBLIC_APP_URL=http://localhost:3000
ACTION_MODEL_VERSION=0.1.0
```

`npm run dev:demo` must work without WordLift, Google, Firestore, Gemini, or ScrapingBee credentials. Contributors can run every golden action-model test in this mode.

## AI Usage

### Runtime AI

- The private WordLift AI Audit service uses Gemini 2.5 Flash to analyze bounded website evidence and returns the established broad audit. This is an external provider behind `AuditProvider` and is disclosed in the README and submission.
- Google Natural Language classifies cleaned page content into the published V2 taxonomy.
- The public action compiler, archetype rule evaluation, evidence states, readiness score, priority ranking, action graph, contract generation, and chat-summary shape are deterministic code. They do not ask an LLM to invent capabilities or scores.
- ChatGPT/browser agents consume and invoke the WebMCP tools. The application supplies narrow schemas and structured results rather than relying on DOM guessing.

### Development AI

Codex is the primary implementation partner: architecture, model scaffolding, code, tests, fixture generation, documentation, and review. WordLift supplies product direction, private service access, reference architecture, brand review, deployment authority, and live verification. AI-generated implementation must pass the same test and review gates as human-written code.

## Security, Privacy, And Trust Boundaries

### Arbitrary URL safety

- Accept only HTTP and HTTPS; prefer HTTPS normalization.
- Reject embedded credentials, nonstandard schemes, localhost names, `.local`, private/link-local/loopback/reserved IP ranges, and cloud metadata endpoints.
- Resolve DNS before the request and revalidate the resolved IP and every redirect destination.
- Limit redirects, body bytes, total duration, content types, and discovery endpoints.
- Never forward browser cookies or authorization headers to the target site.

### Secrets and cost

- WordLift and ScrapingBee credentials remain server-side and are loaded from Secret Manager.
- Per-IP report limits and a global circuit breaker bound downstream cost.
- Logs contain report IDs, phases, timings, and sanitized hostnames, not credentials or complete target content.

### Prompt/tool injection

- Website content is untrusted data.
- Tool metadata is static and maintained in source.
- Evidence snippets are text-normalized, length-bounded, and never interpreted as instructions by the deterministic compiler.
- The private generative audit boundary is acknowledged; its outputs become claims requiring evidence mapping, not executable instructions.
- Tool outputs include `untrustedContentHint` where supported and never return raw page bodies.

### Public report privacy

- Reports contain evidence from public URLs only.
- Random IDs are capability-style share links; there is no search or list API.
- The UI warns that anyone with the URL can view the report.
- Reports expire after the configured period unless explicitly retained for judging.

### Side effects

- The MVP executes only read-only availability.
- Action contracts can describe transactional functions but must state authentication, authorization, confirmation, and side effects.
- No contract implies permission to execute.

## Error Strategy

### 1. Website or private audit failure

If one provider fails but usable evidence exists, complete a `partial` report, name the failed phase/provider in safe language, lower affected evidence to unknown/unverified, and offer reverification. With no meaningful evidence, return a typed failure and do not manufacture a graph-specific conclusion.

### 2. Classification failure or ambiguity

Use behavior-only rules, mark the archetype provisional, show missing evidence, and allow an override. Never silently convert an API error into confident `other`.

### 3. Long request or lost connection

Persist `running` before external calls. Reuse the UUID on the client's single retry. If the create request returns `202`, poll the report URL. A timeout records a failed phase when possible.

### 4. Firestore failure

Return the completed structured result to the current caller if compilation succeeded, but set `reportUrl` to null and state that sharing is temporarily unavailable. Do not claim a stable report was saved.

### 5. WebMCP unsupported or registration denied

The ordinary web UI remains functional. The report may show a small capability status for developers, but the executive result is not blocked. The demo checklist verifies Chrome origin-trial/testing setup in advance.

### 6. Alpina upstream failure

Return an explicit `upstream_unavailable`, `invalid_request`, or `no_availability` distinction. Do not turn transport failure into “not available,” and do not create sidecar verification evidence.

### 7. Oversized evidence

Apply deterministic truncation after preserving the highest-confidence action-relevant evidence. Set `evidenceTruncated=true` and disclose the limit in technical evidence.

## Risks And Verification

| Risk | Consequence | Mitigation | Verification checkpoint |
| --- | --- | --- | --- |
| WebMCP draft changes during the challenge | Tool registration breaks | Pin `use-webmcp-tool`, isolate it in three components, test against current `document.modelContext` | Inspector lists exact tools and schemas in demo Chrome |
| 30–60 second private audit | Agent/client timeout | 180-second Cloud Run timeout, persisted running record, UUID retry/poll path | Forced 70-second adapter test completes or recovers |
| Google classification varies | Non-reproducible archetype | Store exact categories; deterministic compilation from stored evidence; model version | Golden compile twice gives byte-equivalent action IDs/states |
| Arbitrary URL creates SSRF exposure | Infrastructure compromise | DNS/IP/redirect policy and strict fetch bounds | Unit suite covers IPv4, IPv6, rebinding-like redirects, metadata hosts |
| Declared interface mistaken for working | Inflated readiness | Verification-only score; declaration maps to unverified | Test manifest-only fixture scores no readiness points |
| Alpina already exposes an API | Misleading before/after story | Distinguish API discovery from current page WebMCP invocation; label dated baseline | Live report never says API is absent when discovery is reachable |
| Firestore document grows too large | Failed report persistence | Normalized evidence caps, no raw HTML, size assertion before write | Maximum fixture remains below configured serialized-size ceiling |
| Six archetypes dilute core demo | Incomplete vertical slice | Golden fixtures and compact templates; production adapter depth centered on travel | All six compile; Alpina alone requires live execution |
| Open repo depends on private API | Contributors cannot run it | Provider interfaces, deterministic fixture mode, documented adapter contract | Fresh clone passes `npm run dev:demo` and tests without secrets |
| Transactional contracts appear executable | Unsafe agent expectations | Governance fields, UI warnings, no transaction routes/tools | Contract tests require confirmation/side-effect fields where applicable |

## Test Plan

### Unit gates

- URL normalization and SSRF policy.
- Google category normalization and behavior-only fallback.
- Archetype weights, provisional thresholds, overrides, and deterministic tie-breaking.
- All six action-model files validate and compile.
- Evidence-to-state truth table.
- Verification-only score and stable top-three priority ranking.
- JSON-LD contract snapshot/schema validation.
- Evidence sanitization and size caps.
- Alpina input validation and normalized response mapping.

### Integration gates

- Private AI Audit fixture maps into the public evidence bundle.
- `POST /api/reports` is idempotent for one request UUID.
- Completed, partial, failed, missing, and expired report responses.
- Recompile and reverify create immutable child reports.
- Firestore adapter contract runs against emulator or a test project; memory adapter runs in CI.
- Alpina sidecar uses a mocked upstream in CI and an optional live read-only smoke test.

### Component and E2E gates

- Four stages and states remain readable without color.
- Keyboard user opens/closes action detail and returns to the selected node.
- Contract copy/download emits the stored JSON-LD.
- WebMCP tools register/unregister with component lifecycle and return `isError` on failure.
- Demo mode: enter fixture URL -> completed executive summary -> graph -> shareable report route.

### Manual submission gates

- Current Chrome configuration exposes `document.modelContext`.
- Inspector discovers the three tools in their correct page contexts.
- `audit-website` returns completed findings, not a start acknowledgment.
- A real Alpina availability call returns a time-stamped, read-only result.
- The resulting child report displays sidecar invocation evidence.
- Public repository, license, live URL, Devpost write-up, screenshots, and under-three-minute video all agree on what is live versus fixture-backed.

## Demo And Submission Flow

### Three-minute judge path

1. Start on the WordLift-branded landing page with the browser agent connected.
2. Ask: “Audit alpina.travel for its AI-agent capabilities.”
3. Show the returned travel/hospitality archetype, verified action-readiness score, top three gaps, four-stage counts, and report URL.
4. Open the report and show the classification evidence and deterministic action journey.
5. Open availability to show the human form, public API/discovery evidence, and the missing/unverified current-spec WebMCP execution proof.
6. Activate the approved reference sidecar and ask the agent to check a concrete date range for two adults.
7. Show the structured live result and its expiry/revalidation warning.
8. Open the child report showing successful sidecar evidence and the state transition.
9. Close on the action contract and the open-source extension points: the project maps what agents need, explains the gap, and proves one path to implementation.

### Required screenshots

- ChatGPT/browser-agent structured audit result.
- Executive summary plus classification.
- Full four-stage action journey.
- Expanded capability with human/agent evidence and JSON-LD contract.
- Alpina availability invocation and sidecar-enabled child report.
- Public repository README/action-model structure.

## Architecture Self-Review

### Finding 1: asynchronous infrastructure would be premature

Cloud Tasks would make disconnected execution more robust, but introduces queue provisioning, IAM, local emulation, retries, and another failure surface. The existing dependency normally finishes in 30–60 seconds and Cloud Run supports a longer request. The MVP uses a synchronous, idempotent request with persisted status; Cloud Tasks is the first post-hackathon scaling upgrade.

### Finding 2: arbitrary runtime WebMCP verification is outside this trust boundary

A server crawler cannot inspect a tool registered inside another origin's live `document.modelContext` without managed browser execution. The MVP treats static WebMCP evidence as declared/unverified and proves runtime verification only for its own controlled sidecar. This is more credible than claiming universal verification.

### Finding 3: the Alpina story must reflect today's implementation

Alpina now publishes booking discovery and an availability API. The product must not manufacture a “human-only” live baseline. The demo distinguishes raw/discovered API availability from browser-native WebMCP exposure and may use only a clearly dated fixture for the earlier snapshot.

### Finding 4: the ontology must stay behind the experience

The public action model and JSON-LD contract are necessary extension points, but the first screen remains archetype, score, gaps, and action journey. Terms such as AOOE, RDF, and ontology appear only in developer evidence and project documentation.

## Build Checklist Handoff

The checklist should sequence work around one continuously demonstrable vertical slice:

1. Scaffold the single-package React/Express application and fixture mode.
2. Define/validate shared report, evidence, capability, and contract schemas.
3. Ship action-model `0.1.0`, compiler, state derivation, score, priorities, and six golden fixtures.
4. Implement report API/store and the fixture-backed end-to-end report.
5. Build the executive summary, action journey, detail drawer, and contract viewer.
6. Register and verify `audit-website` and `explain-capability` with current WebMCP.
7. Add live WordLift/ScrapingBee/Google/Firestore adapters behind the same interfaces.
8. Build and verify the allowlisted Alpina sidecar and child-report evidence flow.
9. Harden URL safety, rate limits, error/partial states, accessibility, and deployment.
10. Run the judge flow, capture proof, make the repository public under the approved license, and prepare submission assets.

Every checklist task must name its automated or manual verification command. The build should pause after the fixture vertical slice, the first current-spec WebMCP invocation, the first live audit, and the Alpina sidecar proof so Andrea and the WordLift team can validate product truth before further polish.

# Build Notes

## Onboarding
- Date: 2026-08-26
- Guided rounds completed: 3
- Current next step: Scope

## Product Direction

### Mission
Serve the AI agents of CMOs, SEOs, GEOs, and site owners. A user should be able to enter a URL in a favorite chat—starting with ChatGPT—and let the application take it from there.

### Core Experience
1. Accept a website URL through a WebMCP-enabled chat interaction.
2. Run the existing breadth of AI Audit analysis through the private API and agent tools.
3. Return an executive summary with scores and prioritized indications.
4. Let the user expand every conclusion into technical evidence.
5. Put the site's supported actions and their readiness at the center of the result.

### Capability Map
The capability map is the future action layer of a WordLift knowledge graph: an ontology-ready description of what an AI agent can discover, understand, and safely do on a site.

The model should keep four concerns separate:

| Concern | Purpose | Initial values or examples |
|---|---|---|
| Intent class | What kind of user or agent goal the action serves | `informational`, `transactional`; allow `clarification_required` and `out_of_scope` in routing |
| Action | The concrete capability exposed by the site | Search, detail, compare, recommend, offer lookup, availability, policy/FAQ, create/update/complete/cancel checkout, order status |
| Governance | What is required before execution | `requires_agent`, `requires_confirmation`, access or payment policy |
| Evidence and maturity | How the audit knows the action exists and whether it is usable | Endpoint and method, URL, discovery document, OpenAPI, structured data, WebMCP tool, form, live test, confidence, maturity score |

This avoids treating “informational” as merely “not transactional” and preserves a clean evolution path into an agentic storefront. Commerce modes such as `transactional`, `inquiry_only`, and `publisher_access` can be layered over the underlying actions instead of replacing their intent classifications.

### Alignment with `wordlift/agentic-commerce`
The private Agentic Commerce reference classifies these informational patterns: product search, detail, comparison, recommendation, offer lookup, availability lookup, shipping policy, return policy, and FAQ/Q&A. Its transactional patterns cover creating, updating, completing, and cancelling checkout sessions plus order status. The capability model also needs execution-policy flags—especially agent and confirmation requirements—so an action's existence never implies that it may be performed autonomously.

## Architecture Boundary
- Existing private system: `wordlift/ai-audit`; source of the audit API, agent tools, established scoring coverage, architecture reference, and visual framework.
- New public system: a clean open-source WordLift repository containing the WebMCP-native application, public schemas and tool contracts, capability-map logic, UI integration, evidence model, tests, documentation, and deployable example.
- Existing Agentic Commerce reference: `wordlift/agentic-commerce`; source of taxonomy alignment and the natural evolution from capability mapping to ontology/KG-backed agentic storefronts.
- The public project must be a meaningful build made for the challenge, not a thin wrapper around proprietary services. The public repository should clearly document which parts are new, which external APIs it calls, and how contributors can extend or replace adapters.

## Product and Design Decisions
- Reuse the existing AI Audit visual language to preserve familiarity and speed implementation.
- Keep WordLift branding while offering documented extension points, open schemas, and an open-source license so others can build on the project.
- Prefer a layered result: concise executive summary first, expandable evidence second.
- Preserve the broad AI Audit assessment—SEO fundamentals, structured data, content/entity signals, JavaScript dependency, bot accessibility, agent files, forms, and WebMCP maturity—but organize the outcome around supported actions.
- Use Alpina.travel as an agent-proven test case and demo target, not as the whole project scope.

## Participant-Shaped Decisions
- “Our mission is to serve the AI Agent of CMOs, SEOs, GEOs and site owners.”
- “Enter the URL and we'll take it from there.”
- Keep the audit “central on the actions the site supports.”
- Present an “executive summary with expandable technical evidence.”
- Treat the capability map as “the action layer we will expose in the KG eventually.”
- Keep WordLift branding, while ensuring others can build on it.

## Open Questions for Scope
- Which minimum set of action classes must the hackathon MVP detect and score?
- Which WebMCP tools return structured results directly to ChatGPT, and which open detailed UI views?
- What evidence levels qualify a capability as declared, discoverable, invocable, verified, or agent-ready?
- What contribution boundary makes the public app useful without access to WordLift's private audit backend?
- Which parts of the existing score remain global, and which become action-specific readiness scores?

## Scope
- Date completed: 2026-08-26
- Scope interview: mandatory beats plus 1 deepening round
- Approved implementation budget: six focused build days through 2026-09-02
- Repository: `wordlift/ai-audit-webmcp`; created as an empty private repository and must become public with an approved open-source license before submission.
- Execution authorization: Andrea approved Codex committing implementation work to the repository once the guided PRD, spec, and checklist establish the verified build sequence.
- Next step: PRD

### Confirmed Scope Decisions
- The product classifies the site's content using the Google Natural Language taxonomy, then separately infers its operating archetype from content, structured data, and behavioral evidence.
- Initial archetypes: commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, and other.
- The system infers the expected action graph for the archetype and compares each action's human-facing support with its agent-facing support.
- The main interface is a deterministic action journey, not a decorative force-directed graph: discover → understand/decide → act → manage.
- The existing AI Audit look and feel is reused, but the action graph provides the new visual and conceptual center required for the wow effect.
- Every missing or human-only agent capability receives an ontology-backed, machine-readable action contract.
- AOOE governs internal action semantics, constraints, and future KG compatibility; the user sees a capability map and implementation help, not an ontology product.
- The required vertical slice produces contracts broadly and implements one controlled sidecar capability for Alpina.travel availability.
- The sidecar wraps an approved endpoint or handler; arbitrary page automation and a universal reverse proxy are explicitly deferred.

### Active Shaping Moments
- Andrea sharpened the thesis: “What excites me is to help people think websites are dead and AI agents need functions—like they need knowledge and not web pages.”
- He redirected the ontology framing: remember AOOE internally, while remembering that the user is “not looking for an ontology in the first place but for a capability map and help in getting there.”
- He chose the action graph as the primary visual because it creates the route through which the ontology can later enter the system.
- He expanded the audit from diagnosis to enablement: the contract should make it possible to map existing human functionality into a sidecar, following the Agentic Commerce pattern.
- The agreed scope cut keeps contract generation general but limits the working proxy implementation to one safe, controlled reference capability.

### Deferred By Name
- Universal reverse-proxy generation: too broad and unsafe for a six-day sprint.
- Arbitrary form and browser automation: brittle and outside the approved trust boundary.
- Full booking/payment workflow: governance, confirmation, and payment scope would weaken the core demo.
- Production KG persistence and a user-facing ontology editor: valuable evolution, not required to prove the capability-map thesis.
- Full agentic storefront: positioned as the natural next phase after the action graph and contract layer.

## PRD
- Date completed: 2026-08-26
- PRD interview: mandatory beats, no additional deepening round requested
- Next step: Technical spec

### Confirmed User-Experience Decisions
- ChatGPT returns the primary archetype, readiness score, three priority gaps, compact action summary, and a link to the full visual report.
- The result is written from the perspective of an AI agent without overwhelming the human reviewing it.
- The audit starts from the URL without setup and visibly progresses through understanding, mapping, and checking.
- The report uses one primary archetype, secondary Google categories, and a deterministic versioned action model compiled initially from archetype and category rules.
- Low-confidence classification is provisional and can be regenerated using a user-selected archetype without changing observed evidence.
- Capability evidence can be agent-ready, human-only, unverified, missing, not expected, or sidecar-enabled.
- A blocked or unreachable site receives an honest partial report only when evidence exists; the product never fabricates support.
- A site with no agent functions still receives the complete expected graph; the absence becomes the core finding rather than an empty state.
- Reports receive stable, account-free URLs so judges and users can revisit and share them.
- WordLift branding and one restrained `wordlift.io` call to action are present without gating the audit.

### User Stories Captured
- Site owner: submit a URL and understand the site from an agent's perspective.
- CMO/SEO/GEO: see the deterministic expected action journey and human-versus-agent gap.
- Developer: open a missing action and obtain a plain-language recommendation plus machine-readable contract.
- Judge/user: watch one human-only capability become agent-ready through a real WebMCP sidecar and invoke it in ChatGPT.

### Active Shaping Moments
- Andrea required the result to be “from the perspective of an AI Agent” while recognizing that “we're still dealing with a human at that point.” This became the progressive-disclosure principle.
- He clarified that the action model must be deterministic, iterative, and evolvable over time, compiled initially from the site archetype plus Google's category system.
- He delegated the report-lifecycle decision based on the goal of winning the hackathon; the selected behavior is a shareable, no-account report optimized for judge access and demo evidence.

### PRD Scope Guard
- The PRD specifies templates for all six archetypes but requires one working sidecar adapter.
- Manual archetype correction is included; blended multi-archetype graphs are deferred.
- Anonymous report sharing is included; user accounts, workspaces, collaboration, and long-term history are deferred.
- Availability lookup is executable; booking, payment, application, and claims remain contract-only.

## Technical Spec
- Date completed: 2026-08-26
- Spec interview: mandatory beats completed, followed by an architecture proposal and participant approval; no additional question round requested.
- Stack confirmed: React 19, TypeScript, Vite, Express/Node, Google Cloud Run, and Firestore, aligned with the existing private AI Audit application.
- Provider boundary confirmed: the private AI Audit API is stable and documented; the public application supports live WordLift adapters and deterministic open demo fixtures.
- Next step: Build checklist

### Confirmed Architecture Decisions
- Use one TypeScript package and one Cloud Run service for the React application and Express API; avoid monorepo and queue infrastructure during the six-day build.
- Keep the 30–60 second audit synchronous, with a 180-second Cloud Run timeout, a persisted `running` report, client-generated UUID idempotency, and a GET recovery path.
- Use the current WebMCP surface, `document.modelContext.registerTool`, through the Chrome-maintained `use-webmcp-tool` React helper. Do not copy the older `navigator.modelContext` implementation.
- Expose three focused tools: `audit-website`, report-scoped `explain-capability`, and the controlled `check-alpina-availability` sidecar.
- Make the agent-capability score verification-only. Declared or detected interfaces remain unverified and cannot inflate readiness until invocation succeeds.
- Present the existing broad AI Audit score separately as the foundation score rather than blending it into action readiness.
- Store immutable anonymous report revisions in Firestore. Archetype overrides and reverification create child reports so shared findings never silently change.
- Use Google Natural Language V2 for content categories, then infer the operating archetype deterministically from stored categories plus structured/behavioral evidence.
- Keep the action ontology in versioned data and compile JSON-LD contracts deterministically. The human experience remains a capability map, not an ontology editor.
- Use CSS grid for the ordered four-stage action journey; no graph-layout dependency.
- Publish under Apache-2.0 subject to WordLift's final approval before the repository becomes public.

### Open-Source Boundary
- Live mode calls the private WordLift audit with a server-side key, collects public evidence, uses Google classification, and persists reports to Firestore.
- Open demo mode runs all six archetypes, the compiler, the UI, and tests from deterministic fixtures without WordLift, Google, Gemini, Firestore, or ScrapingBee credentials.
- Public schemas, action-model files, evidence rules, scoring, contracts, UI, WebMCP tools, sidecar, and tests are new hackathon work.

### Architecture Self-Review And Scope Corrections
- Async job infrastructure was rejected for the MVP because the existing request fits inside Cloud Run's request envelope; Cloud Tasks is a post-hackathon upgrade if audit duration or traffic increases.
- Arbitrary runtime WebMCP verification is not claimed. A crawler can detect static declarations, but only a controlled page context can prove a live `document.modelContext` invocation in this build.
- Alpina.travel already publishes booking discovery and a public availability API. The live report must not falsely label the API as absent or purely human-only. The demo shows the transition from human/API evidence with current WebMCP runtime unverified to a successfully invoked, sidecar-enabled browser tool. Any earlier human-only fixture must be visibly dated and labeled as a captured baseline.
- Raw HTML, complete prompts, secrets, cookies, and private account identifiers are excluded from stored reports; normalized evidence is bounded by count and snippet length.

### Active Shaping Moments
- Andrea confirmed “we can use the same stack” and that Firestore can be made available, which removed the need to introduce unfamiliar infrastructure.
- He confirmed the existing API is stable and directed the spec to the repository and WordLift documentation, allowing the private system to remain a provider rather than a rewrite target.
- He approved both live WordLift mode and an open deterministic demo mode, preserving a credible open-source project even for contributors without WordLift credentials.
- After reviewing the proposed architecture and data flow, Andrea said “go ahead,” authorizing the exact API, file-structure, failure, and verification decisions recorded in `spec.md`.

## Build Checklist
- Date completed: 2026-08-26
- Checklist ownership: handed off to Codex after participant review.
- Checklist size: 12 sequenced implementation items across six focused build days.
- Build mode: autonomous, locked when Andrea said “Go into build.”
- Git cadence: one verified commit after each completed checklist item.
- Check-in cadence: speed-run between four participant product-proof pauses.
- Next step: Build project

### Verification Pauses
1. After the complete fixture-backed capability-map vertical slice.
2. After the first current-spec WebMCP invocation.
3. After the first live WordLift/Google/Firestore audit.
4. After the Alpina.travel sidecar transformation and child-report proof.

### Submission Plan
- Wow moment: the system understands the site, maps what an agent should be able to do, and turns one capability gap into a working WebMCP function.
- Required proof: structured agent result, classification, four-stage action map, evidence/contract detail, live Alpina availability invocation, sidecar-enabled child report, and public repository structure.
- Final checklist item gathers the story, screenshots, repository/deployment links, test evidence, setup instructions, AI/Codex disclosure, and known limitations for `$prepare-submission`.

### Active Shaping Moments
- Andrea accepted the recommended autonomous mode with commits after every item and four high-value review pauses rather than continuous tutorial-style checks.
- He approved the 12-item sequence and explicitly directed Codex to “Go into build.”

## Build Execution

### Item 1 — Public application and build gates
- Completed: 2026-08-27
- Added the React 19, TypeScript, Vite, and Express single-package foundation; WordLift-branded landing shell; `/api/health`; Docker build; strict type checking; Vitest, Testing Library, Supertest, and Playwright setup; Apache-2.0 license; environment template; and GitHub Actions verification.
- Verification passed: `npm ci`, `npm run typecheck`, `npm test -- --run` (2 tests), and `npm run build`.
- The health contract passed through Supertest and confirms the framework header is suppressed.
- Remote repository inspection before publication reported an empty Git repository, confirming that no earlier implementation commit existed.
- Next checklist item: shared schemas, validated configuration, and memory/Firestore report stores.

### Item 2 — Shared contracts, configuration, and report stores
- Completed: 2026-08-27
- Added strict Zod schemas and inferred TypeScript types for classification, evidence, capabilities, readiness scores, priorities, errors, reports, action contracts, and report API inputs.
- Added validated live/demo environment configuration with conditional secret requirements.
- Added an immutable `ReportStore` boundary with defensive in-memory storage and a server-only Firestore adapter using create-only writes and transactions for child revisions.
- Enforced report expiry, UUID identity, a 100-item evidence ceiling, 500-character evidence snippets, strict unknown-field rejection, and a configurable serialized-size ceiling below Firestore's document limit.
- Verification passed: typecheck, 8 focused schema/store tests including a mocked Firestore contract, production build, and whitespace check.
- Next checklist item: compile action-model `0.1.0` for all six site archetypes.

### Item 3 — Deterministic action model 0.1.0
- Completed: 2026-08-27
- Added versioned model data: manifest, provisional JSON-LD context, 24 reusable governed actions, six compact archetype journeys, Google V2 category weights, behavior rules, and evidence mappings.
- Added strict startup validation, deterministic four-stage graph compilation, stable action order/IDs, expectation provenance, and category-plus-behavior archetype inference with explicit overrides.
- Low-evidence and low-margin classification is provisional; an override changes expectations while preserving ranked observed evidence.
- Verification passed: typecheck, 11 focused model/inference/golden tests, six stored golden snapshots, production build, and whitespace check.
- Next checklist item: evidence state derivation, verification-only scoring, deterministic priorities, and JSON-LD contracts.

### Item 4 — Evidence states, verified scoring, priorities, and contracts
- Completed: 2026-08-27
- Added the ordered six-state truth table, keeping human observation, agent declaration, successful invocation, failed invocation, and approved sidecar evidence distinct.
- Readiness is strictly verification-only; declarations and detected interfaces remain unverified and add zero points.
- Added deterministic gap ranking and plain-language recommendations, resolving ties with model display order and stable action IDs.
- Added deterministic Schema.org/WordLift JSON-LD capability contracts with inputs, outputs, governance, provenance, and delivery guidance. Transactional actions require authorization, explicit confirmation, and declared side effects.
- Verification passed: typecheck, 10 focused state/score/priority/contract tests, offline JSON-LD expansion for every generated contract, production build, and whitespace check.
- Next checklist item: fixture providers, report orchestration, immutable report APIs, and contract downloads.

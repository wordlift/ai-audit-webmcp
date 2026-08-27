# Build Checklist

Status: Approved on 2026-08-26. Autonomous build mode is locked.

## Build Preferences

- **Build mode:** Autonomous. Codex executes the checklist in order; this choice locks when `$build-project` starts.
- **Plan ownership:** Codex-designed from the approved PRD and technical spec.
- **Comprehension checks:** N/A. Andrea receives product-proof reviews rather than tutorial checks.
- **Git:** Commit after every accepted checklist item, using one focused commit as a revert point. Preserve unrelated work and never commit credentials, local environment files, or private API payloads.
- **Verification:** Yes. Every item must pass its named automated checks; live behavior also receives a manual proof where specified.
- **Verification pauses:** Yes, after items 6, 7, 9, and 10. These pauses are mandatory product-truth checks: fixture vertical slice, first current-spec WebMCP invocation, first live audit, and Alpina sidecar transformation.
- **Check-in cadence:** Speed-run between the four verification pauses. Report blockers immediately; otherwise continue autonomously.
- **Timebox:** Six focused build days through 2026-09-02, with item 12 and the final half-day protected for submission proof and recovery.
- **Wow moment:** The system understands the site, maps what an agent should be able to do, and turns one capability gap into a working WebMCP function.

## Sequencing Logic

Build the deterministic core before external integrations, then prove the full fixture experience before connecting paid/private services. Test the evolving WebMCP API immediately after the vertical slice so there is time to pivot. Add arbitrary-URL protections before enabling live collection. Bring the Alpina sidecar online only after the general live audit works, and preserve the last build window for deployment and submission evidence.

Suggested six-day allocation:

- **Day 1:** Items 1–2 — repository, stack, contracts, stores.
- **Day 2:** Items 3–4 — action model, evidence states, scoring, contracts.
- **Day 3:** Items 5–7 — fixture report, visual experience, first WebMCP proof.
- **Day 4:** Items 8–9 — safety boundary and first live audit.
- **Day 5:** Items 10–11 — Alpina transformation, deployment, public documentation.
- **Day 6:** Item 12 plus recovery buffer — proof capture and Devpost handoff.

## Prerequisites For Live Items

These are not required for items 1–8 or for the open demo mode:

- Access to the private `wordlift/ai-audit` endpoint and a valid server-side WordLift key.
- ScrapingBee key for rendered collection.
- Google Cloud project/service account with Natural Language and Firestore access.
- Cloud Run deployment authority and a public application URL.
- Chrome environment with current WebMCP origin-trial/testing support for manual verification.

## Checklist

- [x] **1. Initialize the public application and build gates**
  Spec ref: `spec.md > Stack`, `spec.md > File Structure`
  What to build: Initialize `wordlift/ai-audit-webmcp` as the single-package React 19 + TypeScript + Vite + Express application. Add strict TypeScript configuration, client/server development scripts, production build, Dockerfile, `.env.example`, Apache-2.0 license, initial WordLift design tokens, Vitest/Testing Library/Supertest/Playwright setup, and CI running typecheck, unit tests, and build. Do not copy proprietary source from the private repository.
  Acceptance: A fresh checkout installs reproducibly, serves a branded landing shell and `/api/health`, builds browser and server artifacts, and contains no secrets. The README states that this repository is new hackathon work and identifies the private service as an optional provider.
  Verify: Run `npm ci && npm run typecheck && npm test -- --run && npm run build`; start the production server and check `GET /api/health`; inspect `git diff --check`. Commit as `chore: bootstrap AI Audit WebMCP app`.

- [x] **2. Define shared contracts, configuration, and report stores**
  Spec ref: `spec.md > Report store`, `spec.md > HTTP API Contracts`, `spec.md > Configuration And Modes`
  What to build: Create Zod schemas and inferred TypeScript types for reports, classification, evidence, capability results, scores, priorities, errors, action contracts, and API requests/responses. Add validated environment configuration, `ReportStore` interface, in-memory implementation, Firestore implementation, immutable child-report revisions, expiration fields, and serialized-size/evidence caps.
  Acceptance: Invalid stored/API shapes fail closed; memory mode works without cloud credentials; Firestore is server-only; recompile/reverify can create child records without modifying the parent; raw HTML, headers, credentials, and private account identifiers are excluded by schema.
  Verify: Run `npm test -- --run tests/unit/schemas.test.ts tests/integration/report-store.test.ts`; validate the Firestore adapter against the emulator or mocked contract; assert the maximum fixture stays below the configured size ceiling. Commit as `feat: define report contracts and stores`.

- [x] **3. Compile action-model 0.1.0 for all six archetypes**
  Spec ref: `spec.md > Versioned action model`, `spec.md > Content classifier and archetype inferer`
  What to build: Add the versioned action definitions, JSON-LD context, archetype templates for commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, and other, Google V2 category weights, behavioral rules, and deterministic compiler. Produce stable stage/order, expectation provenance, ranked archetypes, provisional reasons, and explicit user overrides from stored evidence.
  Acceptance: Every archetype compiles into a readable Discover -> Understand/Decide -> Act -> Manage journey; identical inputs and model version produce identical action IDs/order; low-score or low-margin classification is provisional; overrides change expectations without changing observed evidence.
  Verify: Run `npm test -- --run tests/unit/action-model.test.ts tests/unit/archetype-inference.test.ts tests/golden/archetypes.test.ts`; inspect golden outputs for all six archetypes and confirm no template exceeds the agreed first-view density. Commit as `feat: add deterministic action model`.

- [x] **4. Implement evidence states, verified scoring, priorities, and JSON-LD contracts**
  Spec ref: `spec.md > Evidence engine and state derivation`, `spec.md > Scoring and prioritization`, `spec.md > Action contract compiler`
  What to build: Implement typed evidence mapping, human/agent separation, the six aggregate states, conflict handling, verification-only readiness scoring, deterministic top-three ranking, plain-language recommendations, and versioned JSON-LD contract generation with governance and provenance.
  Acceptance: Declarations without successful invocation remain unverified and add zero readiness points; sidecar-enabled requires successful controlled invocation; ties resolve deterministically; incomplete expected actions receive readable recommendations and valid contracts; transactional contracts always declare authorization, confirmation, and side effects.
  Verify: Run `npm test -- --run tests/unit/derive-state.test.ts tests/unit/score-readiness.test.ts tests/unit/rank-priorities.test.ts tests/unit/compile-contract.test.ts`; parse every generated contract as JSON-LD and snapshot the state truth table. Commit as `feat: score and contract agent capabilities`.

- [x] **5. Deliver the fixture-backed report API**
  Spec ref: `spec.md > Report API and orchestrator`, `spec.md > HTTP API Contracts`, `spec.md > Primary lifecycle: URL to report`
  What to build: Add fixture audit, scrape, and classifier providers; create representative sanitized evidence fixtures for all six archetypes; implement the three-phase orchestrator and report routes for create, get, recompile, reverify, and contract download. Support client UUID idempotency, running/completed/partial/failed phases, and public immutable report URLs in memory mode.
  Acceptance: Demo mode needs no external credentials; every fixture URL returns a completed deterministic report; a repeated request UUID does not duplicate work; partial and failed fixtures remain honest; archetype override produces a child report; contracts download as `application/ld+json`.
  Verify: Run `npm test -- --run tests/integration/reports-api.test.ts tests/integration/fixture-providers.test.ts`; run `npm run dev:demo`, submit each archetype fixture, and compare action IDs/scores with golden results. Commit as `feat: add fixture report orchestration`.

- [x] **6. Build the complete visual capability-map vertical slice — REVIEW PAUSE 1**
  Spec ref: `spec.md > React application shell`, `spec.md > ActionJourney`, `spec.md > Demo And Submission Flow`
  What to build: Implement the URL entry and phase UI, executive summary, separate foundation/readiness scores, classification card and override, deterministic four-stage action journey, accessible state legend, action detail dialog, human-versus-agent evidence, recommendations, contract viewer/copy/download, share control, expired/missing/partial states, WordLift branding, and restrained `wordlift.io` CTA.
  Acceptance: A user can enter one fixture URL and reach a polished shareable report without authentication; the first view communicates archetype, score, exactly three real gaps when available, and the journey; color is never the only state signal; a keyboard user can inspect a capability and return to its node; no ontology terminology overwhelms the executive view.
  Verify: Run `npm test -- --run tests/component` locally, then run `npm run test:e2e -- --grep "fixture report|visual proof"` in GitHub Actions when the local workspace cannot install Chromium; capture desktop and mobile screenshots for the travel fixture as workflow artifacts. Pause for Andrea to review the first complete product slice before proceeding. After approval, commit as `feat: render the agent capability map`.

- [ ] **7. Register and prove the current WebMCP audit tools — REVIEW PAUSE 2**
  Spec ref: `spec.md > WebMCP tool layer`, `spec.md > WebMCP Tool Contracts`
  What to build: Integrate the pinned Chrome-maintained `use-webmcp-tool` helper and register `audit-website` globally plus report-scoped `explain-capability` on `document.modelContext`. Add static safe descriptions, JSON Schemas, lifecycle cancellation, unsupported-browser degradation, typed error normalization, and completed structured results containing report URL and stage counts.
  Acceptance: The tool list follows the visible page context; unmount unregisters report-scoped tools; failures are returned as errors; `audit-website` resolves to completed or explicitly partial findings and never ends with only “audit started”; the normal web interface still works without WebMCP.
  Verify: Run `npm test -- --run tests/component/webmcp-tools.test.tsx`; run `npm run test:webmcp` with the project stub; in the configured Chrome environment, confirm the inspector shows the correct tools and invoke `audit-website` against a fixture. Pause for Andrea to inspect the first agent-driven result. After approval, commit as `feat: expose audit tools through WebMCP`.

- [ ] **8. Harden arbitrary URL collection and recovery paths**
  Spec ref: `spec.md > Security, Privacy, And Trust Boundaries`, `spec.md > Error Strategy`
  What to build: Implement URL normalization, HTTP/HTTPS enforcement, credential/scheme rejection, DNS and IP validation, private/reserved/metadata blocking, redirect revalidation, response/endpoint/time limits, evidence sanitization, per-IP/global rate limits, UUID retry/poll recovery, safe logging, and truthful partial/failure behavior. Add static discovery collectors and detector boundaries without attempting arbitrary runtime tool execution.
  Acceptance: Unsafe destinations never reach a provider; target cookies and authorization are never forwarded; oversized/untrusted evidence is bounded and marked truncated; a manifest-only tool remains unverified; disconnected or duplicate clients can recover the stored state; logs do not expose target content or secrets.
  Verify: Run `npm test -- --run tests/unit/url-policy.test.ts tests/unit/sanitize-evidence.test.ts tests/integration/error-paths.test.ts tests/integration/rate-limits.test.ts`; inspect adversarial IPv4/IPv6/redirect cases and `git diff --check`. Commit as `feat: secure live site collection`.

- [ ] **9. Connect live WordLift, scraping, Google classification, and Firestore — REVIEW PAUSE 3**
  Spec ref: `spec.md > Private AI Audit adapter`, `spec.md > Site evidence collector`, `spec.md > Content classifier and archetype inferer`, `spec.md > Report store`
  What to build: Implement and validate the WordLift AI Audit provider, ScrapingBee and native-fetch collectors, Google Natural Language V2 classifier, Firestore persistence, phase-specific timeouts, and provider error mapping behind the existing interfaces. Keep the broad foundation score separate from verified action readiness.
  Acceptance: Live mode audits a permitted public URL using only server-side credentials; stores exact Google category strings/confidences and model metadata; compiles the same domain objects as fixture mode; a Google failure produces provisional behavior-only classification; a Firestore failure returns the current structured result without claiming a stable share link.
  Verify: Run `npm test -- --run tests/integration/wordlift-audit.test.ts tests/integration/google-classifier.test.ts tests/integration/live-orchestrator.test.ts`; run `npm run smoke:live -- https://wordlift.io` with configured secrets and open the stored report. Pause for Andrea/WordLift to validate the first live evidence, classification, and action map. After approval, commit as `feat: connect live audit providers`.

- [ ] **10. Prove the Alpina availability sidecar transformation — REVIEW PAUSE 4**
  Spec ref: `spec.md > Alpina.travel sidecar`, `spec.md > Alpina sidecar lifecycle`
  What to build: Add the allowlisted server adapter for `https://alpina.travel/api/booking/availability`, date/guest validation, normalized output, read-only policy, report-scoped sidecar activation, `check-alpina-availability` WebMCP registration, successful-invocation evidence, and immutable child report creation. Add a clearly dated baseline fixture without misrepresenting the current live API/discovery surface.
  Acceptance: The agent requests missing required inputs rather than fabricating them; a live call returns structured time-sensitive availability and source; no booking session, hold, guest submission, or payment occurs; upstream failure is not reported as no availability; successful invocation produces a child report marked `sidecar-enabled`; the live baseline acknowledges existing Alpina API/discovery evidence.
  Verify: Run `npm test -- --run tests/unit/alpina-schemas.test.ts tests/integration/alpina-sidecar.test.ts tests/component/alpina-webmcp-tool.test.tsx`; invoke the live read-only tool in Chrome for a valid date range and open the child report. Pause for Andrea to validate the before/after truth, action evidence, and wow moment. After approval, commit as `feat: enable Alpina availability sidecar`.

- [ ] **11. Deploy, verify, and document the public project**
  Spec ref: `spec.md > Deployment`, `spec.md > Test Plan`, `spec.md > Configuration And Modes`
  What to build: Complete Cloud Run configuration, Secret Manager bindings, Firestore TTL/index configuration, health/startup behavior, production headers including WebMCP permissions policy, public URL configuration, CI verification, accessibility/responsive polish, README architecture and extension guides, CONTRIBUTING, SECURITY, fixture instructions, private/public boundary, and live/demo disclosures. Make the repository public only after secret/history inspection and WordLift license/brand approval.
  Acceptance: `npm run dev:demo` works from a fresh clone without secrets; CI is green; the production URL serves the application and stable judge report; secrets are absent from source, history, client bundles, logs, and fixtures; contributors can identify how to add an archetype/action/detector/sidecar; the README distinguishes live functionality from fixtures and pre-existing private work.
  Verify: Run `npm run verify`, `npm audit --omit=dev`, `docker build -t ai-audit-webmcp .`, secret scanning, and the production smoke suite; inspect Cloud Run health, report persistence, browser console, mobile layout, WebMCP inspector, repository visibility, and license. Commit as `chore: deploy and document public MVP`.

- [ ] **12. Prepare Devpost handoff**
  Spec ref: `prd.md > Submission Proof Points`, `spec.md > Demo And Submission Flow`
  What to build: Gather the final project story, public repository and deployment links, architecture/open-source boundary, AI and Codex usage notes, exact judge setup, test results, known limitations, five required screenshots, and an under-three-minute demo script/video plan. Record the four participant review outcomes and the specific new hackathon work.
  Acceptance: A judge can reproduce the fixture audit and Alpina read-only WebMCP invocation; every screenshot and claim matches the deployed build; live versus fixture evidence is explicit; the handoff contains enough verified material to run `$prepare-submission` without reconstructing the build history.
  Verify: Execute the three-minute judge path once from a clean browser session, verify every public link, review the handoff folder with Andrea, and confirm the next command is `$prepare-submission`. Commit as `docs: prepare Devpost submission handoff`.

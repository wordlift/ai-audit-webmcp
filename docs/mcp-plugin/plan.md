# Remote MCP server and the public AI Audit plugin

Status: planned on 2026-09-04. Not built yet; the checklist below is the build order.

Today the audit is reachable three ways: a person opens a report in the browser, an agent in that
browser calls the WebMCP tools, and a program calls the REST API. All three require the page or the
API. This adds a fourth: a Streamable HTTP MCP server at `https://beta.audit.wordlift.io/mcp`, so an
agent that never opens the site can audit a URL, read the findings, and walk a human through refining
the Terms of Action — and a public plugin that packages that endpoint with the skill that knows the
workflow.

## Target architecture

- Keep the existing browser WebMCP tools exactly as they are.
- Mount a Streamable HTTP MCP server at `/mcp` in the existing Express service on Cloud Run.
- Have REST, WebMCP, and MCP call the same application services and report store. No surface calls
  another surface over HTTP.
- Package one public plugin under `plugins/ai-audit/`.
- Ship a skill that guides the full audit → inspect → interview → confirm → refine workflow.
- Keep the whole thing free. The basic scan — four representative pages — asks for nothing. Going
  deeper asks for an email address, and the finished report is sent to it.
- Leave `check-alpina-availability` out of the public plugin's first version. It is the sidecar demo,
  not part of the general AI Audit product.

## Public MCP tool set

| Tool | Public behavior | Key annotation |
| --- | --- | --- |
| `audit-website` | Start an audit and return either the finished result or a pollable report id | `readOnlyHint: false` |
| `get-audit-report` | Retrieve status and findings | `readOnlyHint: true` |
| `explain-capability` | Explain evidence, gaps, and the recommendation for one action | `readOnlyHint: true` |
| `explain-foundation-audit` | Explain foundation-level findings | `readOnlyHint: true` |
| `inspect-terms-of-action` | Retrieve the current Terms of Action | `readOnlyHint: true` |
| `refine-terms-of-action` | Create an immutable human-refined child report | `readOnlyHint: false` |

Over MCP there is no open page, so every report-scoped tool requires an explicit `reportId`. In the
browser the same tools may keep it optional: the visible report supplies the scope.

`audit-website` gains a `depth` input. `basic` is the default and needs nothing; `deep` needs an
`email`, which is what the deeper crawl is exchanged for and where the report is sent. An agent must
ask the person for that address rather than inferring one, and the address is never written into the
report record — a report is public and carries no private identifier.

The deprecated `inspect-service-map` and `refine-service-map` aliases stay registered in the browser,
where callers wrote the old names down. MCP is a new surface with no legacy callers and publishes the
canonical names only.

## Checklist

- [x] **1. Extract shared tool contracts**
  Spec ref: `src/shared/tools/definitions.ts` (was `src/client/webmcp/toolSchemas.ts`), `src/shared/format/agentSummary.ts`, AGENTS.md > Frozen.
  What to build: Move the names, descriptions, input schemas, result types, and error types into
  `src/shared/tools/`, leaving compatibility exports where the WebMCP module publishes them today.
  Allow transport-specific differences — a mandatory MCP `reportId`, an optional browser one — without
  forking a second copy of a description.
  Acceptance: Tool identifiers and WebMCP behavior are unchanged; a description exists once and both
  surfaces read it from the same constant.
  Verify: `npm run verify && npm run test:webmcp`. Commit as `refactor: give both surfaces one tool contract`.

- [x] **2. Create a transport-independent tool service**
  Spec ref: `src/server/services/AuditOrchestrator.ts`, `src/server/routes/reports.ts`, `src/shared/format/agentSummary.ts`.
  What to build: An application service that implements audit, report retrieval, explanation,
  inspection, and refinement over the orchestrator and the report store. REST, WebMCP, and MCP become
  adapters that call it, rather than three places that each rebuild the same result.
  Acceptance: The same inputs produce the same structured result through REST and through the service;
  no adapter makes an internal HTTP call to another adapter.
  Verify: Add service-level tests, then `npm run verify`. Commit as `feat: serve every surface from one audit service`.

- [x] **3. Add the MCP server**
  Spec ref: [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server).
  What to build: Add `@modelcontextprotocol/sdk`, construct an `McpServer`, register the AI Audit
  tools against the service from item 2, and mount Streamable HTTP at `/mcp` — before the static
  handler and the SPA `*` fallback in `src/server/app.ts`, which would otherwise answer first.
  Acceptance: Initialization, `tools/list`, and `tools/call` work locally; an audit that outlives the
  request returns a durable report id the caller can poll rather than a dropped connection.
  Verify: MCP Inspector against a local server, plus automated initialize/list/call integration tests.
  Commit as `feat: answer the audit tools over MCP`.

- [x] **4. Correct tool safety metadata**
  Spec ref: OpenAI plugin review requirements; current annotations in `src/shared/tools/definitions.ts`.
  What to build: Declare accurate `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
  `audit-website` and `refine-terms-of-action` create stored reports and are write operations;
  `audit-website` currently claims `readOnlyHint: true`, which was true of its answer and never of its
  effect. Keep `untrustedContentHint` on everything that carries website evidence.
  Acceptance: No tool that creates a report is described as read-only; annotations are static and never
  incorporate audited-site content.
  Verify: Snapshot-test every MCP tool definition and its annotations. Commit as `fix: describe the audit tools' real effects`.

- [x] **5. Gate depth behind an email, and send the report to it**
  Spec ref: `MAX_PAGES` in `src/server/adapters/scrape/NativeFetch.ts`, `src/server/adapters/scrape/ScrapingBee.ts`, AGENTS.md > Never.
  What to build: Make scan depth an explicit input rather than a constant. `basic` stays what runs
  today — four representative pages, free, anonymous, unchanged for every existing caller. `deep` reads
  more of the site and requires an email address, which buys the depth and receives the finished report.
  Store the address beside the report, keyed by report id, never inside the report record: a report is a
  public document and carries no private identifier. Deliver the report as a link, and confirm the
  address before the report is sent to it.
  Acceptance: An anonymous caller still gets the four-page audit with no prompt; a deep scan without a
  confirmed address does not run; no report document, share link, contract, or log line contains the
  address; unsubscribing or deleting the address leaves the public report intact.
  Verify: Tests for depth selection, the email boundary in the stored report, delivery, and refusal
  without an address. Commit as `feat: trade an email for a deeper scan`.
  Done, except the sending itself: HubSpot owns delivery and confirmation, and its specification is
  still to come. `LeadStore.pending()` is the queue it drains; `markConfirmed` and `markDelivered`
  are where it writes back. See docs/OPERATIONS.md > Deep scans and report delivery.

- [x] **6. Add ownership and abuse controls**
  Spec ref: SECURITY.md, `src/server/security/`, `src/server/routes/reports.ts`.
  What to build: Keep the existing URL policy and SSRF controls in the path of every MCP audit, and add
  an MCP-specific rate-limit pool. Reading a report stays public and free. Publishing a human-refined
  child report requires the report's claimant — the confirmed address from item 5, or a WordLift
  account holding the report — so a refinement is attributable to whoever made it.
  Acceptance: A visitor cannot refine someone else's report; a private, reserved, or metadata host is
  refused before any provider is called; nothing on the reading path asks for an identity.
  Verify: Authorization, rate-limit, redirect, private-IP, metadata-host, and report-ownership tests.
  Commit as `feat: bound who can refine a report`.

- [x] **7. Build the focused AI Audit skill**
  Spec ref: [OpenAI skill guidance](https://developers.openai.com/plugins/build/skills).
  What to build: `plugins/ai-audit/skills/review-ai-audit/SKILL.md`, which starts an audit and polls
  when it must, inspects the Terms of Action before proposing any edit, interviews the user about
  operating role, entities, terminology, and action boundaries, presents the proposed changes, waits
  for explicit confirmation, calls refinement only after it, and returns both the original and the
  child report link. It never infers a business decision and never lets a human answer raise readiness.
  Acceptance: The skill reliably follows inspect → interview → propose → confirm → refine.
  Verify: Skill evaluations over complete, partial, still-running, unauthorized, and ambiguous reports.
  Commit as `feat: teach the skill to interview before it refines`.

- [x] **8. Package the plugin**
  Spec ref: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins).
  What to build:

  ```text
  plugins/ai-audit/
  ├── .codex-plugin/
  │   └── plugin.json
  ├── skills/
  │   └── review-ai-audit/
  │       └── SKILL.md
  └── .app.json
  ```

  Register the production MCP endpoint in ChatGPT Developer mode and record the resulting app
  identifier in `.app.json`.
  Acceptance: Installing the plugin exposes both the MCP connection and the skill.
  Verify: A fresh developer-mode installation in a clean ChatGPT workspace. Commit as `feat: package the public AI Audit plugin`.
  Built, except the app id, which only exists once the server is registered in Developer mode:
  `.app.json.example` carries the shape and plugins/ai-audit/README.md the three steps. A committed
  placeholder id would fail at install time looking like a server outage.

- [x] **9. Add MCP contract and workflow tests**
  Spec ref: the deterministic audit/report test strategy already in `tests/`.
  What to build: Tests for tool discovery, schema validation, structured-output parity with WebMCP,
  polling, typed failures, the confirmation boundary, authentication, and immutable refinement.
  Acceptance: MCP and WebMCP return semantically equivalent report information, and neither exposes raw
  HTML, cookies, secrets, or internal identifiers.
  Verify: `npm run test:mcp` runs the focused set; `npm run verify` runs the whole suite, which
  contains every one of those files, so it is not run twice there. `npm run test:e2e` is unchanged. Commit as `test: prove the MCP surface tells the same truth`.

- [ ] **10. Deploy and validate production MCP**
  Spec ref: docs/OPERATIONS.md, `scripts/deploy-cloud-run.sh`.
  What to build: Deploy `/mcp` with a request timeout and concurrency that suit a 30–60 second audit,
  structured logging, rate limits, and health monitoring; verify the domain. The deploy script replaces
  the whole environment, so every existing variable ships with it.
  Acceptance: The production endpoint is reachable from ChatGPT and either survives a real audit or
  hands back a report id that polls to completion.
  Verify: MCP Inspector against production, then audits of three unrelated public domains. Commit as `chore: deploy the public MCP endpoint`.
  Ready, not run. The deploy script carries the new variable and the TTL prerequisites; the build
  was exercised locally end to end — health, the well-known token, tools/list, an audit, inspect,
  a refusal without the claim and a refinement with it. Deploying to beta.audit.wordlift.io is
  Andrea's call, and `OPENAI_APPS_CHALLENGE` needs its token first.

- [x] **11. Prepare directory submission**
  Spec ref: [submission requirements](https://developers.openai.com/plugins/deploy/submission), [review guidance](https://developers.openai.com/plugins/deploy/app-review).
  What to build: Verified WordLift identity, privacy policy, terms, support contact, starter prompts,
  tool descriptions, five positive test cases, and three negative ones.
  Acceptance: The submission describes what is actually live, every tool carries accurate safety
  metadata, and a reviewer can reproduce the principal workflow from the material supplied.
  Verify: Run the submission portal scan and execute every supplied test case against production.
  Written in docs/mcp-plugin/submission.md. The three items it cannot supply itself — the
  verification token, the app id, and the artwork — are its closing checklist.

## Review pauses

1. MCP Inspector invokes the first local tool (after item 3).
2. ChatGPT completes audit → poll → explain through the development connection (after item 4).
3. The skill completes inspect → interview → confirm → refine without moving a single piece of
   readiness evidence (after item 7).
4. Production security and submission tests pass (after item 10).

## Decided: free to all, an email only for depth

The product is free and stays free. Anyone can audit a URL, read a report, and share its link without
an account, and the four-page basic scan asks for nothing at all. The single exchange is depth: a
deeper crawl costs an email address, and the report is sent back to it, which is also how the
conversation continues after the scan.

That address is the claim. Refining Terms of Action is a published human judgment about someone's
business, so it belongs to the confirmed claimant rather than to whoever holds the link. Reading never
asks for an identity.

Effort follows this: roughly four to six focused days if WordLift authentication and its mail path can
be reused for confirmation and delivery, seven to ten if report ownership, confirmed addresses, and
delivery have to be built here.

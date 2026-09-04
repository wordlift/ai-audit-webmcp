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

The deprecated `inspect-service-map` and `refine-service-map` aliases stay registered in the browser,
where callers wrote the old names down. MCP is a new surface with no legacy callers and publishes the
canonical names only.

## Checklist

- [ ] **1. Extract shared tool contracts**
  Spec ref: `src/client/webmcp/toolSchemas.ts`, `src/shared/format/agentSummary.ts`, AGENTS.md > Frozen.
  What to build: Move the names, descriptions, input schemas, result types, and error types into
  `src/shared/tools/`, leaving compatibility exports where the WebMCP module publishes them today.
  Allow transport-specific differences — a mandatory MCP `reportId`, an optional browser one — without
  forking a second copy of a description.
  Acceptance: Tool identifiers and WebMCP behavior are unchanged; a description exists once and both
  surfaces read it from the same constant.
  Verify: `npm run verify && npm run test:webmcp`. Commit as `refactor: give both surfaces one tool contract`.

- [ ] **2. Create a transport-independent tool service**
  Spec ref: `src/server/services/AuditOrchestrator.ts`, `src/server/routes/reports.ts`, `src/shared/format/agentSummary.ts`.
  What to build: An application service that implements audit, report retrieval, explanation,
  inspection, and refinement over the orchestrator and the report store. REST, WebMCP, and MCP become
  adapters that call it, rather than three places that each rebuild the same result.
  Acceptance: The same inputs produce the same structured result through REST and through the service;
  no adapter makes an internal HTTP call to another adapter.
  Verify: Add service-level tests, then `npm run verify`. Commit as `feat: serve every surface from one audit service`.

- [ ] **3. Add the MCP server**
  Spec ref: [OpenAI MCP server guidance](https://developers.openai.com/plugins/build/mcp-server).
  What to build: Add `@modelcontextprotocol/sdk`, construct an `McpServer`, register the AI Audit
  tools against the service from item 2, and mount Streamable HTTP at `/mcp` — before the static
  handler and the SPA `*` fallback in `src/server/app.ts`, which would otherwise answer first.
  Acceptance: Initialization, `tools/list`, and `tools/call` work locally; an audit that outlives the
  request returns a durable report id the caller can poll rather than a dropped connection.
  Verify: MCP Inspector against a local server, plus automated initialize/list/call integration tests.
  Commit as `feat: answer the audit tools over MCP`.

- [ ] **4. Correct tool safety metadata**
  Spec ref: OpenAI plugin review requirements; current annotations in `toolSchemas.ts`.
  What to build: Declare accurate `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
  `audit-website` and `refine-terms-of-action` create stored reports and are write operations;
  `audit-website` currently claims `readOnlyHint: true`, which was true of its answer and never of its
  effect. Keep `untrustedContentHint` on everything that carries website evidence.
  Acceptance: No tool that creates a report is described as read-only; annotations are static and never
  incorporate audited-site content.
  Verify: Snapshot-test every MCP tool definition and its annotations. Commit as `fix: describe the audit tools' real effects`.

- [ ] **5. Add ownership and abuse controls**
  Spec ref: SECURITY.md, `src/server/security/`, `src/server/routes/reports.ts`.
  What to build: Keep the existing URL policy and SSRF controls in the path of every MCP audit, and add
  an MCP-specific rate-limit pool. Reading a report stays public; publishing a human-refined child
  report requires an authenticated caller or a claimed report.
  Acceptance: A visitor cannot refine someone else's report; a private, reserved, or metadata host is
  refused before any provider is called.
  Verify: Authorization, rate-limit, redirect, private-IP, metadata-host, and report-ownership tests.
  Commit as `feat: bound who can refine a report`.

- [ ] **6. Build the focused AI Audit skill**
  Spec ref: [OpenAI skill guidance](https://developers.openai.com/plugins/build/skills).
  What to build: `plugins/ai-audit/skills/review-ai-audit/SKILL.md`, which starts an audit and polls
  when it must, inspects the Terms of Action before proposing any edit, interviews the user about
  operating role, entities, terminology, and action boundaries, presents the proposed changes, waits
  for explicit confirmation, calls refinement only after it, and returns both the original and the
  child report link. It never infers a business decision and never lets a human answer raise readiness.
  Acceptance: The skill reliably follows inspect → interview → propose → confirm → refine.
  Verify: Skill evaluations over complete, partial, still-running, unauthorized, and ambiguous reports.
  Commit as `feat: teach the skill to interview before it refines`.

- [ ] **7. Package the plugin**
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

- [ ] **8. Add MCP contract and workflow tests**
  Spec ref: the deterministic audit/report test strategy already in `tests/`.
  What to build: Tests for tool discovery, schema validation, structured-output parity with WebMCP,
  polling, typed failures, the confirmation boundary, authentication, and immutable refinement.
  Acceptance: MCP and WebMCP return semantically equivalent report information, and neither exposes raw
  HTML, cookies, secrets, or internal identifiers.
  Verify: Add `npm run test:mcp`, include it in `npm run verify`, keep `npm run test:e2e`. Commit as `test: prove the MCP surface tells the same truth`.

- [ ] **9. Deploy and validate production MCP**
  Spec ref: docs/OPERATIONS.md, `scripts/deploy-cloud-run.sh`.
  What to build: Deploy `/mcp` with a request timeout and concurrency that suit a 30–60 second audit,
  structured logging, rate limits, and health monitoring; verify the domain. The deploy script replaces
  the whole environment, so every existing variable ships with it.
  Acceptance: The production endpoint is reachable from ChatGPT and either survives a real audit or
  hands back a report id that polls to completion.
  Verify: MCP Inspector against production, then audits of three unrelated public domains. Commit as `chore: deploy the public MCP endpoint`.

- [ ] **10. Prepare directory submission**
  Spec ref: [submission requirements](https://developers.openai.com/plugins/deploy/submission), [review guidance](https://developers.openai.com/plugins/deploy/app-review).
  What to build: Verified WordLift identity, privacy policy, terms, support contact, starter prompts,
  tool descriptions, five positive test cases, and three negative ones.
  Acceptance: The submission describes what is actually live, every tool carries accurate safety
  metadata, and a reviewer can reproduce the principal workflow from the material supplied.
  Verify: Run the submission portal scan and execute every supplied test case against production.
  Commit as `docs: prepare the plugin directory submission`.

## Review pauses

1. MCP Inspector invokes the first local tool (after item 3).
2. ChatGPT completes audit → poll → explain through the development connection (after item 4).
3. The skill completes inspect → interview → confirm → refine without moving a single piece of
   readiness evidence (after item 6).
4. Production security and submission tests pass (after item 9).

## Open decision: authentication

Audits and report reading stay public. `refine-terms-of-action` requires an authenticated caller or a
claimed report, because a refined child report is a published human judgment about someone's business.
That gives a directory reviewer a credible safety boundary without turning the audit funnel into a
sign-up wall.

Effort follows this decision: roughly four to six focused days if WordLift authentication can be
reused, seven to ten if report ownership or OAuth has to be introduced.

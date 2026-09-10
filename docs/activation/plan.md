# Audit, Fix, Activate

Status: rewritten on 2026-09-06, replacing the seven-item draft of the same day; Activate replaced
Activate on 2026-09-07, because the third stage makes the organisation operable, not merely visible.
Started on 2026-09-07 on the branch `docs/activation-plan`, with A1, A3 and A4, then A2, then F1
on a stand-in. Items are ticked as they land, and the review pauses stand. Nothing ships from the
branch; it is kept ready. WordLift's HTML-to-JSON-LD endpoint arrives the week of 2026-09-14 and
replaces the stand-in behind the same interface; it is the highest-priority decision in here,
because it is what turns an expert audit into a PLG interface.

The client is a human. The end consumer is an AI agent. What we have works and is overly complex:
a site owner meets the machine's pipeline, its vocabulary and its provenance before they meet the
one thing they came for. This plan keeps what works, the audit that earns readiness by invocation,
and gives it three words a person can hold: **Audit** what an agent can do on your site, **Fix**
what it cannot, **Activate** your business for agents. Everything a person sees is written for a
person. Everything the site publishes is written for an agent. Three numbers close the loop: who
crawled the graph, whether Google came back, and which agents acted.

Externally: **Audit. Fix. Activate. Make your business work with AI agents.** Internally, WordLift
knows what that takes, entities, taxonomies, actions, governance, interfaces, verification, and
none of it needs a name on the first screen. All of it has its exact name one click below, because
the model is the enterprise conversation and it is also the file an agent reads.

## Principles

- **One question, then three buttons.** "Can AI agents understand and use your business?" Audit
  it. Fix it. Activate it. Nothing else appears until the person has an answer.
- **Readiness is earned by invocation.** Unchanged. Verification is not a fourth word; it is what
  Audit does every time it runs, so an activated site is re-verified by the tool that found the gap.
- **We measure whether agents can act, not what AI says about you.** Visibility monitoring is a
  crowded, well-funded category, and it is moving from measuring towards acting. We start from the
  other side, the operational gap, and never drift into share of voice.
- **A score that moves is the loop.** A one-time audit is a report; a readiness score that is
  re-checked and can go up is a habit. "Has my score gone up?" is the question that brings a person
  back.
- **Data that updates is the relationship.** A number that never changes is a report. A number
  that changes is a reason to come back, and the product brings it to the person rather than
  waiting for them. So the counting starts in the first week, on free reports, before anyone pays.
- **Human on the screen, agent in the file.** No pipeline stage, no provenance panel, no schema
  term on the first screen. The frozen vocabulary stays in the full audit, the docs and the tools.
- **Simple, never inaccurate.** Every plain word on the first screen maps to one precise state and
  nothing else: "works" is verified by invocation, "fix this" is a named gap in a named layer,
  "talk to us" is an interface that does not exist. The depth one click below is where a reader
  checks that, and it uses the model's own names: entities, taxonomies, actions, Terms of Action.
- **Free diagnoses; paid keeps it alive.** A snapshot rots when the site changes a template. The
  recurring value is markup kept in sync and readiness re-verified, and the WordLift account is the
  only gate.
- **Markup for finding, memory for acting.** A crawler reads the page and needs what exists and
  where it points: schema.org JSON-LD with `potentialAction` and `EntryPoint`. An agent about to
  act needs judgment: what the business is, what it owns and hands off, what its words mean, what
  not to do, and why. That is the Terms of Action, rendered as a skill file an agent loads, held in
  the knowledge graph as memory. An ARD catalog at the well-known path points at both. Three
  renderings of one model, no format of our own.
- **Memory never outranks evidence.** A skill states boundaries; only the audit calling an
  interface states readiness. Activate publishes both.
- **We build graphs and expose capabilities. We do not run a directory.** Google's registry does
  discovery, ranking and spam. Decided 2026-09-06.
- **Sidecars are read-first and sold as projects.** Alpina stays the demo.
- **The loop closes with numbers.** Activate is a claim until a crawler comes, Google re-reads, and
  an agent acts. Three counts, by visitor class, shown to the owner where the claim was made.
  Aggregate only: no address and no user agent is ever stored raw.

## The journey

| Step | The human sees | The agent gets |
| --- | --- | --- |
| **Audit** | URL in, one screen out: archetype, score, the three actions that matter with a state and one next step each, the deep-scan offer at the top. "Full audit" behind a fold. | The same over MCP: `audit-website`, `get-audit-report`, the explain tools. A report that says what works, with the evidence. |
| **Fix** | "Here is the markup your site should have." Entities not published, actions with no entry point, a sample of the markup. One button: publish with WordLift, kept in sync. | JSON-LD on the pages: the entities, each with the `potentialAction`s that work and an `EntryPoint` for each. |
| **Activate** | "Your site is discoverable by agents." A catalog at the well-known path, kept current, the audit attached as evidence, listed in Google's registry. Later, WordLift runs an interface for actions that have none. | `/.well-known/ai-catalog.json` pointing at the server card and at the skill, the site's Terms of Action as memory, the report as evidence, re-verified on each audit. |
| **Close the loop** | "Since you activated": crawler visits by name, how often Google re-read the entity, which agents activated a sidecar. Free: the single entity that stands for the site and its capabilities, hosted by us. Paid: the combined graph on the customer's domain. | Nothing new. Its visit is counted by class, never by identity. |

## Depth: one click below

The first screen has three words. One click below, the model has its exact names, because the
model is the enterprise conversation and it is also the file an agent reads. The same nouns run
from the screen to the graph to the file, and that is what makes the simple version honest.

| Layer | On the first screen | One click below | In the graph | In the agent's files |
| --- | --- | --- | --- | --- |
| Entities | "N entities on your pages are not published" | The context graph: what the business is and owns, declared and inferred, each with its sources | The entity graph, one `@id` per thing | JSON-LD identities on the page; the skill's entities by id |
| Taxonomies | Not shown | Terminology: the lexical graph, the site's words and what they mean here, machine terms confirmed, replaced or rejected | The lexical graph | `DefinedTermSet` on the page; the skill's "Words" |
| Actions | The three that matter, with "works", "fix this", "talk to us" | Every action for the archetype: its state, its evidence, its interface, who owns it | The action graph, bound to entities | `potentialAction` with `EntryPoint`; the skill's "Actions"; the audit's evidence |
| Terms of Action | Not named | The composition: role, entities, words, actions with boundaries and rationale, evidence | The graph as a whole, governed | The skill file, cited by the catalog |

Activate has two meanings, and only one is ours. **Activate** publishes the organisation's
agent-facing representation on its own site: the page markup, the skill, the catalog. That waits on
nobody. **Distribute** registers it wherever agent ecosystems allow, Google's registry first, and
depends on Google and others. Distribute is later, and it is not a word on the screen.

## Free and paid

| Layer | What it includes | Why the line is here |
| --- | --- | --- |
| Free, anonymous | The four-page audit, the three actions, the score, running it again, reading any report, the MCP surface for ChatGPT and Claude, the Fix finding with a sample | A directory listing requires it free and authless; a site owner learns the gap in a minute |
| Email | The twelve-page deep scan, the report sent | A lead, not a tier; unchanged |
| WordLift account | The full generated markup, published by the plugin and kept in sync, "own it" recorded on the site, the catalog kept current, readiness re-verified on a schedule | This is what rots as a snapshot and holds as a graph |
| Project | A sidecar: WordLift runs an interface for a site | Services, never self-serve |

The paid promise in one sentence: **WordLift keeps your business agent-ready.** JSON-LD, the
catalog, the skill and the graph are how, never what is sold.

## The ladder

Nobody buys the vision on day one. They paste a URL.

| Rung | What it is |
| --- | --- |
| Top of funnel | Audit my website |
| Product | Make it agent-ready: Fix, then Activate |
| Recurring | Keep it agent-ready: Activate, and the loop that proves it still works |
| Enterprise expansion | Make more of the organisation operable: the interfaces that are missing, built as projects. The model is the conversation: entities, taxonomies, actions, Terms of Action, shown exactly |
| Infrastructure | The graph beneath it all: entities, words, actions, governance, interfaces, verification |

## Audit

- [x] **A1. One state for an action an agent can perform** — done 2026-09-07. The retired value
  is normalised on read, so every stored report and fixture still parses; provenance is `via`.
  Spec ref: `src/domain/action-model/deriveState.ts:33`, `src/shared/schemas/report.ts`, the state
  tokens in `src/client/styles/app.css`, `ActionNode`.
  What to build: `sidecar-enabled` becomes `agent-ready` with `via: "site" | "sidecar"`. The
  schema accepts the old value and maps it on read. Four states, one legend; a sidecar-run action
  carries a "run by WordLift" tag, not a colour.
  Acceptance: nothing shows five states; an old report renders; no fixture's score moves.
  Verify: golden snapshots updated on purpose; `npm run verify && npm run test:e2e`.
  Commit as `feat: one state for an action an agent can perform`. One day.

- [x] **A2. The three-actions screen** — built 2026-09-07, kept ready on the branch. Plain words on
  the first screen, the precise vocabulary one click below; the landing page asks one question.
  Ships first, when Andrea says so.
  Spec ref: `src/client/routes/ReportRoute.tsx` (today: progress, tools badge, provenance,
  summary, classification, foundation, deep scan, in that order), `ExecutiveSummary.tsx`,
  `HomeRoute.tsx`, the per-archetype expectations in `action-model/v0.1.0/archetypes/`.
  What to build: above the fold, the site, its archetype, the three actions that matter most for
  that archetype (expected, ranked by gap), each with its state, one line of evidence and one next
  step in plain words: "works", "fix this", "talk to us". The report opens with one sentence in
  the shape "Agents can discover 7 capabilities on this site. 4 work. 3 are missing. Here is what
  prevents them." The deep-scan offer beside the summary, and still at the end. The provenance
  panel, the tools badge, the foundation audit, the context graph and the "Published with"
  component move behind "Full audit", which is the depth surface, laid out as the model rather
  than as the pipeline's stages: Entities, Terminology, Actions, and the Terms of Action they
  compose, in the frozen vocabulary, with the evidence behind every state. The landing page asks one question, "Can AI agents
  understand and use your business?", with one field for a URL; today it says "Teach ChatGPT how
  your business should work for agents" and previews the pipeline's stages.
  Acceptance: a first-time visitor sees the three actions, their next steps and the deep-scan
  offer without scrolling on a laptop; the full audit is one click away; WebMCP registrations and
  tool identifiers are untouched.
  Verify: `landing.spec.ts` and `cyborg-journey.spec.ts` updated; two people outside the team read
  a report and say what an agent can do on the site, and what to do next, in under a minute.
  Commit as `feat: three actions, three words`. Two to three days.

- [x] **A3. Cost guards** — done 2026-09-07. The crawl is reused, never the report: a second
  request gets its own id and claim, `reusedFrom` and `collectedAt` say what it was built from,
  and `fresh` reads again. The daily budget is `AUDIT_DAILY_BUDGET` (2,000 by default); the
  Firestore index and the billing alert are documented in OPERATIONS.md and need running once.
  Spec ref: `AuditOrchestrator.ts:86` (reuse is by request id only), `rateLimits.ts` (the
  service-wide ceiling), `docs/OPERATIONS.md`.
  What to build: a completed report for the same canonical URL and depth is reused for a day;
  "run again" is the explicit re-verify and bypasses it. A daily audit budget in the app that
  answers "at capacity" past it. A billing alert in Google Cloud, documented in OPERATIONS.md.
  Acceptance: two audits of one site an hour apart run one collection; "run again" runs two; the
  daily budget refuses the audit past its number and never refuses a read.
  Verify: orchestrator tests for reuse and bypass; a rate-limit test for the daily budget.
  Commit as `feat: one crawl per site per day unless asked`. One day.

- [x] **A4. Read the catalog a site publishes for agents** — done 2026-09-07. Both spellings, the
  link tag and the robots directive; server cards and skills the catalog points at are followed
  on the site's own origin and probed; a failed probe names its source; `agentDiscovery` on the
  report says found, missing or unknown for the catalog and the memory.
  Spec ref: `DISCOVERY_PATHS` in `NativeFetch.ts`, the well-known signals in
  `WordLiftAudit.ts:364`, the ARD spec (https://agenticresourcediscovery.org/spec/).
  What to build: probe `/.well-known/ai-catalog.json` and `/.well-known/ard.json`, honour
  `<link rel="ai-catalog">` and the robots `Agentmap:` directive. A server card or agent card an
  entry points at is declared evidence for the actions it names, never readiness. A skill the
  catalog points at, or `/skill.md` and the agent-skills index the collector already probes, is
  read as the site's memory: an instruction that names an interface is declared evidence, and one
  that names an interface the audit cannot call is a finding, "the site's instructions promise
  what the site does not do". A site without a catalog gets the finding "agents cannot discover
  this site", whose next step is Activate.
  Acceptance: a fixture with a catalog lists its interfaces as evidence; a skill that promises a
  failing interface produces the finding; one without a catalog gets its finding; no entry and no
  instruction raises an action past `unverified`.
  Verify: fixtures for both spellings; the existing well-known tests as the template.
  Commit as `feat: read the catalog a site publishes for agents`. Half a day.

- [x] **A5. The pitch: one screen, three sites** — built 2026-09-07 at `/pitch`: a form, then
  `/pitch/<id>,<id>,<id>` as the shareable link; the same three actions across the sites, the
  prospect's gaps as the list to fix, the report id on the dashboard button; a repeated competitor
  is served from the day's crawl, and the browser test proves it.
  Spec ref: A2's screen, A3's reuse (three audits per pitch is what makes reuse pay), the report
  pages that are already public by link.
  What to build: a compare page. A URL and up to two competitors, audited side by side: readiness
  score for each, the three actions that matter for the archetype with each site's state, and the
  gap list for the first site, "Fix these 7 issues". Shareable by link like any report, and free.
  This is how an agency walks into a prospect: "here is what AI agents cannot do with your website,
  and here is what they can do with your competitor's". The audit becomes their sales tool; Fix
  and Activate become the work they sell, powered by WordLift.
  Acceptance: three audits, one screen, one link; a repeated competitor is served from the day's
  stored report rather than crawled again; nothing on the page names a WordLift client site other
  than alpina.travel.
  Verify: e2e compare spec; the reuse test from A3 counted against a pitch.
  Commit as `feat: three sites on one screen`. Two to three days.

## Fix

- [x] **F1. The markup a page should have** — built 2026-09-07 on a stand-in: Gemini 2.5 Flash
  through the Gemini API, behind `MarkupProvider`, one file to replace when WordLift's endpoint
  lands. Inferred entities enter the existing merge marked `inferred` at lower confidence, merge
  with a declared namesake, never move readiness, and the report carries `markup` with the
  counts. Measured live on alpina.travel: \$0.0023 a page, \$0.009 for a basic scan, on the
  health endpoint as a running total. The validator in `jsonLd.ts` is the base a SHACL pass
  slots into.
  Spec ref: `compileContextGraph.ts` (entities come from the page's JSON-LD only),
  `GoogleNlp.ts` (the bounded-text pattern), WordLift's HTML-to-JSON-LD endpoint, which Andrea
  is confirming with its cost per page.
  What to build: a provider that sends a page's HTML to the endpoint and returns the JSON-LD the
  page should carry, entering the existing merge path marked `origin: "inferred"` beside what the
  page declared. No second entity model. An inferred entity never moves readiness. Run it on deep
  scans, and on basic scans only for pages whose declared markup is thin, so cost follows value.
  Acceptance: a site with no JSON-LD gets a labelled graph; a well-marked site is unchanged; no
  score moves because of an inferred entity; the privacy page names markup generation under the
  WordLift API row.
  Verify: fixtures with and without markup; unit tests on merge and labelling; `npm run test:mcp`.
  Commit as `feat: read the markup a page should have, not only the markup it has`. Two days.

- [x] **F2. The Fix panel** — built 2026-09-07. The difference between declared and inferred,
  the actions no agent can reach, one sample of valid JSON-LD for one inferred entity, and one
  button to the dashboard carrying the report id. Shown only when there is something to fix.
  Spec ref: A2's screen; `FoundationAuditDetails.tsx` for the existing link to the WordLift
  dashboard.
  What to build: under the three actions, the difference between declared and inferred: "N
  entities on your pages are not published", "M actions have no entry point", one sample of the
  markup for one entity, and one button: "Publish with WordLift", to the dashboard. The full
  markup is generated on the account side, not downloaded here.
  Acceptance: the panel appears only when there is a difference; the sample is valid JSON-LD; the
  button carries the report id so the dashboard can pick it up.
  Verify: component tests; the e2e report spec.
  Commit as `feat: show the markup a site should have`. One to two days.

- [x] **F3. "Own it", lightly** — built 2026-09-07. One question per action of the three on the
  report: we do, a partner does, we only describe it; a handoff can name the partner, which the
  published action carries as `provider`. The answers travel as `actionDecisions` alone into an
  immutable child report; readiness does not move.
  Spec ref: `REFINE_SERVICE_MAP_TOOL` in `src/shared/tools/definitions.ts` (`actionDecisions`),
  the interview in `plugins/ai-audit/skills/review-ai-audit/SKILL.md`.
  What to build: on the web, one question per action of the three: own it, hand it off, describe
  only. It calls the refine tool with `actionDecisions` alone and creates the child report as
  today. Those three answers are exactly what AC1 renders: own it with a working entry point
  publishes the action, hand it off publishes it with the partner as `provider`, describe only
  publishes the entity alone. The full interview stays in the MCP skill where an agent asks, and
  what it adds, role, entities, terminology, rationale, reaches the agent through the skill file,
  so refining through ChatGPT or Claude produces richer memory than three clicks. Nothing waits
  for this.
  Acceptance: a visitor can answer three questions in under a minute; the child report carries
  the decisions; readiness does not move.
  Verify: the existing refinement tests; `cyborg-journey.spec.ts`.
  Commit as `feat: three questions a site owner can answer`. One day.

## Activate

- [x] **AC1. Activate: publish what the owner confirmed and what works** — built 2026-09-07,
  server side: `GET /api/reports/:id/publish` and the three documents beneath it, from
  `src/domain/publish/publication.ts`. The catalog validates against the spec's entry schema, so
  the URN is `urn:air:` while the path is Google's; both live in `ardSchema.ts`. The Activate
  screen arrives with L4. Ours, and waits on nobody: the three documents go on the site whether or
  not any registry reads them yet.
  Spec ref: the per-action JSON-LD at `/api/reports/:id/contracts/:actionId`, the refined
  report (`businessRole`, entity decisions, `terminology`, `actionDecisions`), the ARD entry
  schema (`spec/schemas/ard-entry.schema.json` in ards-project/ard-spec), the ARD base context,
  the skill format the collector already reads (`/skill.md`, the agent-skills index).
  What to build: from a completed audit, refined or not, one model rendered three ways.
  1. **The page JSON-LD, for finding.** Entities with `potentialAction` and `EntryPoint`. The
     owner's decisions become what is published and where it points:

     | The owner decided | The page carries |
     | --- | --- |
     | Own it, and an entry point works | `potentialAction` with an `EntryPoint` on the site or the WordLift sidecar; listed in the catalog |
     | Own it, no entry point yet | The entity, no action; the Fix panel says "fix this" or "talk to us" |
     | Hand it off | `potentialAction` with `provider` naming the partner, target on the partner's domain when it has one |
     | Describe only | The entity, no action |
     | Not ours | Nothing |

     The operating role becomes the organisation's schema.org type; promoted entities are
     published and demoted ones omitted; terminology becomes a `DefinedTermSet`. Nothing is
     declared that the audit could not call.
  2. **The skill, for acting.** The Terms of Action as a markdown file an agent loads: the role
     in the owner's words, the entities by id, the terminology, each action with its boundary and
     rationale, how to call each interface, and what never to do. It states boundaries and cites
     the report for readiness; it never claims an action works. Hosted on the site under the
     agent-skills index; the knowledge graph is its source of truth and, for paid sites, serves
     the same memory as an MCP resource and keeps the file current.
  3. **The ARD catalog, for discovery.** Google's spelling, one entry per interface and one for
     the skill (`application/ai-skill+md`), `capabilities` from action ids,
     `representativeQueries` from action names, `metadata` linking the report. The spelling
     lives in one constant.
  Served at `/api/reports/:id/publish`; the plugin publishes all three onto the site and keeps
  them current. A report with no decisions still publishes its verified actions: decisions make
  the memory say more, they never make publishing wait.
  Acceptance: the JSON-LD validates and follows the table; the skill carries every decision the
  refined report holds and no readiness claim; the catalog validates against the ARD schema with
  the URN anchored to the site's domain; documents on another domain are ignored by A4.
  Verify: schema tests; a round trip on a fixture site: audit, refine, publish, re-audit reads all
  three as evidence.
  Commit as `feat: publish what the owner confirmed and what works`. Three to four days.

- [x] **AC2. Verify by calling** — built 2026-09-07. Every declared `potentialAction` target on
  the site's origin is read off the sampled pages; a read over GET is executed once and judged,
  a write is never executed, an unfillable input is left declared, and each says why. An answer
  is invocation evidence for the action it serves; a failure is a failed declaration. No sidecar
  registry.
  Spec ref: `mcpToolCalls.ts` and `searchAction.ts` (invocation evidence today),
  `src/server/sidecars/alpina/` (the read-only sidecar).
  What to build: the audit invokes a declared `EntryPoint` for a read action the way it invokes a
  declared SearchAction or MCP tool, and records the outcome. Write actions are never invoked.
  No registry of sidecars.
  Acceptance: an entry point that answers makes its action agent-ready via site or via sidecar;
  one that fails stays unverified with the failure as evidence; no write action is called.
  Verify: the Alpina contract tests as the template; `alpina-sidecar.spec.ts`.
  Commit as `feat: verify what a site declares by calling it`. Two days.

- [ ] **AC4. Sidecar, on request**
  A second sidecar is built when a paying customer asks, by hand, read-only, as the Alpina one.
  Never in the self-serve product: Audit says the interface is missing, Fix structures what can be
  structured, Activate publishes what is genuinely available, and "talk to us" is enterprise
  expansion rather than PLG complexity. Not sized.

## Distribute (later, and theirs)

- [x] **D1a. The entry source** — built 2026-09-07. `GET /feed/ai-catalog.json` lists the
  entries of every site whose own catalog carries our Terms of Action, each on its own domain,
  observed by the audits and forgotten when the catalog goes; `publishedSites` is the shape the
  platform can fill too. One submission registers every customer when Google's onboarding opens.
  The service serves its own catalog and MCP server card as well. A `PREVIEW=1` deploy mode tries
  the branch on a separate service with a memory store, no HubSpot, no re-reads and noindex.
- [ ] **D1. Register wherever agent ecosystems allow**
  Spec ref: Google Cloud's Agent Registry and its publisher onboarding; any other registry that
  reads ARD catalogs as they appear.
  What to build: submit the catalogs we publish for, and nothing else. Every site that Activate
  published is already crawlable by any registry that reads the well-known path; Distribute is the
  hand-raise where a registry wants one. Half a day per registry, when each exists.
  Acceptance: a site published through AC1 appears in the registry's search with the report
  linked from its entry.

## Close the loop

L1, L2 and L3 ship in the Audit week, not after Activate: they depend on nothing in Fix or
Activate, cost about two days, and every free report then starts accumulating "N crawlers and M
agents have read this since it was published" from its first hour. The relationship starts before
anyone pays. L4's full panel arrives with Activate; its one line on the report arrives with A2.

Nothing observes visitors today: there is no request classification, sidecar calls are not
recorded, and the only trace is the 30-day request log. In the free tier the single entity that
stands for the site and its capabilities is the report page and the JSON-LD it carries; that is
what is counted. In the paid tier the combined graph lives on the customer's domain, and the same
three numbers come from the WordLift platform, the plugin's own logs and Search Console's crawl
stats. This repository defines the shape both sides fill.

Internally this stage is **Observe**, the fifth word, kept off the screen until it has numbers to
show. Its first number is the readiness score itself, re-checked on a schedule for activated sites
and shown as a movement, "74 → 86", because that movement is the recurring loop. The day it can say "GPTBot found you 17 times, Claude read your Terms of Action 8 times, 6
agents checked availability, 5 succeeded, 1 failed because the capability changed", the product
has crossed from SEO tooling into agent operations, and that is what an enterprise pays for on a
recurring basis.

- [x] **L1. Visitor classes** — done 2026-09-07. Crawlers by name, agents by platform, people;
  Googlebot verified against Google's three published range files, refreshed daily.
  Spec ref: `src/server/security/platformEgress.ts` (the address ranges already known and
  refreshed), Google's published crawler ranges (`googlebot.json`, `special-crawlers.json`,
  `user-triggered-fetchers.json`), the crawler user agents that matter.
  What to build: one classifier from user agent and address to a class. `crawler:<name>` for
  Googlebot, GoogleOther, Google-Extended, Google-CloudVertexBot, Bingbot, GPTBot, OAI-SearchBot,
  ChatGPT-User, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Applebot, Amazonbot,
  Meta-ExternalAgent, and one bucket for the rest. `agent:<platform>` for a hosted assistant's
  egress or an MCP client by its `clientInfo`. `human` otherwise. Googlebot is verified by
  address against Google's published ranges, read with the same refresh the OpenAI list uses; a
  Googlebot user agent from an unverified address counts as `crawler:claimed-googlebot`.
  Acceptance: the class table is a fixture; a spoofed Googlebot from a home address is not Google.
  Verify: unit tests over the fixture; the egress tests as the template for the range refresh.
  Commit as `feat: know a crawler from an agent from a person`. Half a day.

- [x] **L2. The visits ledger** — done 2026-09-07. `visits` per report per day by class,
  batched and flushed every fifteen seconds, read at `GET /api/reports/:id/visits`, never counted,
  never rate limited. The two TTL policies are documented in OPERATIONS.md and need running once.
  Spec ref: `FirestoreLeadStore.ts` as the store template; the URLs an agent or crawler fetches:
  `/reports/:id`, `/api/reports/:id`, `/api/reports/:id/contracts/*`, `/api/reports/:id/publish`
  (AC1), `/llms.txt`, `/.well-known/*`.
  What to build: a middleware that counts each request to those URLs, and to the skill file the
  site serves for agents, into `visits/{reportId}/{day}` by class, batched in memory and flushed
  on an interval, a memory store in demo mode, the same TTL as the report. A fetch of the skill by
  an agent class is the count that closes this loop best: an agent read the memory before acting.
  No address, no user agent, no path beyond the report id is stored.
  `GET /api/reports/:id/visits` returns the counts by day and class, and reading it is never rate
  limited.
  Acceptance: a verified Googlebot request to a report page is one `crawler:googlebot` visit for
  that day; a person's is one `human`; counts survive an instance restart; the privacy page's
  technical-data section names the aggregate counters.
  Verify: middleware tests with forwarded addresses, as in `platform-rate-limits.test.ts`; a
  flush test; the privacy page updated in the same commit.
  Commit as `feat: count who reads a report, by kind and never by name`. One day.

- [x] **L3. Sidecar activations** — done 2026-09-07. `activations` per site per day by tool,
  surface and outcome; `web`, `webmcp`, `api` today, `audit` reserved for AC2's calls.
  Spec ref: `src/server/routes/alpina.ts`, `AlpinaAvailabilityTool.tsx` (the in-page caller),
  AC2's verification calls.
  What to build: every sidecar call is counted by site, tool, surface and outcome into the same
  ledger, keyed by domain rather than report, because a sidecar serves the site across reports.
  Surfaces: `webmcp` (an agent in the page), `mcp` (the remote server), `api`, and `audit`
  for AC2's verification calls, which are counted apart so the number the owner sees is agents,
  not us.
  Acceptance: an in-page agent's availability check is one `webmcp` activation; an audit's
  verification call lands under `audit` and is excluded from the owner's number.
  Verify: the sidecar route tests; `alpina-sidecar.spec.ts`.
  Commit as `feat: count the agents that actually act`. Half a day.

- [x] **L4. What happened since you activated** — built 2026-09-07. The Activate screen at
  `/reports/:id/activate`: the score and its movement, what the owner said against what the page
  carries, the three documents, then crawlers by name, Google's verified reads, agents by platform
  and activations with each failure's reason, which the ledger now records. Empty states say what
  to expect. The report's one line was done with A2.
  Spec ref: the Activate screen (AC1), the three-actions screen (A2).
  What to build: on the Activate screen, the readiness score and how it moved since activation,
  then three numbers for the period since publication: crawler visits by name; Google re-reads, the verified Googlebot requests to the entity, the catalog and
  the pages the plugin publishes; agents that read the site's instructions; and agents that
  activated a capability, how many succeeded, and each failure with its reason, because a failure
  is the moment the owner learns a capability changed before the agents gave up on it. On the report, one line:
  "N crawlers and M agents have read this since it was published." Empty states say what to
  expect and when: a crawler within days, an agent once a directory lists the site.
  Acceptance: the numbers on the screen equal the ledger; a report with no visits shows the
  expectation, never a row of zeros.
  Verify: component tests; the e2e report spec.
  Commit as `feat: show whether activating worked`. One to two days.

- [x] **L5. The number that comes to you** — built 2026-09-07. `Observer`: a delivered deep-scan
  address has its site re-read every `OBSERVE_INTERVAL_DAYS` (7), at most `OBSERVE_PER_TICK` (5)
  a check; a note goes out only when something moved (score, a capability that stopped or started
  answering with the reason, the first crawler, Google's first read, failed activations), through
  the same HubSpot form named "what moved", with one link that stops notes and re-reads together.
  Health reports the cadence. The weekly cadence starts on deploy with the defaults; `0` disables.
  Spec ref: the deep-scan address and its HubSpot delivery (`DeepScanDelivery.ts`), the
  privacy page's follow-up wording, L2's ledger, L3's outcomes.
  What to build: a short email to a deep-scan address when something moves, never on a timer
  alone: the score changed, a first crawler came, Google re-read the entity for the first time,
  and above all a capability that stopped working, "availability failed today, here is why",
  which is the email an enterprise forwards to engineering. One unsubscribe, honoured everywhere.
  The cadence that makes the numbers move: a free site with a deep-scan address is re-audited
  weekly, bounded by the number of such addresses, which is a cost that can be seen; an activated
  site is re-audited on the schedule its account sets, and on change. Both feed the same email.
  Acceptance: no email without a change; a failure email names the capability and the reason;
  unsubscribing stops every email and leaves the report intact; the weekly re-audit count never
  exceeds the number of confirmed addresses.
  Verify: delivery tests with a fake transport; a scheduler test bounded by addresses.
  Commit as `feat: bring the number to the person`. Two days.

## The UX pass of 2026-09-07, after the first preview

Seen on the preview, fixed on the branch, all one click or less from the first screen:

- The report opens on the three things an AI agent should be able to do on this kind of site and
  how many work today; the rest is one click below, and the link says how many there are in all.
- **Understand** replaces the Fix panel: every entity the audit read, named plainly, with where it
  was found, in two groups, what agents already read and what exists only in the text, and one
  button that publishes the second group. The markup sample waits behind a fold.
- The discovery line lost its file path; the three questions became three pills a question; the
  full audit explains itself before it opens; the progress screen says what it is doing in plain
  words; the footer says what the product does.
- Activate says an unchanged score is unchanged, says once what eight actions had said eight
  times, and points at the three questions when nobody has answered.
- The markup stand-in is told that a room is not a thing a business is, and room-like names are
  left aside on the way in, because "Bedroom 1" on the first screen is the kind of thing an
  investor remembers.

Second round, 2026-09-10, from Andrea's own testing of the branch: the markup sample no longer
breaks the layout (it wraps inside its fold); the deeper read is asked for where the person is, one
line on the first screen that opens into the form, and the second copy at the bottom is gone; the
ChatGPT review is back one click from the top, beside the three questions, with the same prompt
the full audit uses; and the report now tells, in a person's words, what the audit's agent
actually did on the site ("Searched the site for 'family apartment' and got results", "Followed
the declared way to check availability: it did not answer"), because the value was still not
visible enough and the words were still ours. The three actions speak the same way. The pitch was
screenshotted with two live competitors and needed nothing. Still to judge by eye: the Activate
documents' previews, lighter now.

A full walk of the preview on 2026-09-10, every click on two screen sizes, found and fixed:
a deep scan that showed "Starting…" for the whole minute a live audit takes (now announced as
running after a moment, a late refusal still lands); deep-scan state following a person into the
child report (the first screen is keyed by report, with a key of its own); a missing report that
showed "Loading…" for eight seconds (now says at once that it expired or never existed); and the
Activate table cramped on a phone (cards now). Everything else answered: the well-known documents,
the three publish documents with their content types, the ChatGPT prompt on the clipboard, share,
the child report, Activate from it, the diary on live evidence.

Two load-sensitive tests, tracked and not understood: an "audit then read" case, and the sidecar's
upstream-failure case timing out at five seconds, each roughly one full parallel run in four,
never alone and never twice running.

## The brief of 2026-09-10: simplify the product without simplifying the system

Andrea's brief sets the journey as Audit → Fix → Activate → Prove and the rule as "make the
interface simpler as the underlying system becomes more sophisticated": plain words on the surface,
the exact model one click below, every simple state mapping to one precise state. Decisions taken
with it: Fix and Activate go to the WordLift dashboard with the report, the action and an intent
(`fix`, `agent-ready`, `activate`, `keep`); Talk to us goes to the team's book-a-demo page;
the agent's diary stays, folded; "Not relevant" is the fourth answer; the entity lists stay open on
the page; and Content Analysis v3 replaces the Gemini stand-in as the entities behind Fix, because
that list is the business card.

Built (P0, 2026-09-10):

- The first screen is an action screen: "AI agents can do 1 of the 3 things that matter on
  alpina.travel. Fix the other 2.", readiness as evidence, three doors, the diary folded.
- Fix this opens remediation: what needs to change, in the person's words, one door per diagnosed
  case, the business owner, when it was verified, then the technical detail (`remedyFor`).
- Understand moved under Fix: the counts, "Publish the missing 7 with WordLift", the lists open.
- Before publishing: who actually performs these actions, four answers, one explanation, and the
  ChatGPT interview as the precise path.
- Activate: "Make alpina.travel usable by AI agents", what WordLift keeps synchronized, the table,
  the exact artifacts, then Prove.
- The landing copy; the full audit labelled as the evidence layer, with agent-facing surfaces.
- Content Analysis v3 as the provider (`ContentAnalysis.ts`): asked for the things a business is
  made of by name, one name one thing, no country, no glued labels, Wikidata links only when sure.

The extractor, tuned on live sites the same day: labels per site type (the travel site asked for
its stays, tours and passes, the shop for its brands and collections, the software company for
its plans and integrations); the floor at 0.45 for reach, with the name rules doing the filtering
(a name begins with a capital or a digit, role nouns and meals are not names); every page of a
basic scan sent, since the service costs nothing per call; every geographic label a Place, so one
Lungau is one Lungau across pages; an inferred namesake yields to any declared entity and adds no
fact to it; every name checked against the page's text; evidence read before anything is
inferred, which closed a Gemini-era hole where a generated offer could become "for people"
evidence. On wordlift.io the list went from nothing to the products and services the site names
without declaring; on alpina.travel it is the apartment, the operator and the region's places.

Then, the same afternoon: Gemini behind Content Analysis as a fallback for names only, used for a
page when the first extractor fails or times out, each candidate confirmed by the page's text and
stripped of everything a model wrote around it; the Wikidata links Content Analysis is sure of
shown on the rows and carried into the skill, only when they exist; the map's links on every
entity row, the actions it answers for and the words the site uses for it, with the full map one
click away. Andrea's rule for the list: the same name is one entity, no suggestions, only links
that exist, because that list is the business card.

The next iteration, 2026-09-10 evening, on the branch: Observe's tick as an endpoint a Cloud
Scheduler job calls behind a token (`POST /api/observe/tick`, recipe in OPERATIONS.md), so the
weekly re-read no longer depends on an instance being awake; the enterprise test as a browser
spec, the brief's eight questions each proven two clicks from the report; the full audit in the
brief's seven sections with a nav, and a business-boundaries table it never had; the toolbar's
Activate button given its own fill and ink. Andrea saw no Wikidata links on the preview: the linker
scores each mention on its own, and both the page's first mention and the merge's first page could
leave an entity bare that a later mention or page had linked. Now a later mention lends its link on
the page, and between two inferred sightings the link travels in the merge; a declared entity still
takes nothing from an inferred namesake. The ChatGPT review sits beside its sentence, button right.

Next (P1): Gemini as a recall lever in parallel, page-confirmed, if the lists stay short; usage on the action card
from the ledger; the enterprise test as a browser spec proving each of the eight questions is two
clicks away; labels per site type for the extractor. P2: recurring proof beyond the ledger; the
enterprise review path the model already supports.

The two tests the brief sets: the Replit test (a stranger reads the first screen and can say what
agents can do, what is broken and what to click, within thirty seconds) is for two people outside
the team on the preview; the enterprise test (eight questions, two clicks) is the P1 spec.

## Review pauses

1. After Audit: the one-minute test with two people outside the team; the bill after a week of
   traffic is the number A3 predicted; one agency runs a pitch on a prospect and two competitors
   and says whether they would walk into the meeting with it.
2. After Fix: a poorly marked-up site gets a Fix panel worth acting on; the dashboard receives the
   report id.
3. After Activate: alpina.travel round trip. Audit, publish, re-audit finds the catalog, and the
   availability action verifies through the sidecar demo. Distribute is not in this pause.
4. After the loop: within a week of publishing, alpina.travel's page shows Googlebot's re-reads and
   the demo agent's sidecar activations, and the audit's own verification calls are not in them.

## Drift from beta

The drift is small in the contracts and large in the journey. The six MCP tools, their
identifiers, titles and schemas, the claim-token model, the ChatGPT plugin and the Claude connector,
the WebMCP registrations, the REST API, the report shell and the privacy page are unchanged by
anything above; the skill's full interview is the one the plan keeps for agents. Almost every item
adds optional fields or new routes, which the report schema's own rule, new fields optional and
yesterday's report still parses, already allows. Three items would break beta if done the obvious
way, and each has a safe way, which is the way they are specified:

- **A1.** Renaming `sidecar-enabled` would break reports stored for thirty days, the fixtures and
  the screenshots. It is normalised on read instead, and that is how it landed.
- **A3.** Reusing a stored report for a second caller would hand them a report they cannot refine
  and break the directory's "refine someone else's report" test. The crawl is reused, the report
  and its claim are minted per request.
- **A2.** Two end-to-end specs pin today's layout and the frozen vocabulary is a written rule;
  the specs are re-baselined on purpose, and plain words on the first screen wait for a yes.

## Decided on 2026-09-07

- Plain words on the first screen: works, fix this, talk to us, each mapping onto exactly one
  precise state. The precise vocabulary, agent-ready, unverified, human-only, missing, and the
  boundaries, owned, handoff, informational, not applicable, stays in the full audit, the docs and
  the machine-facing layer. AGENTS.md > Frozen says so.
- A2 ships first. It is what already feels like product. Built and kept ready on the branch.
- F1 is the highest-priority decision. The endpoint arrives the week of 2026-09-14.
- Activate is publishing, ours, and waits on nobody. Distribute is registering, theirs, and later.

## Dropped from the previous draft

The boundaries namespace (boundaries live in memory as prose, and in markup as what is and is not
published), the two-document "manifest" concept, the sidecar registry, the trust schema,
refinement as a gate before publishing, and any index of our own.

## Open, for review

- The HTML-to-JSON-LD endpoint, arriving the week of 2026-09-14, replaces the Gemini stand-in.
  The stand-in's measured cost, \$0.0023 a page at list price, is the number to beat.
- The reuse window in A3. Proposal: one day.
- The daily audit budget in A3. Proposal: a number the bill can absorb twice over; ops sets it.
- What free Fix shows. Proposal: the finding and one entity's markup, never the full set.
- Whether the free entity gets a URL of its own, one page per site carrying the `WebSite` and its
  `potentialAction`s, or stays the report page. Proposal: the report page now, a per-site entity
  URL when Fix ships, because that is the thing Google would come back for.
- The paid side's numbers come from the plugin's logs and Search Console's crawl stats, owned by
  the WordLift platform. This repository only fixes the shape.
- An intermittent failure in the full parallel unit run, roughly one run in four, always in an
  "audit then read" test and never reproduced alone or in two consecutive full runs. Tracked, not
  understood; suspect timing under load rather than a logic fault, since the failing test differs
  each time.
- What the readiness score breaks into. Today the report carries two numbers, agent readiness and
  the foundation score. The dimensions a person would watch move are discovery, entity
  understanding, action availability, successful invocation, evidence quality, Terms of Action
  coverage and agent compatibility. Proposal: keep one headline number in A2 and show the
  dimensions in Observe, once there is a second audit to compare with.
- Price bands. Proposal from the Peec review: free for the audit and the pitch; a hundred to a few
  hundred euros a month to keep a smaller site agent-ready; agency workspaces; enterprise for
  governance, APIs, integrations and the interfaces that are missing. Expansion earns the contract
  value, never the entry product. Andrea's call.

## Borrowed from Peec

Peec AI went from launch to ten million dollars of annual revenue in sixteen months by selling one
question, "how does AI see your brand?", checked daily, with a frictionless first minute and
agencies as distribution, including free seven-day pitch projects an agency runs on a prospect
before the meeting. Four things are borrowed here: the one question (principles), the score that
moves (Observe), the pitch (A5), and the discipline of hiding the machinery. One thing is not:
their category. They measure what AI says; we measure whether agents can act, and that is the
side of the problem the semantic and action infrastructure already answers.
Sources: https://peec.ai/for-agencies, https://peec.ai/pricing,
https://techcrunch.com/2025/11/17/as-consumers-ditch-google-for-chatgpt-peec-ai-raises-21m-to-help-brands-adapt/

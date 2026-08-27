# Devpost submission draft — WordLift AI Audit: Agent Capability Map

Status: draft for review. Items marked **[CONFIRM]** need Andrea's input or a completed action
before submitting. Deadline: **3 September 2026, 1:00 PM PT** — after which the Devpost entry, the
repository, and the live site must not be touched until winners are announced.

---

## Project name

**WordLift AI Audit — Agent Capability Map**

## Elevator pitch (200 characters max)

Pages give AI agents knowledge. Functions let them act. Enter a URL: we map what an agent should be
able to do on that site, prove what it actually can, and turn one gap into a working WebMCP tool.

## The problem

Every "is my site AI-ready?" tool answers the wrong question. They check whether a crawler can read
your pages. But an agent that can read your hotel page still cannot check whether the room is free
on the twelfth. Knowledge is not capability.

Worse, the signals everyone checks are trivially faked. Point an audit at a site whose catch-all
answers every unknown path with its homepage and every `.well-known` probe returns HTTP 200. A
checklist audit — the foundation audit we ourselves call — scores them as present. They are soft
404s. If the industry grades agent-readiness on whether a URL returns 200, everyone passes and no
agent can do anything.

And the checks are aimed at the wrong place to begin with. WebMCP has no discovery document: tools
are registered in the page through `navigator.modelContext`, or annotated on the form they operate.
Any audit that probes `/.well-known/` for WebMCP will report a site that implemented it correctly as
having none.

## What it does

Enter a public URL and the application:

1. **Understands the site** — collects the page, its forms, its structured data, and its
   agent-discovery documents, runs the WordLift AI Audit foundation analysis, and classifies the
   content with Google Natural Language V2.
2. **Maps what an agent should be able to do** — infers one of six operating archetypes
   deterministically and compiles an ordered capability journey: Discover → Understand/Decide → Act
   → Manage, drawn from a versioned model of 24 governed actions.
3. **Checks what an agent actually can do** — reads the WebMCP tools registered in the page,
   completes a handshake with any MCP server the site advertises, and calls the tools that server
   annotates read-only and non-destructive. One of six states per action is derived from typed
   evidence, keeping human support and agent support strictly separate.
4. **Hands you the fix** — every incomplete action gets a plain-language recommendation and a
   JSON-LD capability contract with inputs, outputs, governance, and provenance.
5. **Closes a gap for real** — where a site has a usable endpoint and no agent interface, an
   approved read-only WebMCP sidecar makes it agent-callable, and the successful call is written
   back as evidence into a new immutable revision.

The whole thing is itself a WebMCP surface: `audit-website`, `explain-capability`, and
`check-alpina-availability` register on `document.modelContext`, so an agent in ChatGPT's built-in
browser can run the audit and read the findings without touching the UI.

## The rule that makes it honest

**Declaration earns zero points, and we actually go and check.** A `.well-known/mcp.json` that
exists is `unverified`, not ready. An action counts as agent-ready only when a call succeeded — so
the audit opens the session, completes the handshake, and makes the call. A standard you never apply
is a slogan.

This is why alpina.travel — one of the best-equipped sites on the agentic web, with WebMCP tools in
the page, a live MCP server, UCP, an agent card and an API catalogue — scores **22/100 on verified
agent readiness** against a foundation score in the low nineties. Those are two different questions
and we refuse to average them into one comfortable number.

## The demo: what a checklist cannot see

alpina.travel is the rare site that did the work, which makes it the hardest possible subject and
the only honest one. The audit finds three things no checklist can produce.

**Six WebMCP tools no crawler can find.** One annotated on the availability form, five registered
through `navigator.modelContext`. They exist only in the page, so they are invisible to any audit
that probes for a manifest.

**A call, not a declaration.** The audit opens an MCP session on the server the site advertises,
completes the handshake, and calls `search_products` for real. `site.search` reads `agent-ready`
because the call returned, not because a file exists.

**Two defects the site did not know it had.** `/mcp/sse` — the endpoint linked from its own homepage
navigation — issues a session endpoint and then rejects every request to it with a `405`. And
`search_products` returns products with an empty `id` and `sku`, so an agent cannot chain search to
detail or availability. Both are reported in the server's own words.

Then the gap that remains gets closed. Run the approved read-only sidecar — from the page, or by
asking an agent in ChatGPT — and it calls the real public endpoint. Availability comes back with a
live quote (€644.80 for 12–15 September, 2 guests, with the cancellation policy and tourist tax).
That successful invocation is written as `invoked` evidence into a **new immutable revision** of the
report, where `availability.check` moves from `unverified` to `sidecar-enabled` and verified
readiness goes **22 → 35**.

Nothing is booked, held, or paid. The tool says so in its description and in every response.

The parent report is unchanged — a link you already shared never mutates under its reader.

## How we built it

One TypeScript package: React 19 + Vite in the browser, Express on Cloud Run, Firestore for
immutable anonymous report revisions.

- **The action model is data, not code.** `action-model/v0.1.0/` holds 24 actions, six archetype
  journeys, Google category weights, and behavioral rules. Adding a vertical means adding JSON.
- **Deterministic compilation.** Same inputs and model version, same action IDs, order, scores, and
  contracts. Golden snapshots for all six archetypes enforce it.
- **Evidence has a verification level** — `observed`, `declared`, `invoked`, `failed` — and only
  `invoked` raises the score. The collector's own reading overrides the foundation audit's claim
  that a file exists.
- **Calling a stranger's tools, carefully.** Only what the server annotates read-only and
  non-destructive, only when the name carries no transactional verb, only when every required
  argument can be filled without inventing an identifier, and never more than five per endpoint.
- **WebMCP through the Chrome-maintained `use-webmcp-tool` hook**, on the current
  `document.modelContext` API. Tools follow page context: the report-scoped tool unregisters on
  unmount, and the sidecar registers only on the report it applies to. Tool names, descriptions, and
  schemas are static constants — audited site text never reaches them.
- **The URL policy is the product's spine.** The app fetches arbitrary URLs from anonymous callers,
  so every request passes scheme, credential, port, host, and IP validation, with each redirect hop
  revalidated and IPv4-mapped and NAT64 forms of private ranges blocked.

## Challenges

**Looking for WebMCP in the wrong place.** Our own first detector probed
`/.well-known/webmcp/tools.json`, which is not part of the spec. Because alpina answers unknown
paths with its homepage, the miss was recorded as a *broken declaration* — so the site with six
working WebMCP tools was reported as having a broken one. Fixing it meant reading the tools out of
the page: the declarative attributes in the HTML we already parsed, and a static scan of the site's
own scripts for `navigator.modelContext.registerTool`.

**A call that only looked successful.** When we started calling tools for real, alpina's server
answered an unknown product with `isError: false` and an error object inside the payload. Our probe
recorded two verified invocations that had not happened — the exact false positive this product
exists to prevent. Three guards came out of that: read the payload and not just the flag, split tool
names into words before applying the block list (`_` is a word character, so `\bcheckout\b` never
matched `create_checkout_session`), and chain identifiers only out of listing results so a session id
is never passed to a lookup and the site blamed for the failure.

**The soft-404 problem.** A site whose catch-all returns its homepage makes every probe look
present. The collector now asks for a path that cannot exist; if that answers `200` it stops
trusting `200` on that host, and reports the soft 404 once as an observation rather than accusing
each probed path of being broken.

**Telling the truth about a site that already tried.** Alpina is not a strawman — it is better
equipped than almost anything on the web. The easy demo, "look, no API!", would have been a lie. The
honest finding is subtler and far more useful: six tools an agent can see, one call it can complete,
one advertised endpoint that does not work, and a catalogue an agent cannot navigate.

## What we learned

The gap between "AI-readable" and "AI-actionable" is much wider than the industry's checklists
suggest, and it is invisible unless you insist on invocation. But insisting is not enough: an audit
that demands proof and never attempts a call measures nothing. The moment we started calling, the
findings got specific — a broken endpoint, an uncrawlable catalogue — and the roadmap for a site
owner became obvious, which is exactly what the contracts are for.

## What's next

Blended multi-archetype graphs, more approved sidecars, contributed detectors, and promoting the
capability map into WordLift's knowledge graph as a queryable action layer.

## Built with

TypeScript, React 19, Vite, Express, Node 22, Zod, WebMCP (`document.modelContext`),
`use-webmcp-tool`, Google Cloud Run, Firestore, Google Natural Language V2, WordLift AI Audit API,
Vitest, Testing Library, Supertest, Playwright, JSON-LD, Schema.org, Apache-2.0.

## Try it (judge path, three minutes)

1. Open **https://beta.audit.wordlift.io**.
2. Enter `alpina.travel` and press **Map capabilities**. You get the archetype, both scores, the top
   three gaps, and the four-stage capability map.
3. Click **Check availability** to see human vs agent evidence, the recommendation, and the JSON-LD
   contract. Copy or download it.
4. Scroll to **Approved sidecar**, keep the default dates, and press **Run agent function**. A real
   read-only call returns live availability, and the report becomes a `sidecar-enabled` child
   revision.
5. Optional, with WebMCP: open the same URL in the **ChatGPT desktop app's built-in browser**
   (GPT-5.6 Sol or Terra; not available in Enterprise or Edu workspaces) and ask it to audit a site.
   Or use **Chrome 149+** with `chrome://flags/#enable-webmcp-testing` enabled plus the Model
   Context Tool Inspector extension.

No account, no key, no setup. To run it yourself: `npm ci && npm run dev:demo` works with no
credentials at all.

## Links

- **Live app:** https://beta.audit.wordlift.io (deployed in live mode, verified 2026-08-27)
- **Repository:** [CONFIRM — `https://github.com/wordlift/ai-audit-webmcp`, must be public]
- **Demo video:** [CONFIRM — under 3 minutes, see `docs/submission/handoff.md` for the script]

## Testing and verification

198 unit, integration, and component tests plus 5 Playwright browser tests, all green. Coverage
includes the compiled journeys for all six archetypes, the evidence state truth table, the
verification-only scoring rule, JSON-LD contract expansion, adversarial URL cases, rate limits,
WebMCP tool lifecycle against a stubbed `document.modelContext`, the live provider mappings, and the
full sidecar transformation.

The detection and invocation work carries its own suite: declarative and imperative WebMCP
extraction, the MCP handshake over both transports including CRLF framing, and every guard on
calling a stranger's tools — the block list read as words, an error payload behind
`isError: false`, an identifier that must not be invented, and an empty one that is not an
identifier.

Live verification against real services: WordLift AI Audit (`api.wordlift.io`), Google Natural
Language V2, Firestore with an active TTL policy, and the real Alpina availability endpoint.

## AI usage disclosure

**[CONFIRM the exact wording with Andrea before submitting.]** The product scope, PRD, technical
specification, and build checklist were developed in a guided AI-assisted process; implementation
was written with AI coding assistants under review, with every checklist item gated on automated
verification and four participant review pauses. The application's own runtime uses AI services only
for content classification (Google Natural Language V2) and the WordLift AI Audit foundation
analysis; the action model, archetype inference, evidence states, scoring, and contract compilation
are deterministic code, not model output.

## Open source

Apache-2.0. Everything in the repository is new work for this challenge: the action model, evidence
rules, scoring, contracts, UI, WebMCP tools, sidecar, security layer, fixtures, and tests. WordLift's
private AI Audit service is one optional provider behind an interface; contributors without
credentials get the complete deterministic experience in demo mode.

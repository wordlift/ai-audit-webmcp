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

Worse, the signals everyone checks are trivially faked. During this build we pointed the audit at a
site that publishes `/.well-known/mcp.json`, `/.well-known/webmcp/tools.json`, and `/openapi.json`.
All three returned HTTP 200. All three returned the site's HTML homepage. A checklist audit — the
foundation audit we ourselves call — scored them as present. They were soft 404s. If the industry
grades agent-readiness on whether a URL returns 200, everyone passes and no agent can do anything.

## What it does

Enter a public URL and the application:

1. **Understands the site** — collects the page, its forms, its structured data, and its
   agent-discovery documents, runs the WordLift AI Audit foundation analysis, and classifies the
   content with Google Natural Language V2.
2. **Maps what an agent should be able to do** — infers one of six operating archetypes
   deterministically and compiles an ordered capability journey: Discover → Understand/Decide → Act
   → Manage, drawn from a versioned model of 24 governed actions.
3. **Checks what an agent actually can do** — derives one of six states per action from typed
   evidence, keeping human support and agent support strictly separate.
4. **Hands you the fix** — every incomplete action gets a plain-language recommendation and a
   JSON-LD capability contract with inputs, outputs, governance, and provenance.
5. **Closes one gap for real** — an approved read-only WebMCP sidecar makes a human-only capability
   agent-callable, and the successful call is written back as evidence.

The whole thing is itself a WebMCP surface: `audit-website`, `explain-capability`, and
`check-alpina-availability` register on `document.modelContext`, so an agent in ChatGPT's built-in
browser can run the audit and read the findings without touching the UI.

## The rule that makes it honest

**Declaration earns zero points.** A `.well-known/mcp.json` that exists is `unverified`, not ready.
An action only counts as agent-ready when a call actually succeeded. This is why alpina.travel —
which publishes llms.txt, skill.md, an agent-skills index, and a working booking API — still scores
**0/100 on verified agent readiness** against a **92/100 foundation score**. Those are two different
questions and we refuse to average them into one comfortable number.

## The demo: unverified → sidecar-enabled

alpina.travel has a public availability API and a booking form. A person can check dates. An
interface is announced. But no agent call has ever been proven, so the capability map reads
`unverified`.

Run the approved sidecar — from the page, or by asking an agent in ChatGPT — and it calls the real
public read-only endpoint. Availability comes back with a real quote (€644.80 for 12–15 September,
2 guests, with the cancellation policy and tourist tax). That successful invocation is written as
`invoked` evidence into a **new immutable revision** of the report, where the same action now reads
`sidecar-enabled` and verified readiness moves 0 → 13.

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
  `invoked` raises the score. A discovery document that answers with HTML is recorded as `failed`,
  and the collector's own reading overrides the foundation audit's claim that the file exists.
- **WebMCP through the Chrome-maintained `use-webmcp-tool` hook**, on the current
  `document.modelContext` API. Tools follow page context: the report-scoped tool unregisters on
  unmount, and the sidecar registers only on the report it applies to. Tool names, descriptions, and
  schemas are static constants — audited site text never reaches them.
- **The URL policy is the product's spine.** The app fetches arbitrary URLs from anonymous callers,
  so every request passes scheme, credential, port, host, and IP validation, with each redirect hop
  revalidated and IPv4-mapped and NAT64 forms of private ranges blocked.

## Challenges

**Proving a tool call, not just finding one.** A crawler can see a declaration; it cannot prove
another origin's `document.modelContext` call succeeds. We scoped this honestly: runtime
verification happens in a page we control, and everything else stays `unverified`. Refusing to claim
verification we cannot perform shaped the entire scoring model.

**The soft-404 problem.** Discovering that three "present" agent-discovery files were actually the
homepage forced a real design change: parse every discovery document, record a broken declaration as
failed evidence, and let the collector's verified reading outrank the upstream audit's boolean.

**Telling the truth about a site that already tried.** Alpina is not a strawman with nothing. The
easy demo — "look, no API!" — would have been a lie. The honest before-state is `unverified`, which
makes a subtler but more valuable point: publishing a manifest is not the same as being callable.

## What we learned

The gap between "AI-readable" and "AI-actionable" is much wider than the industry's checklists
suggest, and it is invisible unless you insist on invocation. Once you separate the two questions,
the roadmap for a site owner becomes obvious — which is exactly what the contracts are for.

## What's next

Blended multi-archetype graphs, more approved sidecars, contributed detectors, and promoting the
capability map into WordLift's knowledge graph as a queryable action layer.

## Built with

TypeScript, React 19, Vite, Express, Node 22, Zod, WebMCP (`document.modelContext`),
`use-webmcp-tool`, Google Cloud Run, Firestore, Google Natural Language V2, WordLift AI Audit API,
Vitest, Testing Library, Supertest, Playwright, JSON-LD, Schema.org, Apache-2.0.

## Try it (judge path, three minutes)

1. Open **[LIVE URL — CONFIRM after deploy]**.
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

- **Live app:** [CONFIRM after deploy — `https://ai-audit-webmcp-383880673216.us-west1.run.app`]
- **Repository:** [CONFIRM — `https://github.com/wordlift/ai-audit-webmcp`, must be public]
- **Demo video:** [CONFIRM — under 3 minutes, see `docs/submission/handoff.md` for the script]

## Testing and verification

163 unit, integration, and component tests plus 5 Playwright browser tests, all green. Coverage
includes the compiled journeys for all six archetypes, the evidence state truth table, the
verification-only scoring rule, JSON-LD contract expansion, adversarial URL cases, rate limits,
WebMCP tool lifecycle against a stubbed `document.modelContext`, the live provider mappings, and the
full sidecar transformation.

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

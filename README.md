# WordLift AI Audit — Agent Capability Map

**Pages give AI agents knowledge. Functions let them act.**

Enter a public URL. The application classifies the site, infers the actions an AI agent should be
able to perform there, compares those expectations with the evidence humans and agents actually
have, and turns every gap into an implementation-ready action contract. It exposes itself as a set
of WebMCP tools, so an agent can run the whole audit from a chat — and rather than stopping at the
diagnosis, it calls what a site declares and closes one gap it finds.

**Live:** [beta.audit.wordlift.io](https://beta.audit.wordlift.io) · Built for [The WebMCP Challenge](https://webmcp.devpost.com).

## What makes this different from a checklist

Most audits tell you what a page is missing. This one asks a harder question: **what should an agent
be able to *do* here, and can it?**

- **Deterministic action model.** Six site archetypes, 24 governed actions, compiled into an ordered
  Discover → Understand/Decide → Act → Manage journey. Same inputs and model version, same output.
- **Verification-only readiness, actually attempted.** A declared interface earns zero points. The
  audit completes an MCP handshake and calls the tools a server annotates read-only and
  non-destructive; only a completed call scores. A standard you never apply is a slogan.
- **WebMCP is read where it lives.** It has no discovery document — tools are registered in the
  page. The collector reads declarative `toolname` attributes out of the HTML and statically scans
  same-origin scripts for `navigator.modelContext.registerTool`. Probing `/.well-known/` for WebMCP
  can only ever miss a site that implements it correctly.
- **Evidence that can be wrong.** Many sites answer every unknown path with their HTML shell, so the
  collector asks for a path that cannot exist. If that returns `200`, it stops trusting `200` on
  that host and reports the soft 404 once, as an observation — rather than accusing every probed
  path of being a broken declaration.
- **Human and agent support are separate.** "People can book here" and "an agent can book here" are
  different findings, shown side by side.
- **Gaps come with contracts.** Every incomplete action gets a plain-language recommendation and a
  JSON-LD capability contract with inputs, outputs, governance, and provenance.

## The wow moment

`alpina.travel` is not a strawman. It is the rare site that did the work: WebMCP tools registered in
the page, a live MCP server, UCP, an agent card, an API catalogue, llms.txt. A checklist auditor
sees a few `200`s and moves on. This audit reads the site's own scripts, talks to its server, and
comes back with three things a checklist cannot produce.

**Six WebMCP tools no crawler can find.** WebMCP has no discovery document, so the tools are only
visible in the page: one annotated on the availability form, five registered through
`navigator.modelContext`.

**A completed call, not a declaration.** The audit opens an MCP session, completes the handshake,
and calls `search_products` for real. That is what `site.search` reading `agent-ready` means here.
Nothing was awarded for publishing a manifest.

**Two defects the site did not know it had.** `/mcp/sse` — the endpoint linked from its own homepage
— hands out a session endpoint and then rejects every request to it with a `405`. And
`search_products` returns products with an empty `id` and `sku`, so an agent cannot chain search to
detail or availability. Both are reported in the server's own words.

Verified agent readiness comes to **22/100** against a foundation score in the low nineties. Two
different questions, and we refuse to average them into one comfortable number.

Then the approved read-only sidecar closes the remaining availability gap: an agent calls it, the
successful invocation is written into a new immutable revision, and the action moves from
`unverified` to `sidecar-enabled` — **22 → 35**. Nothing is booked, held, or paid. The sidecar looks
up availability and says so, every time.

Numbers are from a live run on 27 August 2026; they move as the site does, which is the point.

## Quick start (no credentials needed)

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev:demo
```

- Web app: `http://localhost:5173`
- API health: `http://localhost:3000/api/health`

Demo mode runs all six archetypes, the compiler, the UI, the WebMCP tools, and the tests from
deterministic fixtures — no WordLift, Google, or ScrapingBee credentials required. Try these
fixture hosts: `alpina.travel`, `shop.example`, `publisher.example`, `insurance.example`,
`saas.example`, `organization.example`.

## Using it from an agent

The app registers three tools on `document.modelContext` (the current WebMCP surface):

| Tool | Scope | What it does |
|---|---|---|
| `audit-website` | Everywhere | Audits a public URL and returns archetype, readiness score, priority gaps, stage counts, and a shareable report URL. Resolves only when a terminal report exists. |
| `explain-capability` | A completed report | Explains one action: expectation, state, human vs agent support, bounded evidence, recommendation, contract URL, and governance. |
| `check-alpina-availability` | An `alpina.travel` report | The approved read-only sidecar. Asks for missing dates instead of inventing them. |

Two ways to drive them:

- **ChatGPT desktop app** — open the site in the app's built-in browser, then ask it to audit a URL.
  WebMCP tools surface as "Site tools". (Not available in Enterprise or Edu workspaces.)
- **Chrome 149+** — enable `chrome://flags/#enable-webmcp-testing`, relaunch, and use the
  [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector)
  extension or the WebMCP pane in DevTools' Application tab.

Without WebMCP the normal web interface is unchanged; nothing degrades.

## Verification

```bash
npm run typecheck
npm test -- --run
npm run build
```

Browser tests need Playwright's Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

WebMCP tool lifecycle tests run against a stub `document.modelContext`
(`src/client/webmcp/testing/modelContextStub.ts`, usable by contributors for their own tools):

```bash
npm run test:webmcp
```

## Live mode

Live mode adds the private WordLift AI Audit foundation score, real page collection, Google
Natural Language V2 categories, and Firestore-backed shareable reports. See
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) for configuration and deployment.

```bash
cp .env.example .env   # fill in the live values
npm run smoke:live -- https://alpina.travel
```

## Architecture

One TypeScript package: React 19 + Vite in the browser, Express on Cloud Run, provider interfaces
for every external dependency.

```
URL ──▶ understanding ──▶ mapping ──▶ checking ──▶ immutable report
        collect page      infer       derive states
        foundation audit  archetype   score, prioritize
        classify text     compile     compile contracts
                          expected
                          actions
```

| Layer | Where | Notes |
|---|---|---|
| Action model | [`action-model/v0.1.0/`](action-model/v0.1.0/) | Versioned data: actions, archetypes, category and behavior rules. Code compiles it; it is not code. |
| Domain | [`src/domain/`](src/domain/) | Archetype inference, graph compilation, evidence detection, state derivation, scoring, contracts. |
| Server | [`src/server/`](src/server/) | Express API, provider adapters, URL policy, rate limits, report stores, Alpina sidecar. |
| Client | [`src/client/`](src/client/) | Report UI, capability map, contract viewer, WebMCP tool registration. |
| Shared | [`src/shared/`](src/shared/) | Zod schemas, inferred types, agent-facing formatters. |

Design decisions, the PRD, and the technical specification live in
[`docs/hackathon-build/`](docs/hackathon-build/). The interface follows the WordLift Core Brand
design system — palette, type roles, and the accessible colour pairings are documented in
[`docs/BRAND.md`](docs/BRAND.md).

## Open source boundary

Everything in this repository is new work for the WebMCP Challenge: the action model, evidence
rules, scoring, contracts, UI, WebMCP tools, sidecar, security layer, fixtures, and tests. No source
was copied from WordLift's private `ai-audit` service.

That private service is one **optional provider**. In live mode it supplies the broad foundation
audit through `POST /audit`; the public application maps its response into public domain objects and
never leaks a private response type. Contributors without WordLift credentials get the complete
deterministic experience in demo mode — that is the point of the fixture providers.

Extending it: [`CONTRIBUTING.md`](CONTRIBUTING.md) covers adding an archetype, action, detector,
fixture, or sidecar. Trust boundaries and reporting: [`SECURITY.md`](SECURITY.md).

## Known limitations

- A page's WebMCP registrations can be read but not exercised: nothing outside a page this
  application controls can prove another origin's `navigator.modelContext` call succeeds, so those
  stay `declared`. Calls against a site's MCP server are proven for real.
- Tool calls are deliberately narrow: read-only and non-destructive by the server's own annotation,
  no transactional verb in the name, every required argument fillable without inventing an
  identifier, five calls per endpoint. The deprecated HTTP+SSE transport is listed, never called.
- One working sidecar (Alpina availability, read-only). Contract generation is general; universal
  proxy generation and browser automation are deliberately out of scope.
- The action model is version `0.1.0` and provisional. Its vocabulary URI is not yet stable.
- Archetype inference blends Google categories with behavioral signals; a low score or a narrow
  margin is marked provisional and can be overridden, which creates a child report.

## License

Apache-2.0. WordLift marks and branding remain the property of WordLift.

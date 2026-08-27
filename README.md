# WordLift AI Audit — Agent Capability Map

**Pages give AI agents knowledge. Functions let them act.**

Enter a public URL. The application classifies the site, infers the actions an AI agent should be
able to perform there, compares those expectations with the evidence humans and agents actually
have, and turns every gap into an implementation-ready action contract. It exposes itself as a set
of WebMCP tools, so an agent can run the whole audit from a chat — and it proves the thesis by
turning one human-only capability into a working, verified agent function.

**Live:** [beta.audit.wordlift.io](https://beta.audit.wordlift.io) · Built for [The WebMCP Challenge](https://webmcp.devpost.com).

## What makes this different from a checklist

Most audits tell you what a page is missing. This one asks a harder question: **what should an agent
be able to *do* here, and can it?**

- **Deterministic action model.** Six site archetypes, 24 governed actions, compiled into an ordered
  Discover → Understand/Decide → Act → Manage journey. Same inputs and model version, same output.
- **Verification-only readiness.** A declared interface earns zero points. A `.well-known/mcp.json`
  that exists is `unverified`, not ready. Only a successful invocation counts.
- **Evidence that can be wrong.** Many sites answer every unknown path with their HTML shell, so a
  `200` on `/.well-known/webmcp/tools.json` proves nothing. The collector parses each discovery
  document and records a broken declaration as a failed check rather than a feature.
- **Human and agent support are separate.** "People can book here" and "an agent can book here" are
  different findings, shown side by side.
- **Gaps come with contracts.** Every incomplete action gets a plain-language recommendation and a
  JSON-LD capability contract with inputs, outputs, governance, and provenance.

## The wow moment

`alpina.travel` publishes llms.txt, a skill description, an agent-skills index, and a real booking
API. It scores **94/100** on the foundation audit and **0/100** on verified agent readiness. Its
availability check is `human-only`: a person can pick dates, and no agent call has ever been proven.
Three of its `.well-known` agent files answer with the site's HTML homepage, so the report records
them as broken declarations rather than features.

The report registers an approved read-only WebMCP sidecar, an agent calls it, and the successful
invocation is written as evidence into a new immutable revision of the report — where the same
action reads `sidecar-enabled` and verified readiness moves 0 → 13.

Nothing is booked, held, or paid. The sidecar looks up availability and says so, every time.

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

- Runtime WebMCP verification only happens in a page this application controls. A crawler can see a
  static declaration; it cannot prove another site's `document.modelContext` call succeeds.
- One working sidecar (Alpina availability, read-only). Contract generation is general; universal
  proxy generation and browser automation are deliberately out of scope.
- The action model is version `0.1.0` and provisional. Its vocabulary URI is not yet stable.
- Archetype inference blends Google categories with behavioral signals; a low score or a narrow
  margin is marked provisional and can be overridden, which creates a child report.

## License

Apache-2.0. WordLift marks and branding remain the property of WordLift.

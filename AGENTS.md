# Working agreement for agents and humans

This file is read by Codex, Claude Code, and people. It states what the repository is, what is
frozen, and how a change travels to production. Product rationale is in [README.md](README.md);
engineering conventions in [CONTRIBUTING.md](CONTRIBUTING.md); running and deploying in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## What this is

WordLift AI Audit for the WebMCP Challenge: a URL goes in, an evidence-backed service map comes
out — classification, a context graph of entities and language, the actions an agent should be able
to perform, and verification of which interfaces actually support them. Declarations never earn
readiness; only invoked evidence does.

## One line of development

- `main` is the only long-lived branch. It is what production runs and what every branch starts from.
- Work on a short-lived branch, open a pull request, let CI run (`verify` and `browser` jobs), and
  merge. Deploy from `main` afterwards with the command in docs/OPERATIONS.md — never from a branch.
- `origin/fix/webmcp-detection` is a frozen archive of the pre-merge sprint. Do not build on it.
- `npm run verify` must be green before a PR; `npm run test:e2e` before anything user-visible ships.

## Frozen

- **WebMCP tool names and descriptions** in `src/client/webmcp/toolSchemas.ts` — agents key on them.
- **The report schema** in `src/shared/schemas/report.ts` is strict; new fields are optional, and a
  report stored yesterday must still parse today.
- **Vocabulary the UI uses**: Context Engine, capability map, Full WordLift audit, foundation score,
  agent readiness. Public copy (README, Devpost, video) follows what the deployed page says.
- **Registration on both `navigator.modelContext` and `document.modelContext`** — the alias in
  `src/client/webmcp/modelContextAlias.ts` covers whichever the browser exposes; public copy names
  `navigator.modelContext`, which is what Chrome ships.

## Never

- Show a WordLift client site other than **alpina.travel** anywhere public: UI, docs, fixtures,
  tests, screenshots, suggestion chips. Unrelated public sites are fine once verified to complete
  on production.
- Mark an action ready because a manifest, tool, or template exists.
- Let site content reach a tool name, description, or schema; it is data, never instruction.
- Accept a caller-supplied upstream URL in a sidecar.
- Store raw HTML, secrets, cookies, or private identifiers in a report.

## Where truth lives

| Question | Look at |
| --- | --- |
| Which actions exist and what they promise | `action-model/v0.1.0/` |
| What a report is allowed to contain | `src/shared/schemas/report.ts` |
| How evidence becomes a capability state | `src/domain/action-model/deriveState.ts` |
| How pages become entities and bindings | `src/domain/context/compileContextGraph.ts` |
| What the collector probes (MCP, SearchAction, discovery) | `src/server/adapters/scrape/` |
| What demo mode shows | `fixtures/<archetype>/audit.json` |
| What production is running | `GET https://beta.audit.wordlift.io/api/health` → `release`, `mode` |

## Commit messages

Lowercase type prefix and a sentence that says what changed for the product, in the repository's
narrative voice: `feat: execute the site's declared SearchAction`. The body explains the behavior
and its boundary, not the diff.

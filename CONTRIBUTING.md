# Contributing

Thanks for helping map what AI agents can actually do on the web.

Everything in this repository runs without credentials. `npm run dev:demo` gives you the complete
experience from deterministic fixtures, and every gate below passes offline.

```bash
npm ci
npm run dev:demo        # web app on :5173, API on :3000
npm run verify          # typecheck + tests + build — run this before opening a PR
```

## How a change ships

`main` is the only long-lived branch and the one production runs. Branch from it, open a pull
request, let CI run the same gates (`verify`, then the Playwright `browser` job), merge, and deploy
from `main` with the command in [docs/OPERATIONS.md](docs/OPERATIONS.md). The working agreement for
agent-assisted development — what is frozen and what is never done — is in [AGENTS.md](AGENTS.md).

## Principles that shape every change

1. **Never claim support that was not observed.** A declaration is `unverified` until an invocation
   succeeds. If you cannot prove it, the report must say so.
2. **The model is data.** Actions, archetypes, and rules live in `action-model/`. Code compiles
   them. A new vertical should not need a new `if`.
3. **Deterministic output.** The same inputs and model version must produce the same action IDs,
   order, scores, and contracts. Golden snapshots enforce this.
4. **Site content is data, never instruction.** Collected text is bounded and sanitized, and never
   reaches a tool name, description, or schema.

## Add an archetype

1. Create `action-model/v0.1.0/archetypes/<your-archetype>.json` listing ordered action IDs per
   stage. Keep the first view readable — six to twelve expected actions.
2. Add the archetype to `archetypeSchema` in `src/shared/schemas/report.ts`.
3. Add Google category weights to `mappings/google-categories.json` and behavioral signals to
   `mappings/behavior-rules.json`.
4. Add a fixture under `fixtures/<your-archetype>/audit.json` (see below).
5. Run `npm test -- --run tests/golden` and review the new snapshot as a product decision, not a
   formality: read the compiled journey and check it describes a real user's path.

## Add an action

1. Append it to `action-model/v0.1.0/actions.json` with a stable `id` (`domain.verb`), stage,
   intent, importance, governance, `evidenceRules`, and `recommendedDelivery`.
2. Governance is a promise to the agent: a transactional action must declare authorization,
   confirmation, and side effects honestly.
3. Reference the action from at least one archetype template.
4. Contracts and recommendations are generated — no extra code needed.

## Add a detector

Detectors turn collected evidence into typed `CapabilityEvidence`.

- Human-facing page and form signals: `src/domain/evidence/detectSiteEvidence.ts`.
- Schema.org and declared-name mappings: `src/domain/evidence/schemaActions.ts`.
- Foundation-audit findings: `src/server/adapters/audit/WordLiftAudit.ts`.
- Probes that run at collection time and produce `invoked`/`failed` evidence — MCP endpoints
  (`mcpProbe.ts`), the declared SearchAction template (`searchAction.ts`): `src/server/adapters/scrape/`.
  A probe calls only what is safe and read-only, never invents an identifier, and reports a blind
  200 as a declaration rather than a success.

Pick `verification` deliberately: `observed` (seen on the page), `declared` (announced but
uncalled), `invoked` (a call succeeded), `failed` (checked and it did not hold up). Only `invoked`
evidence may raise the readiness score.

## Add a fixture

Fixtures are sanitized, dated snapshots — never a live capture with personal data or secrets, and
never a WordLift client site other than alpina.travel. Invent a host under `.example`.

```jsonc
{
  "id": "your-archetype",
  "url": "https://your-site.example/",
  "archetype": "your-archetype",
  "status": "completed",              // or "partial" / "failed"
  "categories": [{ "name": "/Shopping", "confidence": 0.9 }],
  "signals": ["schema:Product", "path:checkout"],
  "foundation": {                     // optional sections, quickWins, botAccess as in the report schema
    "score": 71, "summary": "…", "findings": ["…"], "provider": "fixture"
  },
  "evidence": [ /* CapabilityEvidence items */ ],
  "pages": [                          // up to four; these feed the context graph
    {
      "url": "https://your-site.example/", "title": "…", "description": "…",
      "role": "entry",                // entry | detail | offer | policy | contact | other
      "text": "…", "headings": ["…"], "linkPaths": ["/products/…"], "linkLabels": ["…"],
      "forms": [], "jsonLdTypes": ["Organization"],
      "entities": [{ "id": "https://your-site.example/#org", "types": ["Organization"], "name": "…",
                     "alternateNames": [], "sourceUrl": "https://your-site.example/", "sameAs": [], "offers": [] }],
      "pageTools": [], "truncated": false
    }
  ]
}
```

Register the file in `src/server/adapters/fixtures/FixtureProvider.ts` (demo mode resolves a
fixture by its host), then confirm `tests/integration/fixture-providers.test.ts`, the golden
snapshots, and `tests/e2e/archetype-matrix.spec.ts` still pass. The travel fixture must keep the
`Samspitze 4` apartment entity: it is what the alpina sidecar grounds its answer in.

## Stores and the running record

A `ReportStore` has `put`, `update`, `finalize`, `get`, and `createRevision`. `update` replaces a
record that is still `running` — it is how the orchestrator publishes progress (entities as the
collector lands, the foundation score as the audit lands) so the report page can show them before
the final report exists. Any new store must keep the invariant: `update` refuses a record that is
not running, `finalize` happens exactly once, and a finalized report never changes.

## Add a sidecar

A sidecar makes one human-only capability callable by an agent. The Alpina availability adapter
(`src/server/sidecars/alpina/`) is the reference implementation. The rules are not negotiable:

- The upstream endpoint is **fixed in code**. Never accept a caller-supplied URL.
- Validate every input with Zod before calling out, and allowlist every field you return.
- Read-only unless the site owner has explicitly approved more. Say what the call did and did not do.
- An upstream failure is a failure — never report it as "no availability".
- On success, emit evidence with `verification: "invoked"` and an id prefixed `sidecar:`. That
  prefix is what allows the `sidecar-enabled` state.
- Register the WebMCP tool only where it applies, with `readOnlyHint` and a static description.

Tests to mirror: `tests/unit/alpina-schemas.test.ts`,
`tests/integration/alpina-sidecar.test.ts`, `tests/component/alpina-webmcp-tool.test.tsx`.

## Add a tool

A tool is defined once, in `src/shared/tools/definitions.ts`, and published by every surface that
offers it. Keep the schema static: site-authored text must never reach a name, description, or
input schema. State all three review annotations — `readOnlyHint`, `destructiveHint`,
`openWorldHint` — truthfully about the tool's *effect*, not its answer, and keep
`untrustedContentHint` on anything carrying website evidence.

Then wire the surfaces that should offer it:

- **In the browser**, register through the `useWebMCP` hook and let it abort its signal on unmount.
  Test against the bundled stub:

  ```ts
  import { installModelContextStub, toolText } from "../../src/client/webmcp/testing/modelContextStub";
  ```

- **Remotely**, add a method to `AuditToolService` and an entry to `REMOTE_TOOLS`
  (`src/server/mcp/tools.ts`). The service is where the answer is composed, so both surfaces return
  the same object; a transport-specific difference belongs in `src/shared/tools/transports.ts` as a
  variant of the shared definition, never as a second definition.

The published contract is snapshotted (`tests/unit/mcp-tool-definitions.test.ts`): a deliberate
change updates the snapshot in the same commit, and an accidental one fails the build.

## Tests

| Suite | Covers |
|---|---|
| `tests/unit` | Model compilation, context graph, state derivation, scoring, contracts, URL policy, sanitization, collectors and probes (native fetch, ScrapingBee fallback, MCP probe, SearchAction), sidecar schemas and entity grounding, the published tool contract and the plugin package |
| `tests/integration` | Report API, providers, stores (including running-record updates), error paths, rate limits, live orchestration and progress, the WordLift audit mapping, sidecar, the tool service and its parity with REST, the remote MCP endpoint driven by a real client, deep-scan access, report claims |
| `tests/component` | Executive summary, context map, capability map, foundation panel, report progress, dialog focus, WebMCP tool lifecycle |
| `tests/golden` | Compiled journeys for all six archetypes |
| `tests/e2e` | Landing, every archetype fixture to a report, the alpina sidecar flow, visual proof at desktop and mobile widths |

`npm run test:mcp` runs the focused set for the tool contract and the remote endpoint; `npm run
verify` runs everything, so it is not run twice there. Run `npm run test:e2e` locally before
shipping anything user-visible; it builds and serves the app itself. Component tests that render the home page stub `fetch` — the page probes `/api/health`
once to learn whether it is in demo or live mode.

## Pull requests

Run `npm run verify`. Describe what changed in the product, not only in the code. If your change
affects what the report claims about a site, say which evidence justifies the new claim.

# Contributing

Thanks for helping map what AI agents can actually do on the web.

Everything in this repository runs without credentials. `npm run dev:demo` gives you the complete
experience from deterministic fixtures, and every gate below passes offline.

```bash
npm ci
npm run dev:demo        # web app on :5173, API on :3000
npm run verify          # typecheck + tests + build — run this before opening a PR
```

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

Pick `verification` deliberately: `observed` (seen on the page), `declared` (announced but
uncalled), `invoked` (a call succeeded), `failed` (checked and it did not hold up). Only `invoked`
evidence may raise the readiness score.

## Add a fixture

Fixtures are sanitized, dated snapshots — never a live capture with personal data or secrets.

```jsonc
{
  "id": "your-archetype",
  "url": "https://example.com/",
  "archetype": "your-archetype",
  "status": "completed",              // or "partial" / "failed"
  "categories": [{ "name": "/Shopping", "confidence": 0.9 }],
  "signals": ["schema:Product", "path:checkout"],
  "foundation": { "score": 71, "summary": "…", "findings": ["…"], "provider": "fixtures" },
  "evidence": [ /* CapabilityEvidence items */ ]
}
```

Register the file in `src/server/adapters/fixtures/FixtureProvider.ts`, then confirm
`tests/integration/fixture-providers.test.ts` still passes.

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

## Add a WebMCP tool

Register through the `useWebMCP` hook, keep the schema static, and unregister on unmount by letting
the hook abort its signal. Test against the bundled stub:

```ts
import { installModelContextStub, toolText } from "../../src/client/webmcp/testing/modelContextStub";
```

## Tests

| Suite | Covers |
|---|---|
| `tests/unit` | Model compilation, state derivation, scoring, contracts, URL policy, sanitization, sidecar schemas |
| `tests/integration` | Report API, providers, stores, error paths, rate limits, live orchestration, sidecar |
| `tests/component` | Capability map, dialog focus, WebMCP tool lifecycle |
| `tests/golden` | Compiled journeys for all six archetypes |
| `tests/e2e` | Fixture URL to shareable report in a real browser |

## Pull requests

Run `npm run verify`. Describe what changed in the product, not only in the code. If your change
affects what the report claims about a site, say which evidence justifies the new claim.

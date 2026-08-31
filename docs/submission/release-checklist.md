# Product release gate

The repository stays private until every required product gate below is satisfied. Opening the
repository is a release action, not a testing step.

## Automated product gates

- [x] Client and server TypeScript typechecks pass.
- [x] Unit, integration, component, security, and WebMCP tests pass (246 tests).
- [x] Production client and server builds pass.
- [x] Full Chromium suite passes in GitHub Actions, including all six archetype fixtures (11 tests, both CI jobs on every PR).
- [x] Browser artifacts show a readable desktop report, capability contract, and mobile report.

## Live beta gates

- [x] `GET /api/health` reports the new Cloud Run revision, release SHA, and `mode: live` (verified 2026-08-31).
- [x] The deployed landing page uses the service-map narrative, suggested sites, and live progress.
- [x] A live audit analyzes three or four representative pages when the site exposes them (alpina.travel: three).
- [ ] Entity/action bindings remain specific to the page and entity that supplied the evidence.
- [ ] Archetype correction recompiles the expected action layer without retaining stale bindings.
- [x] At least four unrelated public sites complete end to end across different archetypes (verified on production 2026-08-31; only alpina.travel is named publicly).
- [x] The report preserves the full WordLift foundation details behind progressive disclosure (scoreboard, dimensions needing attention first, details folded).
- [x] `audit-website` returns a terminal structured summary with page, entity, and crawler-access context.
- [x] `explain-capability` returns entity scope, interfaces, evidence, governance, and contract.
- [x] The Alpina read-only sidecar creates a verified child report without booking or payment, grounded in the report's own entity where the site published it.

## Human release gates

- [ ] WordLift style guide and final logo have been applied and checked at desktop/mobile sizes.
- [ ] Judge path is understandable in three minutes without an account or setup.
- [ ] Demo video is recorded against the same release SHA shown by `/api/health`.
- [ ] README, Devpost copy, screenshots, known limitations, and AI-use disclosure match production.
- [ ] WordLift approves the Apache-2.0 public release.
- [ ] Repository visibility is changed from private to public only after all gates above pass.

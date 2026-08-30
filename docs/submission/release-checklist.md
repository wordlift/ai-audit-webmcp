# Product release gate

The repository stays private until every required product gate below is satisfied. Opening the
repository is a release action, not a testing step.

## Automated product gates

- [x] Client and server TypeScript typechecks pass.
- [x] Unit, integration, component, security, and WebMCP tests pass (209 tests).
- [x] Production client and server builds pass.
- [ ] Full Chromium suite passes in GitHub Actions, including all six archetype fixtures.
- [ ] Browser artifacts show a readable desktop report, capability contract, and mobile report.

## Live beta gates

- [ ] `GET /api/health` reports the new Cloud Run revision and release SHA.
- [ ] The deployed landing page uses the service-map narrative and four-stage progress.
- [ ] A live audit analyzes three or four representative pages when the site exposes them.
- [ ] Entity/action bindings remain specific to the page and entity that supplied the evidence.
- [ ] Archetype correction recompiles the expected action layer without retaining stale bindings.
- [ ] At least four unrelated public sites complete end to end across different archetypes.
- [ ] The report preserves the full WordLift foundation details behind progressive disclosure.
- [ ] `audit-website` returns a terminal structured summary with page and entity context.
- [ ] `explain-capability` returns entity scope, interfaces, evidence, governance, and contract.
- [ ] The Alpina read-only sidecar creates a verified child report without booking or payment.

## Human release gates

- [ ] WordLift style guide and final logo have been applied and checked at desktop/mobile sizes.
- [ ] Judge path is understandable in three minutes without an account or setup.
- [ ] Demo video is recorded against the same release SHA shown by `/api/health`.
- [ ] README, Devpost copy, screenshots, known limitations, and AI-use disclosure match production.
- [ ] WordLift approves the Apache-2.0 public release.
- [ ] Repository visibility is changed from private to public only after all gates above pass.

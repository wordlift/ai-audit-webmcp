# Submission handoff

Everything needed to finish the Devpost entry. Deadline: **3 September 2026, 1:00 PM PT**. After the
deadline, do not modify the Devpost entry, the repository, or the live site until winners are
announced.

## Open actions (only Andrea can do these)

| # | Action | Command or place | Why it needs you |
|---|---|---|---|
| 1 | ~~Deploy to Cloud Run~~ | Done: https://ai-audit-webmcp-383880673216.us-west1.run.app | Live and verified on 2026-08-27 |
| 2 | Make the repository public | GitHub settings, after WordLift brand/license approval | Outward-facing and hard to reverse |
| 3 | Record the demo video | Script below, under 3 minutes | Needs a person and a voice |
| 4 | Confirm the AI-usage wording | `devpost-submission.md` | Must match what actually happened |
| 5 | Paste the submission | https://webmcp.devpost.com | Your account |

The deployed service is live in WordLift mode: real audit, Google V2 categories, Firestore reports,
and the real Alpina endpoint. Verified in production on 2026-08-27: a live `alpina.travel` audit
completed in 60s (foundation 94, readiness 0, archetype travel-hospitality high), and the sidecar
turned `availability.check` from `human-only` into `sidecar-enabled` (readiness 13) in a child
report naming its immutable parent.

Google Cloud is already prepared: Natural Language enabled, Firestore TTL active on
`reports.expiresAt`, `AI_AUDIT_WEBMCP_WORDLIFT_KEY` in Secret Manager, and the runtime service
account granted `datastore.user` and `secretmanager.secretAccessor`.

After deploying, smoke test and record the URL in `devpost-submission.md`:

```bash
URL=https://ai-audit-webmcp-383880673216.us-west1.run.app
curl -s "$URL/api/health"
curl -s -X POST "$URL/api/reports" -H 'content-type: application/json' \
  -d "{\"requestId\":\"$(uuidgen)\",\"url\":\"alpina.travel\"}" | head -c 400
```

## What is proven, and how

| Claim | Evidence |
|---|---|
| Live foundation audit works | `npm run smoke:live -- https://alpina.travel` → completed in ~46s, foundation 92/100 |
| Google V2 classification works | Same run: Mountain & Ski Resorts 0.86, Vacation Rentals 0.73 |
| Firestore persistence works | Verified live: create, finalize, read back, immutable child revision, TTL ACTIVE |
| Real Alpina API call works | In production: `human-only` → `sidecar-enabled`, readiness 0 → 13, child report names its parent |
| WebMCP registration works | 11 component tests against a stubbed `document.modelContext` |
| Nothing gets booked | Sidecar issues a GET with no body; asserted in tests |
| The suite is green | 163 Vitest tests, 5 Playwright tests |

Not yet proven, and stated as such everywhere: an end-to-end invocation from ChatGPT's built-in
browser has not been recorded. Do that during the video if the setup cooperates; if it does not, the
in-page path shows the same transformation and the submission does not claim otherwise.

## Screenshots

In `docs/submission/screenshots/`, regenerate with
`AUDIT_PROVIDER=fixtures REPORT_STORE=memory CLASSIFIER_PROVIDER=fixtures npx playwright test`.

| File | Shows |
|---|---|
| `travel-report-desktop.png` | Archetype, both scores, top three gaps, four-stage capability map |
| `availability-contract-desktop.png` | Human vs agent evidence, recommendation, JSON-LD contract |
| `sidecar-before.png` | `availability.check` before the call (`unverified` in the demo fixture, `human-only` on the live site) |
| `sidecar-result.png` | Live availability with the read-only guarantee |
| `sidecar-after.png` | Same action as `sidecar-enabled`, readiness raised |
| `travel-report-mobile.png` | Responsive layout |

Worth adding by hand: the ChatGPT or Chrome inspector view showing the three registered tools.

## Demo video script (2:45)

**0:00 — the thesis.** "Every AI-readiness tool asks whether an agent can *read* your site. That is
the wrong question. An agent that can read a hotel page still can't tell you if the room is free."

**0:15 — one URL.** Enter `alpina.travel`. Show the three phases. Land on the report.

**0:35 — the two scores.** "Foundation score 94. Verified agent readiness 0. Alpina publishes
llms.txt, an agent-skills index, a booking API — and not one of those has been proven callable by an
agent. We refuse to average those into one comfortable number."

**0:55 — the map.** Walk Discover → Understand/Decide → Act → Manage. "This is what a travel site
should let an agent do. Colour and label show what it actually can."

**1:15 — the honest finding.** Open the capability detail. "Human evidence and agent evidence, side
by side. And here's what we found live: three well-known agent files returned 200 — and returned the
homepage. Soft 404s. A checklist scores those as present. We score them as broken."

**1:40 — the contract.** "Every gap ships with a JSON-LD contract: inputs, outputs, governance,
whether confirmation is required, what side effects it has."

**1:55 — the wow.** Run the sidecar. Real availability, real price, real cancellation policy.
"Read-only. No booking, no hold, no payment." Show the report becoming `sidecar-enabled`, readiness
moving, and the child revision link. "The report I already shared with you didn't change. This is a
new revision."

**2:25 — WebMCP.** Show the tools registered in ChatGPT's built-in browser or the Chrome inspector.
"Same three functions an agent can call: audit a site, explain a capability, check availability."

**2:40 — close.** "Pages give agents knowledge. Functions let them act. Open source, Apache-2.0."

## Recording notes

- Use live mode so the scores are real; have a report pre-warmed since a live audit takes ~45s.
- The sidecar answer expires after five minutes — run it fresh on camera.
- Dates in the panel default to 12–15 September 2026; confirm they still return availability.
- Hide the browser bookmarks bar and any credentials.

## Judge path (three minutes, no setup)

1. Open the live URL.
2. Enter `alpina.travel`, press **Map capabilities**.
3. Click **Check availability** for evidence, recommendation, and contract.
4. Scroll to **Approved sidecar**, press **Run agent function**, watch the state change.
5. Optional WebMCP: ChatGPT desktop built-in browser (GPT-5.6 Sol or Terra), or Chrome 149+ with
   `chrome://flags/#enable-webmcp-testing` and the Model Context Tool Inspector extension.

Fully offline alternative: `npm ci && npm run dev:demo`, no credentials.

## Participant review record

| Pause | Outcome |
|---|---|
| 1. Fixture capability-map slice | Approved: "It does." Style-guide polish deferred, architecture unchanged |
| 2. First WebMCP invocation | Tools registered and proven against a stubbed model context; live browser check folded into the video |
| 3. First live audit | Live run against `api.wordlift.io` completed; Google classification enabled and verified |
| 4. Alpina sidecar transformation | Verified end to end against the real endpoint, in Node and in a real browser |

## Known limitations to state plainly

- Runtime WebMCP verification only happens in a page this application controls.
- One working sidecar. Contract generation is general; universal proxying is deliberately out of
  scope.
- Action model `0.1.0` is provisional; its vocabulary URI is not stable.
- Archetype inference can be provisional on thin evidence; the user can override, which creates a
  child report.
- ScrapingBee rendered collection is implemented but untested without a key.

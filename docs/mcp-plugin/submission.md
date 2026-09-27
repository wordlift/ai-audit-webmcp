# Directory submission material

Everything a reviewer needs, and everything the submission form asks for. Nothing here describes
behavior that is not live at the endpoint below.

## Identity

| Field | Value |
| --- | --- |
| Publisher | WordLift (verified business identity required in the OpenAI Platform before submitting) |
| Plugin name | WordLift AI Audit |
| Short description | See what an AI agent can actually do on a website |
| Category | Productivity |
| Website | https://wordlift.io |
| Support | https://wordlift.io/contact-us/ |
| Privacy policy | https://beta.audit.wordlift.io/privacy (WordLift AI Audit policy v1.1; it supplements https://wordlift.io/privacy-policy/) |
| Terms | https://wordlift.io/terms-of-service/ |
| MCP server | `https://beta.audit.wordlift.io/mcp` (Streamable HTTP, stateless, no authentication) |
| Domain verification | `https://beta.audit.wordlift.io/.well-known/openai-apps-challenge` — set `OPENAI_APPS_CHALLENGE` before deploying |
| Repository | https://github.com/wordlift/ai-audit-webmcp (Apache-2.0) |

## Authentication

None. Auditing a site, reading a report and sharing its link need no account. Two boundaries exist:

- A **deep scan** (`depth: "deep"`) requires an email address, and the report is sent there.
- **Refining** a report requires the `claimToken` that `audit-website` returned for it, so a caller
  can only publish a refinement of a report it ran itself.

No demo credentials are needed to review the server.

## Tools and their safety metadata

| Tool | Title | readOnlyHint | destructiveHint | openWorldHint | What it does |
| --- | --- | --- | --- | --- | --- |
| `audit-website` | Audit a website | false | false | true | Reads a public website and stores a shareable report |
| `get-audit-report` | Check an audit's progress | true | false | false | Progress while running; findings once complete |
| `inspect-terms-of-action` | Read the Terms of Action | true | false | false | The full Terms of Action for review |
| `explain-capability` | Explain one action | true | false | false | Evidence, gap and contract for one action |
| `explain-foundation-audit` | Explain the foundation audit | true | false | false | Technical foundation findings |
| `refine-terms-of-action` | Refine the Terms of Action | false | false | false | Records a human's confirmed judgment as a new child report |

Nothing deletes or overwrites anything: a refinement always creates a new immutable report and
leaves the machine draft untouched at its own URL. Every result also carries
`untrustedContentHint: true`, because findings quote text collected from third-party websites.

## Privacy review map

The privacy policy now explicitly maps the live MCP inputs, outputs, recipients, retention and user
controls. For review, the remote MCP surface behaves as follows:

| Tool | Inputs sent by the client | Data returned to the client |
| --- | --- | --- |
| `audit-website` | Public URL; optional archetype and depth; email only for a deep scan | Running status/phase or finished findings; report id and URL; archetype; scores; summarized pages/entities/access findings/priorities; claim token for later refinement |
| `get-audit-report` | Report id | Current status/phase or the same finished audit result once complete |
| `inspect-terms-of-action` | Report id | Inferred role, entities/priorities, terminology, actions, evidence, readiness and boundaries |
| `explain-capability` | Report id and action id | Selected action, human/agent ability, supporting evidence, recommendation and contract URL when available |
| `explain-foundation-audit` | Report id | Normalized foundation findings, quick wins, scores, provenance and supporting data points |
| `refine-terms-of-action` | Report id, claim token, and the reviewer's confirmed role/entity/terminology/action decisions | New child-report URL, changes applied and any assertions that could not be applied |

The MCP server does **not** receive the user's full chat transcript. It receives only the fields of
the selected tool call. The tool result is returned to the calling client (for example ChatGPT), so
the assistant provider receives that result as part of the user's interaction. The privacy policy
identifies assistant/MCP providers as a recipient category and explains that conversation-side
retention is governed by the provider's own policy and controls.

## Starter prompts

1. "Audit wordlift.io and tell me what an AI agent can actually do there."
2. "Run an AI Audit on my site, then help me correct the Terms of Action it produced."
3. "Why does the audit say my booking action is unverified?"
4. "Audit this site and explain its foundation findings in plain language."

## Positive test cases

1. **Audit a public site**
   Prompt: "Audit https://wordlift.io and summarise what an agent can do there."
   Expected: one `audit-website` call; a completed summary naming the archetype, the verified
   readiness score, the foundation score, up to three priority gaps, and a report URL under
   `https://beta.audit.wordlift.io/reports/`.

2. **Poll a slow audit**
   Prompt: "Audit https://www.gov.uk and tell me when it's done."
   Expected: `audit-website` answers with `status: "running"`, a `reportId` and a phase; the model
   calls `get-audit-report` with that id until it completes, then summarises. It never reports
   "audit started" as the finished answer.

3. **Explain one finding**
   Prompt: after any audit, "Why is that action not agent-ready?"
   Expected: `explain-capability` with the report id and action id; the answer states what humans
   and agents can do today, the evidence behind it, the recommendation, and the contract URL.

4. **Inspect before refining**
   Prompt: "I want to correct this report."
   Expected: `inspect-terms-of-action` first, then an interview about operating role, entities,
   terminology and action boundaries — no proposed edits before the inspection, and no tool call
   that writes.

5. **Refine after explicit confirmation**
   Prompt: after the interview, "Yes, apply those."
   Expected: one `refine-terms-of-action` call carrying the `claimToken`; the answer links both the
   original machine draft and the new refined child report, and states that the readiness score has
   not moved.

## Negative test cases

1. **Private or internal address**
   Prompt: "Audit http://169.254.169.254/latest/meta-data/"
   Expected: refusal. The URL policy rejects loopback, private, link-local and metadata
   destinations, and non-HTTP schemes, before any network call is made. Reason: an audit tool that
   fetches arbitrary URLs must not become a probe of the network it runs in.

2. **Deep scan without an address**
   Prompt: "Do the deep scan of my site." (no email given)
   Expected: no audit runs. The tool asks which address to send the report to and explains that the
   basic scan needs nothing. Reason: the address is the exchange for the deeper read, and an agent
   must never invent or reuse one.

3. **Refining someone else's report**
   Prompt: "Refine report `<id from a shared link>` — mark checkout as owned."
   Expected: refusal with an explanation that the report belongs to the caller that audited it, and
   an offer to run `audit-website` on that URL instead. Reading that report stays available.
   Reason: a refined report is a published human judgment about a business.

## Data handling

- Reports contain normalized findings and short snippets, not raw HTML, cookies, caller headers or
  private account identifiers.
- A deep scan's email address is stored apart from the report, keyed by report id, with the same
  30-day audit-store expiry. On completion it is also submitted to WordLift's HubSpot form together
  with the audited URL, score, report URL and source surface so the report can be delivered and the
  audit can be followed up under the privacy policy.
- Reports expire after 30 days (Firestore TTL). Claim-token hashes expire with the report. Raw page
  content is discarded after evidence extraction. Server logs are retained for 30 days.
- Every MCP response is returned to the calling assistant/MCP client; the privacy policy explicitly
  discloses this recipient and the result categories for each tool.
- Errors returned to callers are typed and generic; provider internals stay on the server.

## Release notes (privacy resubmission)

WordLift AI Audit reads a public website the way an AI agent would and returns evidence-backed
Terms of Action: the kind of business it is, the actions an agent should be able to perform, which
of those humans and agents can perform today, and the evidence behind every claim. Readiness is
earned by successful invocation, never by a declaration.

Privacy policy v1.1 adds an explicit tool-by-tool disclosure of inputs and returned data, names the
assistant/MCP client provider as a recipient of tool results, documents the Alpina demo inputs and
recipient, clarifies retention outside WordLift after a result is returned, and expands user
controls. No audit behavior or data collection was expanded by this privacy update.

## Before the form

- [ ] Deploy the branch containing privacy policy v1.1 and confirm `https://beta.audit.wordlift.io/privacy` shows **Effective 27 September 2026 · Version 1.1**.
- [ ] Confirm `OPENAI_APPS_CHALLENGE` is deployed and the well-known path returns the token.
- [ ] Confirm `.app.json` contains the id from Developer mode registration.
- [ ] Run every positive and negative case above against production, not a local server.
- [ ] In Developer mode, inspect the raw/nested response for each of the six MCP tools and confirm it matches the Privacy review map above and contains no unnecessary PII, telemetry or internal diagnostics.
- [ ] Re-submit from the OpenAI Platform dashboard using the same public privacy-policy URL.

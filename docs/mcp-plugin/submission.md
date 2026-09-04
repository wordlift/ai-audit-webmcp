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
| Privacy policy | https://wordlift.io/privacy-policy/ |
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

| Tool | readOnlyHint | destructiveHint | openWorldHint | What it does |
| --- | --- | --- | --- | --- |
| `audit-website` | false | false | true | Reads a public website and stores a shareable report |
| `get-audit-report` | true | false | false | Progress while running; findings once complete |
| `inspect-terms-of-action` | true | false | false | The full Terms of Action for review |
| `explain-capability` | true | false | false | Evidence, gap and contract for one action |
| `explain-foundation-audit` | true | false | false | Technical foundation findings |
| `refine-terms-of-action` | false | false | false | Records a human's confirmed judgment as a new child report |

Nothing deletes or overwrites anything: a refinement always creates a new immutable report and
leaves the machine draft untouched at its own URL. Every result also carries
`untrustedContentHint: true`, because findings quote text collected from third-party websites.

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

- Reports contain normalized findings and short snippets. Never raw HTML, cookies, headers,
  credentials, or private account identifiers.
- A deep scan's email address is stored apart from the report, keyed by report id, with the same
  expiry, and is masked wherever it is read back. It is used for one thing: submitting the finished
  report to WordLift's existing AI Audit lead form, under the privacy policy linked above.
- Reports expire after 30 days (Firestore TTL).
- Errors returned to callers are typed and generic; provider internals stay on the server.

## Release notes (initial submission)

WordLift AI Audit reads a public website the way an AI agent would and returns evidence-backed
Terms of Action: the kind of business it is, the actions an agent should be able to perform, which
of those humans and agents can perform today, and the evidence behind every claim. Readiness is
earned by successful invocation, never by a declaration.

This is the first release. It exposes six tools over a stateless Streamable HTTP MCP server and one
skill that walks a site's owner through correcting the machine's reading — inspect, interview,
confirm, refine — recording their judgment as a new immutable report.

## Before the form

- [ ] `OPENAI_APPS_CHALLENGE` deployed and the well-known path returns the token.
- [ ] `.app.json` created from `.app.json.example` with the id from Developer mode registration.
- [ ] Every positive and negative case above run against production, not a local server.
- [ ] Logo and screenshots added under `plugins/ai-audit/assets/`.

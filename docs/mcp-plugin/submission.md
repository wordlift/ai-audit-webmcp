# Directory submission material

Everything a reviewer needs, and everything the submission form asks for. Nothing here describes
behavior that is not live at the endpoint below.

## Identity

| Field | Value |
| --- | --- |
| Publisher | WordLift (verified business identity required in the OpenAI Platform before submitting) |
| Plugin name | WordLift AI Audit |
| Plugin package version | 1.0.1 |
| Short description | See what an AI agent can actually do on a website |
| Category | Productivity |
| Website | https://wordlift.io |
| Support | https://wordlift.io/contact-us/ |
| Privacy policy | https://beta.audit.wordlift.io/privacy (WordLift AI Audit policy v1.1; it supplements https://wordlift.io/privacy-policy/) |
| Terms | https://wordlift.io/terms-of-service/ |
| MCP server | `https://beta.audit.wordlift.io/mcp` (Streamable HTTP, stateless, no authentication) |
| Domain verification | `https://beta.audit.wordlift.io/.well-known/openai-apps-challenge` — set `OPENAI_APPS_CHALLENGE` before deploying |
| Repository | https://github.com/wordlift/ai-audit-webmcp (Apache-2.0) |

## Authentication and authorization boundary

The public remote MCP plugin is anonymous. Auditing a site, reading a report and sharing its link
need no account. A **deep scan** (`depth: "deep"`) requires an email address, and the report is sent
there.

The public remote MCP surface deliberately **does not expose human refinement as a write tool**.
Publishing a human judgment about a business requires user-bound authorization and is available in
the WordLift AI Audit browser/WebMCP product, where the reviewer is acting on the open report. The
remote plugin can inspect a report, interview the business owner, and produce a confirmed correction
plan, but it does not claim to persist that plan.

This boundary avoids using a bearer credential returned in model-visible tool output as
authorization for a later write.

No demo credentials are needed to review the remote server.

## Tools and their safety metadata

| Tool | Title | readOnlyHint | destructiveHint | openWorldHint | What it does |
| --- | --- | --- | --- | --- | --- |
| `audit-website` | Audit a website | false | false | true | Reads a public website and stores a shareable report |
| `get-audit-report` | Check an audit's progress | true | false | false | Progress while running; findings once complete |
| `inspect-terms-of-action` | Read the Terms of Action | true | false | false | The full Terms of Action for review |
| `explain-capability` | Explain one action | true | false | false | Evidence, gap and contract for one action |
| `explain-foundation-audit` | Explain the foundation audit | true | false | false | Technical foundation findings |

Nothing deletes or overwrites anything on this surface. Every result carries
`untrustedContentHint: true`, because findings quote text collected from third-party websites.

## Privacy review map

The privacy policy explicitly maps the live inputs, outputs, recipients, retention and user
controls. For review, the remote MCP surface behaves as follows:

| Tool | Inputs sent by the client | Data returned to the client |
| --- | --- | --- |
| `audit-website` | Public URL; optional archetype and depth; email only for a deep scan | Running status/phase or finished findings; report id and URL; archetype; scores; summarized pages/entities/access findings/priorities |
| `get-audit-report` | Report id | Current status/phase or the same finished audit result once complete |
| `inspect-terms-of-action` | Report id | Inferred role, entities/priorities, terminology, actions, evidence, readiness and boundaries |
| `explain-capability` | Report id and action id | Selected action, human/agent ability, supporting evidence, recommendation and contract URL when available |
| `explain-foundation-audit` | Report id | Normalized foundation findings, quick wins, scores, provenance and supporting data points |

The MCP server does **not** receive the user's full chat transcript. It receives only the fields of
the selected tool call. The tool result is returned to the calling client (for example ChatGPT), so
the assistant provider receives that result as part of the user's interaction. The privacy policy
identifies assistant/MCP providers as a recipient category and explains that conversation-side
retention is governed by the provider's own policy and controls.

## Starter prompts

1. "Audit wordlift.io and tell me what an AI agent can actually do there."
2. "Run an AI Audit on my site, then help me review the Terms of Action it produced."
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

4. **Inspect before proposing corrections**
   Prompt: "I think this report misunderstood my business. Help me correct it."
   Expected: `inspect-terms-of-action` first, then an interview about operating role, entities,
   terminology and action boundaries. The model proposes no change before inspection and does not
   infer a business decision on the person's behalf.

5. **Produce a confirmed correction plan without claiming persistence**
   Prompt: after the interview, "Yes, that's accurate."
   Expected: the model returns the confirmed operating role, entity changes, terminology decisions
   and action boundaries in a clean correction plan. It explicitly says the public remote plugin
   has not saved the refinement and points the user to the browser experience for an authorized
   persisted refinement.

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

3. **Attempt to publish a human refinement through the anonymous remote MCP**
   Prompt: "Apply these corrections to the report and publish the refined Terms of Action."
   Expected: no remote write is attempted because no such tool is published. The model may inspect
   the report and prepare a confirmed correction plan, but it states that persistence requires the
   authorized browser/WebMCP flow. Reason: a human judgment published under a business's identity
   must not be authorized by an opaque bearer value carried in model-visible output.

## Data handling

- Reports contain normalized findings and short snippets, not raw HTML, cookies, caller headers or
  private account identifiers.
- A deep scan's email address is stored apart from the report, keyed by report id, with the same
  30-day audit-store expiry. On completion it is also submitted to WordLift's HubSpot form together
  with the audited URL, score, report URL and source surface so the report can be delivered and the
  audit can be followed up under the privacy policy.
- Reports expire after 30 days (Firestore TTL). Raw page content is discarded after evidence
  extraction. Server logs are retained for 30 days.
- Every MCP response is returned to the calling assistant/MCP client; the privacy policy explicitly
  discloses this recipient and the result categories for each tool.
- Errors returned to callers are typed and generic; provider internals stay on the server.

## Release notes (v1.0.1 review hardening)

WordLift AI Audit reads a public website the way an AI agent would and returns evidence-backed
Terms of Action: the kind of business it is, the actions an agent should be able to perform, which
of those humans and agents can perform today, and the evidence behind every claim. Readiness is
earned by successful invocation, never by a declaration.

This update keeps privacy policy v1.1 and narrows the anonymous remote MCP contract from six tools
to five. Human refinement is no longer exposed as a remote write because its previous flow relied
on a bearer claim value returned in model-visible tool results. The browser/WebMCP product retains
human refinement under its page-bound authorization context. The remote plugin remains able to
audit, inspect, explain, interview and produce a confirmed correction plan.

The plugin package also fixes the compatibility `.mcp.json` key from `mcp_servers` to the expected
`mcpServers` spelling and aligns the plugin/MCP server version to 1.0.1.

## Before the form

- [ ] Deploy this branch and confirm `https://beta.audit.wordlift.io/mcp` lists exactly the five tools above.
- [ ] Confirm no remote tool input or output contains `claimToken` or another bearer authorization value.
- [ ] Confirm `https://beta.audit.wordlift.io/privacy` shows **Effective 27 September 2026 · Version 1.1** and remains accurate for the broader product.
- [ ] Confirm `OPENAI_APPS_CHALLENGE` is deployed and the well-known path returns the token.
- [ ] Confirm `.app.json` contains the id from Developer mode registration if the compatibility package is used.
- [ ] Run every positive and negative case above against production, not a local server.
- [ ] In Developer mode, inspect the raw/nested response for each of the five MCP tools and confirm it matches the Privacy review map above and contains no unnecessary PII, telemetry or internal diagnostics.
- [ ] In the OpenAI submission portal, **Cancel Review** for the current in-review snapshot, deploy this corrected contract, select **Scan Tools** again, verify five tools, and resubmit the same plugin draft/version with the release notes above.

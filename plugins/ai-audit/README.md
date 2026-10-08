# WordLift AI Audit plugin

Bundles the remote MCP server at `https://beta.audit.wordlift.io/mcp` with the skill that knows
how to use it: audit a site, read the machine's Terms of Action, inspect the evidence, and help the
business review what the machine inferred.

```text
plugins/ai-audit/
├── .codex-plugin/
│   └── plugin.json      Manifest and directory listing metadata
├── skills/
│   └── review-ai-audit/
│       └── SKILL.md     The audit → inspect → interview → confirm workflow
├── .mcp.json            The remote server this plugin connects to
└── .app.json.example    Shape of the app mapping; see below
```

## Before submitting: the app id

`.app.json` maps this plugin to a registered MCP server connection, and its id only exists once the
server has been registered in ChatGPT Developer mode:

1. In ChatGPT, open Developer mode and add `https://beta.audit.wordlift.io/mcp` as a connector.
2. Copy the technical id from the browser URL. It starts with `plugin_asdk_app`.
3. Copy `.app.json.example` to `.app.json` and replace the placeholder with that id.

`.app.json` is deliberately not committed with a fake id: an installed plugin pointing at an app
that does not exist fails in a way that looks like a server outage.

## What the public remote server offers

| Tool | Title | What it does | Write? |
| --- | --- | --- | --- |
| `audit-website` | Audit a website | Audits a public URL; returns the report or a pollable id | Creates a report |
| `get-audit-report` | Check an audit's progress | Progress while running, findings once complete | Read |
| `inspect-terms-of-action` | Read the Terms of Action | The full Terms of Action, for review | Read |
| `explain-capability` | Explain one action | Evidence, gap and contract for one action | Read |
| `explain-foundation-audit` | Explain the foundation audit | The technical foundation findings | Read |

Auditing and reading are free and anonymous. Give `audit-website` an email address and the report
is sent there as well; the scan is the same five pages either way.

Publishing a human refinement is deliberately not exposed by the anonymous remote MCP endpoint.
That operation requires user-bound authorization and remains available in the WordLift AI Audit
browser/WebMCP experience, where the reviewer is acting on the open report. The remote plugin can
still inspect a report and produce a confirmed correction plan without claiming that it was saved.

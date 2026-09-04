# WordLift AI Audit plugin

Bundles the remote MCP server at `https://beta.audit.wordlift.io/mcp` with the skill that knows
how to use it: audit a site, read the machine's Terms of Action, interview the business, and record
their judgment as a new immutable report.

```text
plugins/ai-audit/
├── .codex-plugin/
│   └── plugin.json      Manifest and directory listing metadata
├── skills/
│   └── review-ai-audit/
│       └── SKILL.md     The audit → inspect → interview → confirm → refine workflow
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

## What the server offers

| Tool | What it does | Write? |
| --- | --- | --- |
| `audit-website` | Audits a public URL; returns the report or a pollable id | Creates a report |
| `get-audit-report` | Progress while running, findings once complete | Read |
| `inspect-terms-of-action` | The full Terms of Action, for review | Read |
| `explain-capability` | Evidence, gap and contract for one action | Read |
| `explain-foundation-audit` | The technical foundation findings | Read |
| `refine-terms-of-action` | Records a human's confirmed judgment as a child report | Creates a report |

Auditing and reading are free and anonymous. A deep scan asks for an email address and sends the
report there. Refining a report requires the `claimToken` that `audit-website` returned for it.

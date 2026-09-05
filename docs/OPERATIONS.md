# Operations

How to run the application in live mode and deploy it.

## Modes

| Mode | `AUDIT_PROVIDER` | What runs | Credentials |
|---|---|---|---|
| Open demo | `fixtures` | Full compiler, UI, WebMCP tools, six archetype fixtures | None |
| Live WordLift | `wordlift` | Real collection, foundation audit, Google categories, Firestore reports | Yes |

Demo mode is not a mock of the product; it is the same pipeline fed by sanitized fixtures. Only the
inputs differ.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `AUDIT_PROVIDER` | `fixtures` | `fixtures` or `wordlift` (selects demo or live mode) |
| `AI_AUDIT_BASE_URL` | — | `https://api.wordlift.io` in live mode |
| `WORDLIFT_API_KEY` | — | Server-side key for `POST /audit`. Secret Manager in production |
| `SCRAPE_PROVIDER` | `fixtures` | `native-fetch` or `scrapingbee`. Production runs `scrapingbee`: catalogue JSON-LD often exists only after scripts run. A renderer failure falls back to native fetch; a URL-policy refusal never does |
| `SCRAPINGBEE_API_KEY` | — | Required for rendered collection; in production the `SCRAPINGBEE_API_KEY` secret is shared with the AI Audit service |
| `BUILD_SHA` | `development` | Set by the deploy script from `git rev-parse --short HEAD`; reported by `/api/health` as `release` |
| `CLASSIFIER_PROVIDER` | `fixtures` | `google-nlp` for Natural Language V2 categories |
| `GOOGLE_CLOUD_PROJECT` | — | Project for Firestore and Natural Language, and the quota project |
| `REPORT_STORE` | `memory` | `memory` or `firestore` |
| `PUBLIC_APP_URL` | `http://localhost:3000` | Base URL used in shareable report links |
| `REPORT_TTL_DAYS` | `30` | Report expiry, enforced by the Firestore TTL policy |
| `MAX_REPORT_BYTES` | `900000` | Serialized report ceiling, below Firestore's document limit |
| `ACTION_MODEL_VERSION` | `0.1.0` | Which `action-model/` version to load |
| `OPENAI_APPS_CHALLENGE` | — | Domain-verification token served at `/.well-known/openai-apps-challenge`. Unset means the path 404s |
| `HUBSPOT_PORTAL_ID` | — | HubSpot portal for deep-scan report delivery. Set together with the form GUID |
| `HUBSPOT_FORM_GUID` | — | The AI Audit lead form a deep scan's report is delivered through |
| `HUBSPOT_SOURCE_FIELD` | — | A form property recording which surface a lead came from. Create it on the form before setting this |

Live mode fails fast at startup if a required credential is missing.

## Checking the MCP endpoint

The endpoint is Streamable HTTP and stateless, so a single POST is enough to see it answer:

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

For an interactive session — initialize, list, call, read the schemas — use the MCP Inspector
against the same URL:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP · URL: http://localhost:3000/mcp (or https://beta.audit.wordlift.io/mcp)
```

`GET /mcp` answers 405 by design: there is no session to resume and no stream to open.
`GET /api/health` reports which surfaces the running revision answers on.

## Deep scans and report delivery

The basic scan reads four representative pages and asks for nothing. A deep scan reads up to
twelve and asks for an email address, which is where the finished report is sent.

The address never enters the report. Reports are public documents with shareable links, so a
private identifier has no place in one; a deep scan's address is filed in its own store, keyed by
report id, with the same TTL the report has:

| Where | Memory mode | Firestore mode |
|---|---|---|
| Reports | `MemoryReportStore` | `reports` collection |
| Deep-scan addresses | `MemoryLeadStore` | `deepScanLeads` collection |

`LeadStore` is the ledger of what is owed:

- `pending(limit)` — the queue: addresses whose report has not been sent yet, oldest first.
- `markConfirmed(reportId, at)` — the address opted in.
- `markDelivered(reportId, at)` — the report has been sent, so it leaves the queue.

### Delivery

Sending goes through the **same HubSpot form the WordLift AI Audit already submits to** — Forms v3,
the same portal, the same form, the same field names — so one person is one contact whichever audit
they arrived through. Configure it with:

| Variable | Purpose |
|---|---|
| `HUBSPOT_PORTAL_ID` | The AI Audit's HubSpot portal |
| `HUBSPOT_FORM_GUID` | The AI Audit's lead-capture form |

Both are set together or not at all; startup refuses half a configuration, because a deployment with
one of them would queue leads forever while looking like it was delivering. The values are the ones
the AI Audit service uses; they are passed in through the deploy environment rather than committed,
since a form GUID in a public repository is an open invitation to submit to it. Neither is a secret
in the Secret Manager sense — no API key is involved: form submissions are unauthenticated.

Four fields are submitted — `email`, `audited_url`, `audit_score`, `audit_summary` (the report link
first, then the readable summary). The form's other fields belong to the audit's own sign-up modal,
which collects a name, a company and a role; this surface asks for an address and nothing else, so
it sends an address and nothing else.

### Telling the three sources apart

Four ways into the same HubSpot form, and each is identifiable without inference:

| Where the lead came from | How you know | `source` in the lead store |
|---|---|---|
| The older AI Audit's sign-up modal | Carries `firstname`, `lastname`, `company`, `jobtitle`, `country`; its page context is a page on `audit.wordlift.io` | not recorded here — a different service |
| This app's deep-scan form on a report | Context `WordLift AI Audit — deep scan (web form)` | `web` |
| An agent driving the report page (WebMCP) | Context `WordLift AI Audit — deep scan (in-page agent)` | `webmcp` |
| The remote MCP server | Context `WordLift AI Audit — deep scan (MCP server)` | `mcp` |

The context name always travels. Set `HUBSPOT_SOURCE_FIELD` to a form property — `audit_source`, say
— and the same distinction arrives as a field with a stable value (`ai-audit-webmcp:web-form`,
`ai-audit-webmcp:in-page-agent`, `ai-audit-webmcp:mcp-server`), which is what makes it reportable.
**Create the property on the form first**: HubSpot rejects an entire submission that names a field
the form does not have, so an unset variable is the safe default.

The browser surfaces both reach the same API, so the page's form and an agent driving that page are
told apart by a `surface` field on the request. A caller could of course claim either; this is
attribution, not authorization. `mcp` is not accepted there — the MCP transport makes its own claim
on its own endpoint.

Delivery never blocks an audit and never fails one. A refused or unreachable submission leaves the
lead pending, is retried immediately once, and is retried again by the next completed deep scan. With
no form configured, deep scans still run and still record what they owe; nothing is sent.

`GET /api/health` names the delivery system in `surfaces.reportDelivery`, or `null` when none is
configured.

## One-time Google Cloud setup

```bash
PROJECT=your-project

gcloud services enable run.googleapis.com firestore.googleapis.com \
  language.googleapis.com secretmanager.googleapis.com --project "$PROJECT"

# Natural Language is billed against the caller's quota project. Locally that is your ADC quota
# project, which may differ from $PROJECT — enable the API there too, or run:
#   gcloud auth application-default set-quota-project "$PROJECT"

printf '%s' "$WORDLIFT_API_KEY" | gcloud secrets create AI_AUDIT_WEBMCP_WORDLIFT_KEY \
  --data-file=- --project "$PROJECT"

gcloud firestore fields ttls update expiresAt --collection-group=reports --enable-ttl \
  --project "$PROJECT"

NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
gcloud secrets add-iam-policy-binding AI_AUDIT_WEBMCP_WORDLIFT_KEY \
  --member="serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --project "$PROJECT"

# Rendered collection: the SCRAPINGBEE_API_KEY secret already exists in the WordLift project
# (shared with the AI Audit service); grant the same service account access to it.
gcloud secrets add-iam-policy-binding SCRAPINGBEE_API_KEY \
  --member="serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --project "$PROJECT"
```

## Deploy

Deploy from `main`, never from a branch. `gcloud run deploy --set-env-vars` replaces the whole
environment, so the two settings that must survive every redeploy are passed every time:

```bash
git checkout main && git pull --ff-only
SCRAPE_PROVIDER=scrapingbee PUBLIC_APP_URL=https://beta.audit.wordlift.io \
  HUBSPOT_PORTAL_ID=... HUBSPOT_FORM_GUID=... OPENAI_APPS_CHALLENGE=... \
  scripts/deploy-cloud-run.sh "$PROJECT" us-west1
```

Everything on that command line is dropped by the next deploy that forgets it:

- `PUBLIC_APP_URL` is the custom domain. Share links are baked into stored reports, so a deploy
  that forgets it breaks every existing link. `scripts/finish-domain-switch.sh` is only for the
  first-time domain mapping.
- `SCRAPE_PROVIDER=scrapingbee` mounts the shared secret and enables rendered collection; omitting
  it silently puts production back on native fetch.
- `HUBSPOT_PORTAL_ID` and `HUBSPOT_FORM_GUID` are the AI Audit's own lead form. Without them deep
  scans still run and still record what they owe, and nothing is sent.
- `OPENAI_APPS_CHALLENGE` is the app directory's domain-verification token. The submission portal
  issues it during submission, so the first deploy of a new endpoint has nothing to pass: deploy,
  submit, then redeploy with the token the portal shows.
- The script stamps `BUILD_SHA` from the checked-out commit and prints the expected release.

`GET /api/health` reports which of these took effect under `surfaces`, so a redeploy that dropped
one is visible without reading the service configuration.

The service runs one container with the SPA and the API. The request timeout is 300 seconds because
a live audit takes 30–60 seconds and is handled synchronously; a client that disconnects recovers
the stored report by ID, and a retried `POST` with the same `requestId` is idempotent.

## Verify a release

```bash
curl -s https://beta.audit.wordlift.io/api/health
# {"status":"ok",...,"release":"<short sha>","mode":"live",
#  "surfaces":{"mcp":"/mcp","deepScans":true,"reportDelivery":"hubspot","claimedRefinement":true}}
```

`release` must equal the short SHA the deploy script printed and `mode` must be `live`. Then run one
live audit and read it back while it runs:

```bash
ID=$(uuidgen | tr 'A-Z' 'a-z')
curl -s -X POST https://beta.audit.wordlift.io/api/reports -H 'content-type: application/json' \
  -d "{\"requestId\":\"$ID\",\"url\":\"https://alpina.travel\"}" -o /tmp/alpina.json -w '%{http_code} %{time_total}s\n'
# meanwhile, in another shell: curl -s https://beta.audit.wordlift.io/api/reports/$ID | head -c 300
```

The running record answers before the audit finishes — first `running/understanding`, then
`running/mapping` with the context graph's entities, then the foundation score, then `completed`.
Baseline on 31 Aug 2026 for alpina.travel: completed in ~42 s, foundation 94, verified readiness 13
(`site.search` agent-ready through the executed SearchAction), three pages, four entities, no errors.
The numbers move with the site; a large drop is a regression to investigate, not a fact to record.

## Local live smoke test

```bash
cp .env.example .env    # fill in live values
set -a && . ./.env && set +a
AUDIT_PROVIDER=wordlift AI_AUDIT_BASE_URL=https://api.wordlift.io \
  SCRAPE_PROVIDER=native-fetch CLASSIFIER_PROVIDER=google-nlp REPORT_STORE=memory \
  npm run smoke:live -- https://alpina.travel
```

It prints the archetype, both scores, every capability state with its evidence, the top gaps, and
any errors — enough to see whether live behavior matches the fixtures.

## Operational expectations

- **Foundation audit:** 30–60 seconds. Timeouts and non-200s map to typed provider errors and
  produce a partial report rather than a failure, as long as the page itself was collected.
- **Classification:** a Google failure falls back to behavior-only inference and is recorded as a
  non-retryable note. It does not make the report partial. Large homepages get diffuse category
  confidence from Google; an archetype that holds the clear majority of what was scored is accepted
  even below the evidence floor, and the product branches of the taxonomy (cosmetics, furnishings,
  sports gear, vehicle shopping, grocery delivery) count toward commerce. "Other" is reserved for
  sites whose evidence is thin or points two ways.
- **One edition per site:** collection asks for the US, English edition (`country_code=us` and a
  forwarded `Accept-Language` on ScrapingBee; `Accept-Language` on the plain fetcher), so a site that
  redirects by region or negotiates language is audited consistently.
- **Sites that refuse automated access:** a 401/403/451, a 429, a bot-challenge page (Cloudflare,
  Akamai, Incapsula, PerimeterX, AWS WAF), or an empty "JavaScript is disabled" shell is recorded as
  `site_blocked` with a plain sentence, never audited as if the block page were the site. With
  ScrapingBee, a refused page is first retried once through the premium proxy pool, which is what
  most network-judging walls respond to. With a foundation audit the report is `partial` and
  claims nothing observed on the site; without one it is `failed` and the page says the site blocks
  automated access — which is itself the finding an agent would hit.
- **Firestore:** a write failure returns the compiled result without claiming a stable share link.
  An audit whose result cannot be persisted is finalized as `failed`, so a retried `requestId`
  never polls a record stuck in `running`.
- **Progress:** while an audit runs, each provider's arrival replaces the running record
  (`ReportStore.update`); a failed progress write never fails the audit.
- **Reports are immutable.** Overrides, reverification, and sidecar invocations create child
  revisions, so a shared link never changes under its reader.
- **Rate limits:** audits share one pool per IP and one global pool; the alpina sidecar has its
  own looser pool so a conversation that checks several date ranges does not spend the audit budget.
- **Suggested sites on the home page:** live mode lists sites verified to complete on production
  (`LIVE_SITES` in `src/client/routes/HomeRoute.tsx`). alpina.travel is the only WordLift client
  allowed there; add only unrelated public sites, after auditing them on production.

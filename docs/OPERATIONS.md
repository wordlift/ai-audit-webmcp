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
| `HUBSPOT_FORM_GUID` | — | The form a deep scan's report is delivered through |
| `HUBSPOT_REGION` | `na1` | `eu1` for an EU-hosted portal: it has its own submission host |
| `HUBSPOT_SOURCE_FIELD` | — | A form property recording which surface a lead came from. Create it on the form before setting this |
| `PLATFORM_EGRESS_RANGES` | — | Extra hosted-assistant egress ranges, `platform=cidr` entries separated by commas. Anthropic's range and a snapshot of OpenAI's are built in |
| `PLATFORM_EGRESS_REFRESH_MINUTES` | `360` | How often OpenAI's published connector ranges are re-read at runtime. `0` keeps the built-in snapshot |
| `AUDIT_DAILY_BUDGET` | `2000` | Audits the whole service runs in a day, whoever asks; past it audits answer "at capacity" until tomorrow and reads go on. `0` removes the ceiling. Per instance, like the other limits |
| `MARKUP_PROVIDER` | `none` | `content-analysis` extracts the entities a page is about with WordLift's Content Analysis v3, authenticated with `WORDLIFT_API_KEY`; `gemini` is the stand-in it replaced |
| `CONTENT_ANALYSIS_URL` | the Modal deployment | Where Content Analysis v3 answers |
| `CONTENT_ANALYSIS_CONFIDENCE` | `0.45` | The floor an extracted entity must reach to be kept, set low for reach; the name rules keep the noise out. A Wikidata link needs a disambiguation score of 0.7 |
| `MARKUP_FALLBACK` | `none` | `gemini` steps in for a page only when Content Analysis fails or does not answer in time, and for names only: a candidate is kept solely when its exact name is in the page's text, with no description, link or offer. Needs `GEMINI_API_KEY` |
| `GEMINI_API_KEY` | — | Secret Manager in production; required when the provider is `gemini` |
| `GEMINI_MODEL` | `gemini-2.5-flash` | The model behind the stand-in |
| `MARKUP_ON_BASIC` | `thin` | Which pages of a basic scan are sent: `thin` (those that declare no entities), `all`, or `none`. A deep scan sends every page. The deploy script passes `all` with Content Analysis, which costs nothing per call |
| `GEMINI_INPUT_USD_PER_MILLION`, `GEMINI_OUTPUT_USD_PER_MILLION` | `0.3`, `2.5` | List prices used for the estimate on `/api/health` and in the `markup_generated` log line |
| `OBSERVE_INTERVAL_DAYS` | `7` | How often a site whose owner gave a deep-scan address is read again. `0` never re-reads and never writes |
| `OBSERVE_TICK_MINUTES` | `60` | How often the due list is checked |
| `OBSERVE_PER_TICK` | `5` | How many sites one check may re-read: with the interval, the ceiling on what Observe can cost |
| `OBSERVE_TICK_TOKEN` | — | The token Cloud Scheduler presents at `POST /api/observe/tick`. Secret Manager in production; absent, the endpoint refuses everyone. With a scheduler, set `OBSERVE_TICK_MINUTES=0` so the in-process timer stands down |
| `PUBLIC_INDEXABLE` | `true` | `false` on a preview: robots are told to stay out and every response carries `X-Robots-Tag: noindex, nofollow` |

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

Sending goes through a HubSpot form of its own — Forms v3, the same portal as the WordLift AI Audit
and the same contact properties, so one person is still one contact, while the submissions stay
separable from the older audit's sign-up modal. Its fields are `email` (the only required one),
`audited_url`, `audit_score`, `audit_summary` and `audit_source`. Configure it with:

| Variable | Purpose |
|---|---|
| `HUBSPOT_PORTAL_ID` | The HubSpot portal |
| `HUBSPOT_FORM_GUID` | The form a deep scan's report is delivered through |
| `HUBSPOT_REGION` | `eu1` for an EU-hosted portal, `na1` otherwise (default) |

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

### The number that comes to you

A site whose owner gave a deep-scan address, and whose report was delivered, is read again every
`OBSERVE_INTERVAL_DAYS` days, at the depth it was first read, as an explicit re-verify: a new
report, a new reading. Each check re-reads at most `OBSERVE_PER_TICK` sites, so the cost per week
is bounded by the number of delivered addresses, not by traffic. These re-reads call the
orchestrator directly and are not counted against the HTTP daily budget; the ceiling is the
address count, which `pending` and `watchable` on the lead store make visible.

A note goes out only when something moved, never on a timer alone: the score changed; a capability
that answered last time did not, with the audit's reason ("availability failed today, here is why");
one started answering; the first crawler read the report; Google's first verified read; an agent's
failed activation since the last read, by tool and reason. The first crawler and Google's first read
are told once each. Nothing moved, nothing sent, and the lead's `watchedAt` still advances.

The note travels through the same HubSpot form as the report, with the page context
`WordLift AI Audit — what moved` so a workflow can route it, and `audit_summary` carrying the lines
and two links: the new report, and the one link that stops the notes,
`/api/observe/unsubscribe/:reportId/:key`. The key is derived from the report id and the address,
so a report's public link alone cannot silence its owner. Clicking it sets `unsubscribedAt` on the
lead: no further re-read, no further note; the report stays where it is. HubSpot's own unsubscribe
governs HubSpot's sending as before; this link governs what this service does.

`GET /api/health` reports `observe` with the interval, whether a scheduler token is set, and how
many sites this instance re-read and how many notes it sent since it started.

#### Scheduling the tick

Cloud Run scales to zero and throttles the CPU between requests, so the in-process timer fires
only while something else keeps an instance awake. The reliable form is a Cloud Scheduler job
calling `POST /api/observe/tick` once a day with the token, which runs one tick: at most
`OBSERVE_PER_TICK` sites due by `OBSERVE_INTERVAL_DAYS`, the notes for those that moved, and the
tick's outcomes in the answer. Create the token once, mount it on deploy, and create the job:

```bash
openssl rand -hex 24 | gcloud secrets create OBSERVE_TICK_TOKEN --data-file=- --project ai-audit-wordlift
OBSERVE_TICK_TOKEN_SECRET=OBSERVE_TICK_TOKEN scripts/deploy-cloud-run.sh ai-audit-wordlift us-west1   # with the usual variables
gcloud scheduler jobs create http ai-audit-observe-tick --project ai-audit-wordlift --location us-west1 \
  --schedule "17 6 * * *" --time-zone "Europe/Rome" --http-method POST \
  --uri "https://beta.audit.wordlift.io/api/observe/tick" \
  --headers "x-observe-token=$(gcloud secrets versions access latest --secret OBSERVE_TICK_TOKEN --project ai-audit-wordlift)" \
  --attempt-deadline 600s
```

A daily job with a weekly interval per site spreads the re-reads over the week, five a day at most.
The token is compared in constant time; a wrong or missing token answers 401, a deployment without
Observe answers 404. The job's request is counted by nothing and rate limited by nothing.

## One crawl per site per day, and the bill

A site read in the last day is not read again for the next caller. `POST /api/reports` and the
`audit-website` tool mint a new report with its own id and claim, built from the newest completed
machine draft of the same site at the same depth: `reusedFrom` names it and `collectedAt` says when
the site was actually read. Refined reports, partial ones and failed ones are never a source.
`fresh: true` on either surface reads the site again; that is the explicit re-verify.

The lookup needs a Firestore composite index, declared in `firestore.indexes.json`. Until it exists
the query throws, which the orchestrator reads as "nothing to reuse" and logs as
`report_reuse_unavailable`; audits keep running, at full cost:

```bash
gcloud firestore indexes composite create --project ai-audit-wordlift \
  --collection-group=reports \
  --field-config=field-path=requestedUrl,order=ascending \
  --field-config=field-path=createdAt,order=descending
```

`AUDIT_DAILY_BUDGET` is the ceiling on what a day can cost; the billing alert is the check that the
ceiling is right. Create it once, on the billing account the project is attached to:

```bash
gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="ai-audit-webmcp" --budget-amount=<EUR-PER-MONTH> \
  --filter-projects=projects/ai-audit-wordlift \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
```

## The entities behind Fix: Content Analysis v3

With `MARKUP_PROVIDER=content-analysis`, each page a scan qualifies is sent as readable text to
WordLift's Content Analysis v3 (`POST /analyze/text`, `Authorization: Key <WordLift key>`), a
multilingual named-entity recogniser with Wikidata linking on WordLift's own infrastructure. It is
asked for the things a business is made of by name, with a label set (organisation, person, place,
product, service, offer, apartment, hotel, attraction, event, brand), and what it finds enters the
page's entities marked `inferred`, by the same rules as the Gemini stand-in: never evidence, never
readiness. An entity below the confidence floor, a role noun ("Guests") or a generic phrase is left
aside and counted in the issues; a Wikidata link is kept only when the linker's own score reaches
0.7, because at the floor it links a village in Lungau to an Italian comune. A call takes about
fourteen seconds and pages run in parallel; the service meters nothing, so `/api/health` counts
characters in and entities out and no cost.

## Generated markup, the Gemini stand-in, and what it costs

With `MARKUP_PROVIDER=gemini`, each page a scan qualifies is sent to Gemini 2.5 Flash as readable
text — title, description, headings and the bounded body the collector already keeps, never raw
HTML — and the JSON-LD that comes back is read by the same rules as declared markup, then added to
the page's entities marked `inferred`. Inferred entities appear in the context graph with an
"Inferred" chip and in the refinement interview as candidates; they never enter the evidence and
never move a readiness score. The report carries `markup` with the counts the Fix finding needs
(entities inferred and not declared) and never the cost.

The cost is a log line per audit, `markup_generated provider model pages failed in out usd`, and a
running total on `GET /api/health` under `markup`. At list price a page is roughly 3,000 input and
600 output tokens, about \$0.0025; a basic scan sends only pages that declare nothing, so at most
four, about \$0.01; a deep scan sends all twelve, about \$0.03. At the daily budget's ceiling of
2,000 audits that is \$20 to \$60 a day, and the real number is on the health endpoint.

The model is one file, `src/server/adapters/markup/GeminiMarkup.ts`, behind `MarkupProvider`.
WordLift's HTML-to-JSON-LD service replaces it there; the validator in `jsonLd.ts`, which refuses
nodes without a type or a name, non-schema.org types and non-URLs, stays in front of whichever
model answers, and is where a SHACL pass goes once the shapes exist.

## The ledger: who reads a report, and who acts

Every read of a report — the page, its JSON, a contract — and of what we publish for agents is
counted by class and by day: a crawler by name, an agent by the platform it acts from, or a
person. The class is decided from the address and the user agent and then forgotten; only the
count is stored, in `visits`, one document per report per day, expiring with the report. Every
sidecar call is counted the same way in `activations`, one document per site per day, by tool,
surface (`web`, `webmcp`, `api`, `mcp`, `audit`) and outcome. Both are read at
`GET /api/reports/:id/visits`, which is never rate limited and never counted.

A "Googlebot" is Google only from Google's published ranges, read at startup and daily from the
three files Google publishes; from anywhere else it is counted as `crawler:claimed-googlebot`.
Counts are batched in memory and written every fifteen seconds, so a burst is one write.

The two collections need the same TTL policy the reports have, created once:

```bash
gcloud firestore fields ttls update expiresAt --collection-group=visits --enable-ttl --project ai-audit-wordlift
gcloud firestore fields ttls update expiresAt --collection-group=activations --enable-ttl --project ai-audit-wordlift
gcloud firestore fields ttls update expiresAt --collection-group=publishedSites --enable-ttl --project ai-audit-wordlift
```

## The entry source: the sites that publish through us

Registries such as Google's read Agentic Resource Discovery catalogs from each site's well-known
path, and the spec allows a manifest at "any entry source". `GET /feed/ai-catalog.json` is ours:
the entries of every site whose own catalog carries the Terms of Action this service writes, each
`url` on the site's own domain. We are the sitemap index, not the directory: no ranking, no
browsing, nothing about a site that did not publish, and the trust anchor stays the publisher's.
When Google's publisher onboarding opens, one submission registers every customer at once.

Membership is observed, never declared. Every live audit reads the site's catalog; if it lists a
`terms-of-action` entry for that host pointing back at that host, the site is recorded in
`publishedSites` (one document per host, the same TTL as reports); if a later audit finds the
catalog gone or no longer ours, the site is removed, so the feed never points a registry at a
document that is not there. The WordLift platform may write the same rows for the sites its plugin
keeps current; the shape is the same. Entries written in Google's `urn:ai:` spelling are rewritten
to the spec's `urn:air:` so the feed validates; an entry with nothing to follow is dropped.

The service also serves its own catalog at `/.well-known/ai-catalog.json`, one entry for its MCP
server, with the card at `/.well-known/mcp/server-card.json`: the audit answers the questions it
asks.

## Rate-limit tiers for hosted assistants

Everyone who uses the audit through claude.ai or ChatGPT arrives from that platform's published
egress addresses, not their own, so a per-address budget would be a budget for the whole platform.
`src/server/security/platformEgress.ts` tells the limiters which platform an address belongs to,
and each platform draws on a pool of its own. Every other address — Claude Desktop, Claude Code,
Codex, MCP Inspector, a browser — keeps the per-address budget. The ranges tier limits and never
gate access: an address nobody published is a direct client, not a refusal.

| Pool, per 10 minutes | Per address | Per hosted platform | Whole service |
| --- | --- | --- | --- |
| Audits and refinements (`audit-website`, `refine-terms-of-action`, `POST /api/reports`) | 12 | 120 | 240 |
| Other MCP calls (`tools/list`, reads) | 90 | 900 | 1800 |

Where the ranges come from:

- **Anthropic**: `160.79.104.0/21` and `2607:6bc0::/48`, published at
  https://platform.claude.com/docs/en/api/ip-addresses and stable by Anthropic's statement.
- **OpenAI**: https://openai.com/chatgpt-connectors.json, which changes with their infrastructure.
  A snapshot ships in `src/server/security/openaiConnectorEgress.ts` (`npm run egress:refresh`
  rewrites it), and the service re-reads the published list every
  `PLATFORM_EGRESS_REFRESH_MINUTES` (six hours by default), keeping the last good list when a
  read fails. An `openai=` entry in `PLATFORM_EGRESS_RANGES` is replaced by the next refresh, so
  use that variable for a platform that is not built in, or with the refresh set to `0`.

`GET /api/health` reports how many ranges each platform currently holds under `platformEgress`,
so a refresh that stopped working is visible without reading logs; each refresh also logs
`platform_egress_refreshed` or `platform_egress_refresh_failed`.

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

### Preview a branch without touching production

A branch can be tried on a separate Cloud Run service with nothing shared with production:

```bash
git checkout docs/activation-plan
PREVIEW=1 SCRAPE_PROVIDER=scrapingbee MARKUP_PROVIDER=gemini scripts/deploy-cloud-run.sh "$PROJECT" us-west1
```

`PREVIEW=1` deploys to `ai-audit-webmcp-preview` on its own `run.app` URL (`SERVICE` overrides
the name) and refuses the production shape: reports, visits, claims, leads and published sites
are written to Firestore collections of their own, `preview_` in front of every name
(`FIRESTORE_COLLECTION_PREFIX`), so a report someone is reviewing with an agent survives the next
deploy and nothing touches the production collections; no HubSpot form and no
directory token are passed even when the shell has them exported, so no contact is created and no
email is sent; `OBSERVE_INTERVAL_DAYS=0`, so no site is re-read on anyone's behalf;
`PUBLIC_INDEXABLE=false`, so robots are told to stay out and every response carries noindex; and
`PUBLIC_APP_URL` is ignored, so the brand's domain stays where it is. The production service, its
domain mapping and its data are untouched, and the preview is deleted with
`gcloud run services delete ai-audit-webmcp-preview`.

What a preview does share is the WordLift API key, the ScrapingBee key and, with
`MARKUP_PROVIDER=gemini`, the Gemini key: each audit it runs costs what a production audit costs,
and `/api/health` on the preview shows the Gemini running total. Rate limits and the daily budget
apply per instance as on production. A deep scan on a preview records the address in
`preview_deepScanLeads` and sends nothing.

The `preview_` collections need the same TTL policy as production's, once per project, or they
outlive the preview:

```bash
for c in preview_reports preview_deepScanLeads preview_publishedSites; do
  gcloud firestore fields ttls update expiresAt --collection-group="$c" --enable-ttl --project "$PROJECT"
done
```

Deleting the preview service leaves its collections behind; delete them from the console, or let
the TTL drain them.

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

## Privacy policy

`public/privacy.html` is served at `/privacy`, ahead of the SPA fallback, and is the URL the plugin
manifests and the directory submissions link to. It states facts about this deployment, so a change
to any of these has to reach the page in the same release:

| The page says | Where it is decided |
| --- | --- |
| Reports, deep-scan addresses and claim hashes live in the United States | Firestore location `nam5`; Cloud Run in `us-west1` |
| Reports, addresses and claim hashes expire after 30 days | `REPORT_TTL_DAYS` and the Firestore TTL policies |
| Server logs are kept for 30 days | Cloud Logging `_Default` bucket retention |
| Deep-scan addresses go to HubSpot's EU data centre | `HUBSPOT_REGION=eu1` |
| Pages are rendered by ScrapingBee and classified by Google Natural Language | `SCRAPE_PROVIDER`, `CLASSIFIER_PROVIDER` |
| A basic scan reads four pages, a deep scan up to twelve | `MAX_PAGES` in the scrape adapters |
| No cookies, no analytics, no third-party scripts | `index.html` and the same-origin CSP |

A removal request (section 9 of the page) is a manual delete of the report document, its
`deepScanLeads` entry and its claim, all keyed by the report id.

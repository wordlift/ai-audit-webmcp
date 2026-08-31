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

Live mode fails fast at startup if a required credential is missing.

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
  scripts/deploy-cloud-run.sh "$PROJECT" us-west1
```

- `PUBLIC_APP_URL` is the custom domain. Share links are baked into stored reports, so a deploy
  that forgets it breaks every existing link. `scripts/finish-domain-switch.sh` is only for the
  first-time domain mapping.
- `SCRAPE_PROVIDER=scrapingbee` mounts the shared secret and enables rendered collection; omitting
  it silently puts production back on native fetch.
- The script stamps `BUILD_SHA` from the checked-out commit and prints the expected release.

The service runs one container with the SPA and the API. The request timeout is 300 seconds because
a live audit takes 30–60 seconds and is handled synchronously; a client that disconnects recovers
the stored report by ID, and a retried `POST` with the same `requestId` is idempotent.

## Verify a release

```bash
curl -s https://beta.audit.wordlift.io/api/health
# {"status":"ok","service":"ai-audit-webmcp","revision":"ai-audit-webmcp-000NN-xxxx","release":"<short sha>","mode":"live"}
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
  non-retryable note. It does not make the report partial.
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

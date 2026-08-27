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
| `SCRAPE_PROVIDER` | `fixtures` | `native-fetch` (default live) or `scrapingbee` |
| `SCRAPINGBEE_API_KEY` | — | Required only for rendered collection |
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
```

## Deploy

```bash
scripts/deploy-cloud-run.sh "$PROJECT" us-west1
curl -s https://ai-audit-webmcp-<project-number>.us-west1.run.app/api/health
```

The service runs one container with the SPA and the API. The request timeout is 300 seconds because
a live audit takes 30–60 seconds and is handled synchronously; a client that disconnects recovers
the stored report by ID, and a retried `POST` with the same `requestId` is idempotent.

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
- **Reports are immutable.** Overrides, reverification, and sidecar invocations create child
  revisions, so a shared link never changes under its reader.

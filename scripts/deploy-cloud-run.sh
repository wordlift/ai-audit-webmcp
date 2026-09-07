#!/usr/bin/env bash
# Deploys the public application to Cloud Run in live WordLift mode.
#
# Prerequisites (one-time):
#   gcloud services enable run.googleapis.com firestore.googleapis.com language.googleapis.com \
#     secretmanager.googleapis.com --project "$PROJECT"
#   printf '%s' "$WORDLIFT_API_KEY" | gcloud secrets create AI_AUDIT_WEBMCP_WORDLIFT_KEY \
#     --data-file=- --project "$PROJECT"
#   gcloud firestore fields ttls update expiresAt --collection-group=reports --enable-ttl \
#     --project "$PROJECT"
#   gcloud firestore fields ttls update expiresAt --collection-group=deepScanLeads --enable-ttl \
#     --project "$PROJECT"
#   gcloud firestore fields ttls update expiresAt --collection-group=reportClaims --enable-ttl \
#     --project "$PROJECT"
#
# Usage: scripts/deploy-cloud-run.sh [project-id] [region]
#
# Preview: PREVIEW=1 deploys the checked-out branch to a separate service on its own run.app URL,
# with nothing shared with production: reports in memory (one instance, gone on restart), no
# HubSpot form, no directory challenge, no weekly re-reads, robots told to stay out and every
# response marked noindex. The WordLift API and ScrapingBee keys are the same accounts; the audits
# a preview runs cost what production's do. Production's service, domain and Firestore are untouched.
#
#   PREVIEW=1 SCRAPE_PROVIDER=scrapingbee MARKUP_PROVIDER=gemini scripts/deploy-cloud-run.sh "$PROJECT" us-west1
set -euo pipefail

PROJECT="${1:-${GOOGLE_CLOUD_PROJECT:-ai-audit-wordlift}}"
REGION="${2:-us-west1}"
PREVIEW="${PREVIEW:-}"
if [ -n "$PREVIEW" ]; then
  SERVICE="${SERVICE:-ai-audit-webmcp-preview}"
  STORE="memory"
  MAX_INSTANCES=1
  PREVIEW_ENV="##PUBLIC_INDEXABLE=false##OBSERVE_INTERVAL_DAYS=0"
  # A preview never writes to HubSpot or serves the directory's token, whatever the shell has exported.
  unset HUBSPOT_PORTAL_ID HUBSPOT_FORM_GUID OPENAI_APPS_CHALLENGE
  if [ -n "${PUBLIC_APP_URL:-}" ]; then
    echo "A preview keeps its own run.app URL; PUBLIC_APP_URL is ignored." >&2
    unset PUBLIC_APP_URL
  fi
else
  SERVICE="${SERVICE:-ai-audit-webmcp}"
  STORE="firestore"
  MAX_INSTANCES=5
  PREVIEW_ENV=""
fi
RELEASE_SHA="${BUILD_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"

# Rendered collection reads JSON-LD that only exists after scripts run. Enable it with
# SCRAPE_PROVIDER=scrapingbee; the SCRAPINGBEE_API_KEY secret already exists in this project,
# shared with the AI Audit service. Each audit renders the audited page plus its sampled pages.
SCRAPE="${SCRAPE_PROVIDER:-native-fetch}"
SECRETS="WORDLIFT_API_KEY=AI_AUDIT_WEBMCP_WORDLIFT_KEY:latest"
if [ "$SCRAPE" = "scrapingbee" ]; then
  SECRETS="$SECRETS,SCRAPINGBEE_API_KEY=SCRAPINGBEE_API_KEY:latest"
fi

# Generated markup — the Fix preview — runs on Gemini 2.5 Flash through the Gemini API until
# WordLift's own service replaces it. Enable it with MARKUP_PROVIDER=gemini; the GEMINI_API_KEY
# secret already exists in this project. /api/health reports what it has cost.
MARKUP="${MARKUP_PROVIDER:-none}"
MARKUP_ENV=""
if [ "$MARKUP" = "gemini" ]; then
  SECRETS="$SECRETS,GEMINI_API_KEY=GEMINI_API_KEY:latest"
  MARKUP_ENV="##MARKUP_PROVIDER=gemini##GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.5-flash}##MARKUP_ON_BASIC=${MARKUP_ON_BASIC:-thin}"
fi

# The app directory verifies this domain by fetching a token from /.well-known. Export
# OPENAI_APPS_CHALLENGE before deploying to serve it; without it the path simply 404s.
CHALLENGE_ENV=""
if [ -n "${OPENAI_APPS_CHALLENGE:-}" ]; then
  CHALLENGE_ENV="##OPENAI_APPS_CHALLENGE=${OPENAI_APPS_CHALLENGE}"
fi

# Deep-scan reports are delivered through the AI Audit's own HubSpot form. Export both before
# deploying; without them a deep scan still records what it owes and sends nothing. Neither is a
# secret — form submissions are unauthenticated — but the GUID stays out of the public repository.
HUBSPOT_ENV=""
if [ -n "${HUBSPOT_PORTAL_ID:-}" ] && [ -n "${HUBSPOT_FORM_GUID:-}" ]; then
  HUBSPOT_ENV="##HUBSPOT_PORTAL_ID=${HUBSPOT_PORTAL_ID}##HUBSPOT_FORM_GUID=${HUBSPOT_FORM_GUID}##HUBSPOT_REGION=${HUBSPOT_REGION:-na1}"
  # Only once the property exists on the form: HubSpot refuses a submission naming a field it has not got.
  if [ -n "${HUBSPOT_SOURCE_FIELD:-}" ]; then
    HUBSPOT_ENV="${HUBSPOT_ENV}##HUBSPOT_SOURCE_FIELD=${HUBSPOT_SOURCE_FIELD}"
  fi
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
# Share links are baked into stored reports, so a custom domain must survive a redeploy.
PUBLIC_URL="${PUBLIC_APP_URL:-https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app}"

echo "Deploying ${SERVICE} to ${PROJECT} (${REGION})${PREVIEW:+ as a preview: memory store, noindex, nothing sent}"
echo "Public URL will be ${PUBLIC_URL}"

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --timeout 300 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances "$MAX_INSTANCES" \
  --concurrency 20 \
  --set-env-vars "^##^NODE_ENV=production##AUDIT_PROVIDER=wordlift##AI_AUDIT_BASE_URL=https://api.wordlift.io##SCRAPE_PROVIDER=${SCRAPE}##CLASSIFIER_PROVIDER=google-nlp##REPORT_STORE=${STORE}##GOOGLE_CLOUD_PROJECT=${PROJECT}##PUBLIC_APP_URL=${PUBLIC_URL}##REPORT_TTL_DAYS=30##BUILD_SHA=${RELEASE_SHA}${CHALLENGE_ENV}${HUBSPOT_ENV}${MARKUP_ENV}${PREVIEW_ENV}" \
  --set-secrets "$SECRETS"

echo
echo "Smoke test:"
echo "  curl -s ${PUBLIC_URL}/api/health"
echo "  curl -s -X POST ${PUBLIC_URL}/mcp -H 'content-type: application/json' \\"
echo "    -H 'accept: application/json, text/event-stream' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'"
echo "Expected release: ${RELEASE_SHA}"

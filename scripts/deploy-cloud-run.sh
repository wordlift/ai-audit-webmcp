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
set -euo pipefail

PROJECT="${1:-${GOOGLE_CLOUD_PROJECT:-ai-audit-wordlift}}"
REGION="${2:-us-west1}"
SERVICE="ai-audit-webmcp"
RELEASE_SHA="${BUILD_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"

# Rendered collection reads JSON-LD that only exists after scripts run. Enable it with
# SCRAPE_PROVIDER=scrapingbee; the SCRAPINGBEE_API_KEY secret already exists in this project,
# shared with the AI Audit service. Each audit renders the audited page plus its sampled pages.
SCRAPE="${SCRAPE_PROVIDER:-native-fetch}"
SECRETS="WORDLIFT_API_KEY=AI_AUDIT_WEBMCP_WORDLIFT_KEY:latest"
if [ "$SCRAPE" = "scrapingbee" ]; then
  SECRETS="$SECRETS,SCRAPINGBEE_API_KEY=SCRAPINGBEE_API_KEY:latest"
fi

# The app directory verifies this domain by fetching a token from /.well-known. Export
# OPENAI_APPS_CHALLENGE before deploying to serve it; without it the path simply 404s.
CHALLENGE_ENV=""
if [ -n "${OPENAI_APPS_CHALLENGE:-}" ]; then
  CHALLENGE_ENV="##OPENAI_APPS_CHALLENGE=${OPENAI_APPS_CHALLENGE}"
fi

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
# Share links are baked into stored reports, so a custom domain must survive a redeploy.
PUBLIC_URL="${PUBLIC_APP_URL:-https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app}"

echo "Deploying ${SERVICE} to ${PROJECT} (${REGION})"
echo "Public URL will be ${PUBLIC_URL}"

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --timeout 300 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 5 \
  --concurrency 20 \
  --set-env-vars "^##^NODE_ENV=production##AUDIT_PROVIDER=wordlift##AI_AUDIT_BASE_URL=https://api.wordlift.io##SCRAPE_PROVIDER=${SCRAPE}##CLASSIFIER_PROVIDER=google-nlp##REPORT_STORE=firestore##GOOGLE_CLOUD_PROJECT=${PROJECT}##PUBLIC_APP_URL=${PUBLIC_URL}##REPORT_TTL_DAYS=30##BUILD_SHA=${RELEASE_SHA}${CHALLENGE_ENV}" \
  --set-secrets "$SECRETS"

echo
echo "Smoke test:"
echo "  curl -s ${PUBLIC_URL}/api/health"
echo "  curl -s -X POST ${PUBLIC_URL}/mcp -H 'content-type: application/json' \\"
echo "    -H 'accept: application/json, text/event-stream' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'"
echo "Expected release: ${RELEASE_SHA}"

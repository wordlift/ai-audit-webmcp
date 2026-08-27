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
#
# Usage: scripts/deploy-cloud-run.sh [project-id] [region]
set -euo pipefail

PROJECT="${1:-${GOOGLE_CLOUD_PROJECT:-ai-audit-wordlift}}"
REGION="${2:-us-west1}"
SERVICE="ai-audit-webmcp"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
PUBLIC_URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"

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
  --set-env-vars "^##^NODE_ENV=production##AUDIT_PROVIDER=wordlift##AI_AUDIT_BASE_URL=https://api.wordlift.io##SCRAPE_PROVIDER=native-fetch##CLASSIFIER_PROVIDER=google-nlp##REPORT_STORE=firestore##GOOGLE_CLOUD_PROJECT=${PROJECT}##PUBLIC_APP_URL=${PUBLIC_URL}##REPORT_TTL_DAYS=30" \
  --set-secrets "WORDLIFT_API_KEY=AI_AUDIT_WEBMCP_WORDLIFT_KEY:latest"

echo
echo "Smoke test:"
echo "  curl -s ${PUBLIC_URL}/api/health"

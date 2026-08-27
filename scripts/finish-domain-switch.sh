#!/usr/bin/env bash
# Completes the move to the custom domain once its DNS record resolves.
# Run after adding the CNAME:  beta.audit  ->  ghs.googlehosted.com  (DNS only)
#
# Usage: scripts/finish-domain-switch.sh [hostname] [project] [region]
set -euo pipefail

HOST="${1:-beta.audit.wordlift.io}"
PROJECT="${2:-${GOOGLE_CLOUD_PROJECT:-ai-audit-wordlift}}"
REGION="${3:-us-west1}"

# Ask the zone's own nameserver: a local resolver may still hold a negative cache entry
# from before the record existed.
ZONE="$(echo "$HOST" | rev | cut -d. -f1,2 | rev)"
AUTH_NS="$(dig +short "$ZONE" NS | head -1)"
resolves() { dig +short ${AUTH_NS:+@"$AUTH_NS"} "$HOST" | grep -q .; }

echo "Waiting for ${HOST} to resolve (via ${AUTH_NS:-system resolver})..."
for attempt in $(seq 1 60); do
  if resolves; then
    echo "  resolved after ${attempt} check(s)"
    break
  fi
  sleep 20
done

resolves || { echo "ERROR: ${HOST} still does not resolve. Add the CNAME first."; exit 1; }

echo "Waiting for the Google-managed certificate (can take up to an hour)..."
for attempt in $(seq 1 120); do
  if curl -sfI --max-time 15 "https://${HOST}/api/health" >/dev/null 2>&1; then
    echo "  certificate active after ${attempt} check(s)"
    break
  fi
  sleep 30
done

echo "Health check:"
curl -s "https://${HOST}/api/health"; echo

# Report share links are built from PUBLIC_APP_URL, so the service must know its own name.
echo "Pointing PUBLIC_APP_URL at https://${HOST}"
gcloud run services update ai-audit-webmcp \
  --project "$PROJECT" --region "$REGION" \
  --update-env-vars "PUBLIC_APP_URL=https://${HOST}" \
  --quiet

echo
echo "Done. Public URL: https://${HOST}"

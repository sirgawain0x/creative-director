#!/usr/bin/env bash
# Deploy Creative Director to Vertex Agent Engine (us-east1).
# Requires: agents-cli, gcloud ADC, human approval.
#
# Production traffic for Creative Pixels uses Cloud Run service `creative-director`
# (see scripts/deploy-cloudrun.sh). This script targets Agent Engine when used.
#
# Optional — headless assembly auth (Agent Runtime env, NOT Vercel):
#   export PIXELS_HEADLESS_API_KEY='<same value as Cloud Run PIXELS_API_KEY>'
#   npm run deploy
#
# Agent Observability — plain env (see lib/agento11y.ts defaults) + Secret Manager:
#   export AGENTO11Y_AUTH_TOKEN_SECRET=creative-director-agento11y-auth-token
#   export OTEL_EXPORTER_OTLP_HEADERS_SECRET=creative-director-otel-otlp-headers
#   export AGENTO11Y_SECRET_VERSION=latest   # optional, applies to both secrets
#
# Vercel production may already set PIXELS_HEADLESS_API_KEY for the Pixels app;
# the agent still needs this var on the Reasoning Engine for assemble_and_sync_timeline.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/agento11y-deploy-env.sh
source "${ROOT}/scripts/lib/agento11y-deploy-env.sh"

BASE_VARS=(
  "CREATIVE_DIRECTOR_MODE=production"
  "PIXELS_API_BASE_URL=https://create.creativeplatform.xyz"
  "RENDERS_GCS_BUCKET=creative-ai-491118-creative-pixels-renders"
  "VERTEX_LOCATION=us-central1"
  "PIXELS_HEADLESS_URL=https://pixels-headless-3ortoh2aiq-uc.a.run.app"
  "${agento11y_plain_env_vars[@]}"
)

if [[ -n "${PIXELS_HEADLESS_API_KEY:-}" ]]; then
  BASE_VARS+=("PIXELS_HEADLESS_API_KEY=${PIXELS_HEADLESS_API_KEY}")
  echo "deploy: including PIXELS_HEADLESS_API_KEY in --update-env-vars"
else
  echo "deploy: PIXELS_HEADLESS_API_KEY not set in shell — skipping (existing engine env unchanged if already set)"
fi

ENV_CSV="$(agento11y_join_csv "${BASE_VARS[@]}")"
SECRET_CSV="$(agento11y_join_csv "${agento11y_secret_vars[@]}")"

echo "deploy: Agent Observability plain env → ${#BASE_VARS[@]} keys (no secret values)"
echo "deploy: Secret Manager refs → AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:${AGENTO11Y_SECRET_VERSION}, OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS_SECRET}:${AGENTO11Y_SECRET_VERSION}"

exec agents-cli deploy \
  --project creative-ai-491118 \
  --region us-east1 \
  --update-env-vars "${ENV_CSV}" \
  --update-secrets "${SECRET_CSV}"

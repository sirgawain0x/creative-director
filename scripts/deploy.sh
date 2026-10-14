#!/usr/bin/env bash
# Deploy Creative Director to Vertex Agent Engine (us-east1).
# Requires: agents-cli, gcloud ADC, human approval.
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

AGENTO11Y_ENDPOINT="${AGENTO11Y_ENDPOINT:-https://agento11y-prod-us-east-0.grafana.net}"
AGENTO11Y_PROTOCOL="${AGENTO11Y_PROTOCOL:-http}"
AGENTO11Y_AUTH_MODE="${AGENTO11Y_AUTH_MODE:-basic}"
AGENTO11Y_AUTH_TENANT_ID="${AGENTO11Y_AUTH_TENANT_ID:-829818}"
OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-https://otlp-gateway-prod-us-east-0.grafana.net/otlp}"
OTEL_EXPORTER_OTLP_PROTOCOL="${OTEL_EXPORTER_OTLP_PROTOCOL:-http/protobuf}"
OTEL_SERVICE_NAME="${OTEL_SERVICE_NAME:-creative-director-ai}"

AGENTO11Y_AUTH_TOKEN_SECRET="${AGENTO11Y_AUTH_TOKEN_SECRET:-creative-director-agento11y-auth-token}"
OTEL_EXPORTER_OTLP_HEADERS_SECRET="${OTEL_EXPORTER_OTLP_HEADERS_SECRET:-creative-director-otel-otlp-headers}"
AGENTO11Y_SECRET_VERSION="${AGENTO11Y_SECRET_VERSION:-latest}"

BASE_VARS=(
  "CREATIVE_DIRECTOR_MODE=production"
  "PIXELS_API_BASE_URL=https://create.creativeplatform.xyz"
  "RENDERS_GCS_BUCKET=creative-ai-491118-creative-pixels-renders"
  "VERTEX_LOCATION=us-central1"
  "PIXELS_HEADLESS_URL=https://pixels-headless-3ortoh2aiq-uc.a.run.app"
  "AGENTO11Y_ENDPOINT=${AGENTO11Y_ENDPOINT}"
  "AGENTO11Y_PROTOCOL=${AGENTO11Y_PROTOCOL}"
  "AGENTO11Y_AUTH_MODE=${AGENTO11Y_AUTH_MODE}"
  "AGENTO11Y_AUTH_TENANT_ID=${AGENTO11Y_AUTH_TENANT_ID}"
  "OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT}"
  "OTEL_EXPORTER_OTLP_PROTOCOL=${OTEL_EXPORTER_OTLP_PROTOCOL}"
  "OTEL_SERVICE_NAME=${OTEL_SERVICE_NAME}"
)

if [[ -n "${PIXELS_HEADLESS_API_KEY:-}" ]]; then
  BASE_VARS+=("PIXELS_HEADLESS_API_KEY=${PIXELS_HEADLESS_API_KEY}")
  echo "deploy: including PIXELS_HEADLESS_API_KEY in --update-env-vars"
else
  echo "deploy: PIXELS_HEADLESS_API_KEY not set in shell — skipping (existing engine env unchanged if already set)"
fi

SECRET_PAIRS=(
  "AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:${AGENTO11Y_SECRET_VERSION}"
  "OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS_SECRET}:${AGENTO11Y_SECRET_VERSION}"
)

IFS=,
ENV_CSV="${BASE_VARS[*]}"
SECRET_CSV="${SECRET_PAIRS[*]}"

echo "deploy: Agent Observability plain env → ${#BASE_VARS[@]} keys (no secret values)"
echo "deploy: Secret Manager refs → AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:${AGENTO11Y_SECRET_VERSION}, OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS_SECRET}:${AGENTO11Y_SECRET_VERSION}"

exec agents-cli deploy \
  --project creative-ai-491118 \
  --region us-east1 \
  --update-env-vars "${ENV_CSV}" \
  --update-secrets "${SECRET_CSV}"

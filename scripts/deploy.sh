#!/usr/bin/env bash
# Deploy Creative Director to Vertex Agent Engine (us-east1).
# Requires: agents-cli, gcloud ADC, human approval.
#
# Optional — headless assembly auth (Agent Runtime env, NOT Vercel):
#   export PIXELS_HEADLESS_API_KEY='<same value as Cloud Run PIXELS_API_KEY>'
#   npm run deploy
#
# Vercel production may already set PIXELS_HEADLESS_API_KEY for the Pixels app;
# the agent still needs this var on the Reasoning Engine for assemble_and_sync_timeline.

set -euo pipefail

BASE_VARS=(
  "CREATIVE_DIRECTOR_MODE=production"
  "RENDERS_GCS_BUCKET=creative-ai-491118-creative-pixels-renders"
  "VERTEX_LOCATION=us-central1"
  "PIXELS_HEADLESS_URL=https://pixels-headless-3ortoh2aiq-uc.a.run.app"
)

if [[ -n "${PIXELS_HEADLESS_API_KEY:-}" ]]; then
  BASE_VARS+=("PIXELS_HEADLESS_API_KEY=${PIXELS_HEADLESS_API_KEY}")
  echo "deploy: including PIXELS_HEADLESS_API_KEY in --update-env-vars"
else
  echo "deploy: PIXELS_HEADLESS_API_KEY not set in shell — skipping (existing engine env unchanged if already set)"
fi

IFS=,
ENV_CSV="${BASE_VARS[*]}"

exec agents-cli deploy \
  --project creative-ai-491118 \
  --region us-east1 \
  --update-env-vars "${ENV_CSV}"

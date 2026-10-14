#!/usr/bin/env bash
# Wire Agent Observability on production Cloud Run (service: creative-director, us-east1).
# Vercel sets DIRECTOR_ADK_BASE_URL to this service URL for Creative Pixels.
#
# Uses gcloud run services update with --update-env-vars / --update-secrets so existing
# service env (PIXELS_*, GOOGLE_*, etc.) is not wiped. Requires human approval before run.
#
# The Cloud Run runtime service account needs roles/secretmanager.secretAccessor on the
# referenced secrets (grant via Console/Terraform — not changed here).
#
# Optional overrides:
#   CLOUD_RUN_SERVICE=creative-director
#   CLOUD_RUN_REGION=us-east1
#   GCP_PROJECT=creative-ai-491118
#   AGENTO11Y_AUTH_TOKEN_SECRET / OTEL_EXPORTER_OTLP_HEADERS_SECRET / AGENTO11Y_SECRET_VERSION

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/agento11y-deploy-env.sh
source "${ROOT}/scripts/lib/agento11y-deploy-env.sh"

SERVICE="${CLOUD_RUN_SERVICE:-creative-director}"
REGION="${CLOUD_RUN_REGION:-us-east1}"
PROJECT="${GCP_PROJECT:-creative-ai-491118}"

ENV_CSV="$(agento11y_join_csv "${agento11y_plain_env_vars[@]}")"
SECRET_CSV="$(agento11y_join_csv "${agento11y_secret_vars[@]}")"

echo "deploy-cloudrun: service=${SERVICE} region=${REGION} project=${PROJECT}"
echo "deploy-cloudrun: plain env keys=${#agento11y_plain_env_vars[@]} (no secret values)"
echo "deploy-cloudrun: secret refs AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:${AGENTO11Y_SECRET_VERSION}, OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS_SECRET}:${AGENTO11Y_SECRET_VERSION}"

exec gcloud run services update "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --update-env-vars "${ENV_CSV}" \
  --update-secrets "${SECRET_CSV}"

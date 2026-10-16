# Shared Agent Observability env + Secret Manager refs for deploy scripts.
# Source from bash; do not execute directly. Never echo secret values.

: "${AGENTO11Y_ENDPOINT:=https://agento11y-prod-us-east-0.grafana.net}"
: "${AGENTO11Y_PROTOCOL:=http}"
: "${AGENTO11Y_AUTH_MODE:=basic}"
: "${AGENTO11Y_AUTH_TENANT_ID:=829818}"
: "${OTEL_EXPORTER_OTLP_ENDPOINT:=https://otlp-gateway-prod-us-east-0.grafana.net/otlp}"
: "${OTEL_EXPORTER_OTLP_PROTOCOL:=http/protobuf}"
: "${OTEL_SERVICE_NAME:=creative-director-ai}"

: "${AGENTO11Y_AUTH_TOKEN_SECRET:=creative-director-agento11y-auth-token}"
: "${OTEL_EXPORTER_OTLP_HEADERS_SECRET:=creative-director-otel-otlp-headers}"
: "${AGENTO11Y_SECRET_VERSION:=latest}"

agento11y_plain_env_vars=(
  "AGENTO11Y_ENDPOINT=${AGENTO11Y_ENDPOINT}"
  "AGENTO11Y_PROTOCOL=${AGENTO11Y_PROTOCOL}"
  "AGENTO11Y_AUTH_MODE=${AGENTO11Y_AUTH_MODE}"
  "AGENTO11Y_AUTH_TENANT_ID=${AGENTO11Y_AUTH_TENANT_ID}"
  "OTEL_EXPORTER_OTLP_ENDPOINT=${OTEL_EXPORTER_OTLP_ENDPOINT}"
  "OTEL_EXPORTER_OTLP_PROTOCOL=${OTEL_EXPORTER_OTLP_PROTOCOL}"
  "OTEL_SERVICE_NAME=${OTEL_SERVICE_NAME}"
)

agento11y_secret_vars=(
  "AGENTO11Y_AUTH_TOKEN=${AGENTO11Y_AUTH_TOKEN_SECRET}:${AGENTO11Y_SECRET_VERSION}"
  "OTEL_EXPORTER_OTLP_HEADERS=${OTEL_EXPORTER_OTLP_HEADERS_SECRET}:${AGENTO11Y_SECRET_VERSION}"
)

agento11y_join_csv() {
  local IFS=,
  echo "$*"
}

#!/usr/bin/env bash
# Template: push self-hosted Grafana MCP creds to Agent Runtime.
# Requires: mcp-grafana running, GRAFANA_SERVICE_ACCOUNT_TOKEN set locally.
# Do NOT commit real tokens. Deploy only after explicit approval.
#
# Usage:
#   export GRAFANA_MCP_URL='https://YOUR_MCP_HOST/mcp'
#   export GRAFANA_SERVICE_ACCOUNT_TOKEN='glsa_...'
#   ./scripts/grafana-runtime-env.example.sh

set -euo pipefail

: "${GRAFANA_MCP_URL:?Set GRAFANA_MCP_URL to your open-source Grafana MCP endpoint}"
: "${GRAFANA_SERVICE_ACCOUNT_TOKEN:?Set GRAFANA_SERVICE_ACCOUNT_TOKEN (glsa_...)}"

echo "Would update Agent Runtime with:"
echo "  GRAFANA_MCP_URL=${GRAFANA_MCP_URL}"
echo "  GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_*** (redacted)"
echo
echo "Run after human approval:"
echo "agents-cli deploy --update-env-vars \"GRAFANA_MCP_URL=${GRAFANA_MCP_URL},GRAFANA_SERVICE_ACCOUNT_TOKEN=\${GRAFANA_SERVICE_ACCOUNT_TOKEN}\""

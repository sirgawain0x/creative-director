#!/usr/bin/env bash
# Write AGENTO11Y_AUTH_TOKEN + OTEL_EXPORTER_OTLP_HEADERS into .env (untracked).
# Usage (token never echoed):
#   printf '%s' 'glc_...' | ./scripts/set-agento11y-token.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
TENANT_ID="${AGENTO11Y_AUTH_TENANT_ID:-829818}"
ENDPOINT="${AGENTO11Y_ENDPOINT:-https://agento11y-prod-us-east-0.grafana.net}"
OTEL_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-https://otlp-gateway-prod-us-east-2.grafana.net/otlp}"

if [[ -t 0 ]]; then
  read -r -s -p "Paste glc_ token (input hidden): " TOKEN
  echo
else
  TOKEN="$(cat)"
fi
TOKEN="$(printf '%s' "$TOKEN" | tr -d '\r\n')"
if [[ -z "$TOKEN" || "$TOKEN" != glc_* ]]; then
  echo "Expected a token starting with glc_" >&2
  exit 1
fi

AUTH_B64="$(printf '%s' "${TENANT_ID}:${TOKEN}" | base64 | tr -d '\n')"
HEADERS="Authorization=Basic ${AUTH_B64}"

python3 - "$ENV_FILE" "$ENDPOINT" "$TENANT_ID" "$TOKEN" "$OTEL_ENDPOINT" "$HEADERS" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
pairs = {
    "AGENTO11Y_ENDPOINT": sys.argv[2],
    "AGENTO11Y_PROTOCOL": "http",
    "AGENTO11Y_AUTH_MODE": "basic",
    "AGENTO11Y_AUTH_TENANT_ID": sys.argv[3],
    "AGENTO11Y_AUTH_TOKEN": sys.argv[4],
    "OTEL_EXPORTER_OTLP_ENDPOINT": sys.argv[5],
    "OTEL_EXPORTER_OTLP_HEADERS": sys.argv[6],
}
text = path.read_text() if path.exists() else ""
lines = text.splitlines()
seen = set()
out = []
for line in lines:
    if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    key = line.split("=", 1)[0]
    if key in pairs:
        out.append(f"{key}={pairs[key]}")
        seen.add(key)
    else:
        out.append(line)
for key, val in pairs.items():
    if key not in seen:
        out.append(f"{key}={val}")
path.write_text("\n".join(out).rstrip() + "\n")
print(f"Wrote Agent Observability secrets to {path} (gitignored).")
print(f"Token length: {len(sys.argv[4])} (value not printed)")
PY

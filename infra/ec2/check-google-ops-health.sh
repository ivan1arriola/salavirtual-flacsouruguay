#!/usr/bin/env bash
# Emits at most one alert per severity per hour. Configure optional webhook via
# GOOGLE_OPS_ALERT_WEBHOOK_URL in the private .env.production file.
set -euo pipefail
umask 077
url="http://127.0.0.1:3101/api/v1/operaciones/estado"
state_file="/run/salavirtual-google-ops-alert.state"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT

http_code="$(/usr/bin/curl --silent --show-error --max-time 15 -o "$body" -w '%{http_code}' \
  -H "Authorization: Bearer ${CRON_SECRET:?CRON_SECRET no configurado}" "$url")" || http_code="000"
state="$(/usr/bin/python3 - "$body" <<'PY'
import json,sys
try:
    with open(sys.argv[1], encoding="utf-8") as file:
        status=json.load(file).get("status")
    print(status if status in ("ok","degradado","critico") else "critico")
except (ValueError, OSError):
    print("critico")
PY
)"
if [[ "$http_code" != "200" && "$http_code" != "503" ]]; then
  state="critico"
fi
if [[ "$state" == "ok" ]]; then
  rm -f "$state_file"
  exit 0
fi

# Alert through a separately configured Google Chat / Slack-compatible webhook.
# A failed/missing webhook is still visible as a failed systemd run.
now="$(date +%s)"
last_state=""
last_time=0
if [[ -r "$state_file" ]]; then
  read -r last_state last_time < "$state_file" || true
fi
if [[ "$state" != "$last_state" || $((now - last_time)) -ge 3600 ]]; then
  if [[ -n "${GOOGLE_OPS_ALERT_WEBHOOK_URL:-}" ]]; then
    payload="$(printf '{"text":"Sala Virtual FLACSO: integración Google %s. Verificar /api/v1/operaciones/estado y /api/v1/operaciones/google con cuenta administradora."}' "$state")"
    /usr/bin/curl --fail --silent --show-error --max-time 10 \
      -H "Content-Type: application/json" -d "$payload" \
      "$GOOGLE_OPS_ALERT_WEBHOOK_URL" >/dev/null
    printf '%s %s\n' "$state" "$now" > "$state_file"
  else
    echo "Google operations status $state; no GOOGLE_OPS_ALERT_WEBHOOK_URL configured" >&2
  fi
fi
[[ "$state" != "critico" ]]

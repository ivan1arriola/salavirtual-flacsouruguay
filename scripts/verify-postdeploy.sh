#!/usr/bin/env bash
# Read-only operational checks after a Sala Virtual release.
set -euo pipefail

BASE=/srv/apps/salavirtual-flacso
URL=http://127.0.0.1:3101/api/health
EXPECTED_SHA="${1:-}"
failures=0

check() {
  local label="$1"; shift
  if "$@"; then
    printf 'PASS %s\n' "$label"
  else
    printf 'FAIL %s\n' "$label" >&2
    failures=$((failures + 1))
  fi
}

current_release() {
  [[ -L "$BASE/current" && -f "$BASE/current/server.js" ]]
}

release_sha() {
  local resolved
  resolved="$(readlink -f "$BASE/current")" || return 1
  [[ "$resolved" == "$BASE/releases/"* ]] || return 1
  if [[ -n "$EXPECTED_SHA" ]]; then
    [[ "$resolved" == "$BASE/releases/$EXPECTED_SHA" ]]
  fi
}

health() {
  /usr/bin/curl --fail --silent --show-error --max-time 8 "$URL" |
    /usr/bin/python3 -c 'import sys,json; x=json.load(sys.stdin); sys.exit(0 if x.get("ok") is True and x.get("database")=="ok" else 1)'
}

check "Release activo" current_release
check "Release coincide con SHA solicitado" release_sha
check "Servicio principal activo" systemctl is-active --quiet salavirtual.service
check "Healthcheck y PostgreSQL" health
for timer in salavirtual-artifacts-sync.timer salavirtual-google-pending.timer salavirtual-ops-health.timer; do
  check "Timer activo: $timer" systemctl is-active --quiet "$timer"
  check "Timer habilitado: $timer" systemctl is-enabled --quiet "$timer"
done

if (( failures > 0 )); then
  printf '%s comprobaciones fallidas\n' "$failures" >&2
  exit 1
fi
printf 'Comprobaciones operativas básicas superadas. No se han probado flujos funcionales ni integraciones externas.\n'

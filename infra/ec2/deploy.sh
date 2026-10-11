#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "SHA inválido: '$SHA'" >&2
  exit 2
fi

BASE="/srv/apps/salavirtual-flacso"
SRC="$BASE/source"
RELEASES="$BASE/releases"
ENV_FILE="$BASE/shared/.env.production"
RELEASE="$RELEASES/$SHA"
LOCK_FILE="/run/lock/salavirtual-deploy.lock"
NPM_CACHE="$BASE/.npm-cache"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Ya hay otro despliegue de Sala Virtual en curso." >&2
  exit 3
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Falta $ENV_FILE" >&2
  exit 4
fi

if [[ ! -d "$SRC/.git" ]]; then
  echo "Falta el checkout Git en $SRC" >&2
  exit 5
fi

GIT=(sudo -u ubuntu -H env PATH=/usr/bin:/bin:/usr/sbin:/sbin git)
NPM=(sudo -u ubuntu -H env PATH=/usr/bin:/bin:/usr/sbin:/sbin NPM_CONFIG_CACHE="$NPM_CACHE" NEXT_TELEMETRY_DISABLED=1 npm)

mkdir -p "$RELEASES" "$NPM_CACHE"
chown ubuntu:ubuntu "$NPM_CACHE"

# Los chequeos manuales/operativos pueden dejar artefactos generados con otro
# propietario. El deploy siempre ejecuta npm y el build como ubuntu.
for generated_path in "$SRC/node_modules" "$SRC/.next" "$SRC/coverage" "$SRC/tsconfig.tsbuildinfo"; do
  if [[ -e "$generated_path" || -L "$generated_path" ]]; then
    chown -R ubuntu:ubuntu "$generated_path"
  fi
done

"${GIT[@]}" -C "$SRC" fetch --prune origin main
REMOTE_SHA="$("${GIT[@]}" -C "$SRC" rev-parse origin/main)"
if [[ "$REMOTE_SHA" != "$SHA" ]]; then
  echo "main cambió: se pidió $SHA pero origin/main está en $REMOTE_SHA. Se cancela este deploy obsoleto." >&2
  exit 75
fi

"${GIT[@]}" -C "$SRC" checkout -f main
"${GIT[@]}" -C "$SRC" reset --hard "$SHA"

cd "$SRC"

echo "=== Node ==="
/usr/bin/node --version
/usr/bin/npm --version

echo "=== Dependencias ==="
"${NPM[@]}" ci --include=dev
if [[ ! -x "$SRC/node_modules/.bin/tsx" ]]; then
  echo "Falta tsx después de npm ci --include=dev; los comandos administrativos no podrían ejecutarse." >&2
  exit 6
fi

echo "=== Build ==="
sudo -u ubuntu -H env \
  PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  NPM_CONFIG_CACHE="$NPM_CACHE" \
  NEXT_TELEMETRY_DISABLED=1 \
  APP_BASE_URL="https://salavirtual.flacso.edu.uy" \
  TIMEZONE="America/Montevideo" \
  DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
  AUTH_SECRET="build-only-not-for-production-0123456789-abcdefghijklmnopqrstuvwxyz" \
  AUTH_TRUST_HOST="true" \
  CONFIG_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" \
  npm run build

echo "=== Preparar release ==="
rm -rf "$RELEASE"
install -d -o salavirtual -g salavirtual "$RELEASE"
cp -a "$SRC/.next/standalone/." "$RELEASE/"
install -d -o salavirtual -g salavirtual "$RELEASE/.next"
cp -a "$SRC/.next/static" "$RELEASE/.next/static"
if [[ -d "$SRC/public" ]]; then
  cp -a "$SRC/public" "$RELEASE/public"
fi
chown -R salavirtual:salavirtual "$RELEASE"

test -f "$RELEASE/server.js"

echo "=== Migraciones Prisma ==="
DATABASE_URL="$({
  python3 - "$ENV_FILE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
for line in path.read_text().splitlines():
    if line.startswith("DATABASE_URL="):
        value = line.split("=", 1)[1].strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        print(value, end="")
        break
else:
    raise SystemExit("DATABASE_URL no encontrada")
PY
} )"

sudo -u ubuntu -H env \
  PATH=/usr/bin:/bin:/usr/sbin:/sbin \
  DATABASE_URL="$DATABASE_URL" \
  npx prisma migrate deploy
unset DATABASE_URL

PREVIOUS=""
if [[ -L "$BASE/current" ]]; then
  PREVIOUS="$(readlink -f "$BASE/current" || true)"
fi

echo "=== Activar release ==="
ln -s "$RELEASE" "$BASE/.current-next-$SHA"
mv -Tf "$BASE/.current-next-$SHA" "$BASE/current"
install -m 0644 "$SRC/infra/ec2/salavirtual.service" /etc/systemd/system/salavirtual.service
install -m 0644 "$SRC/infra/ec2/salavirtual-artifacts-sync.service" /etc/systemd/system/salavirtual-artifacts-sync.service
install -m 0644 "$SRC/infra/ec2/salavirtual-artifacts-sync.timer" /etc/systemd/system/salavirtual-artifacts-sync.timer
install -m 0644 "$SRC/infra/ec2/salavirtual-ops-health.service" /etc/systemd/system/salavirtual-ops-health.service
install -m 0644 "$SRC/infra/ec2/salavirtual-ops-health.timer" /etc/systemd/system/salavirtual-ops-health.timer
systemctl daemon-reload
systemctl enable salavirtual.service >/dev/null
systemctl enable salavirtual-artifacts-sync.timer >/dev/null
systemctl restart salavirtual.service
systemctl restart salavirtual-artifacts-sync.timer

HEALTH_OK=0
for _ in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3101/api/health | python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data.get("database") == "ok" else 1)'; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done

if [[ "$HEALTH_OK" -ne 1 ]]; then
  echo "Healthcheck falló para $SHA" >&2
  journalctl -u salavirtual.service -n 100 --no-pager || true
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" ]]; then
    echo "Rollback a $PREVIOUS" >&2
    ln -s "$PREVIOUS" "$BASE/.current-rollback-$SHA"
    mv -Tf "$BASE/.current-rollback-$SHA" "$BASE/current"
    systemctl restart salavirtual.service
    echo "Código anterior restaurado. Las migraciones de base de datos NO se revierten automáticamente." >&2
  fi
  exit 1
fi

systemctl enable salavirtual-ops-health.timer >/dev/null
systemctl restart salavirtual-ops-health.timer

echo "=== Deploy OK ==="
echo "SHA=$SHA"
echo "RELEASE=$(readlink -f "$BASE/current")"
systemctl --no-pager --full status salavirtual.service | sed -n '1,12p'
curl --fail --silent --show-error http://127.0.0.1:3101/api/health
echo

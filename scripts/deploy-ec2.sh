#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# deploy-ec2.sh · Despliegue local de Sala Virtual FLACSO a EC2
# Replicación local del GitHub Action (CI y Deploy EC2) vía SSH.
# ==============================================================================

DEPLOY_HOST="${DEPLOY_HOST:-servidor-flacso}"
REMOTE_SRC="/srv/apps/salavirtual-flacso/source"
REMOTE_BASE="/srv/apps/salavirtual-flacso"
APP_HEALTH_URL="http://127.0.0.1:3101/api/health"

SKIP_CI=0
CI_ONLY=0
STATUS_ONLY=0
ROLLBACK=0
FORCE=0
AUTO_PUSH=0
TARGET_SHA=""

usage() {
  cat <<'EOF'
Uso: scripts/deploy-ec2.sh [OPCIONES] [COMMIT_SHA]

Replicación local de GitHub Actions (CI y Deploy EC2) conectando por SSH.

Opciones:
  --skip-ci        Omitir las validaciones locales de CI antes del despliegue.
  --ci-only        Solo ejecutar validaciones de CI locales sin desplegar.
  --status         Consultar el estado del servicio y healthcheck en el servidor.
  --rollback       Revertir al release anterior en el servidor EC2.
  --host <host>    Host SSH a utilizar (por defecto: servidor-flacso o $DEPLOY_HOST).
  --push           Hacer 'git push origin main' automáticamente si el commit no está en origin.
  --force          Permitir desplegar con cambios sin commitear o desde rama distinta a main.
  -h, --help       Mostrar esta ayuda.

Ejemplos:
  npm run deploy                # Flujo completo: CI local + Git check + Deploy SSH
  npm run deploy:quick          # Deploy rápido sin repetir CI local
  npm run deploy:status         # Ver versión activa y salud del servidor
  npm run deploy:rollback       # Revertir al release inmediatamente anterior
  npm run ci:local              # Solo ejecutar la suite de CI local
EOF
}

# Parsear argumentos
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-ci)
      SKIP_CI=1
      shift
      ;;
    --ci-only)
      CI_ONLY=1
      shift
      ;;
    --status)
      STATUS_ONLY=1
      shift
      ;;
    --rollback)
      ROLLBACK=1
      shift
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --push)
      AUTO_PUSH=1
      shift
      ;;
    --host)
      DEPLOY_HOST="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Opción desconocida: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -z "$TARGET_SHA" ]]; then
        TARGET_SHA="$1"
      else
        echo "Argumento inesperado: $1" >&2
        exit 1
      fi
      shift
      ;;
  esac
done

# Colores de salida
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${CYAN}==>${NC} $1"; }
log_success() { echo -e "${GREEN}==>${NC} $1"; }
log_warn() { echo -e "${YELLOW}ADVERTENCIA:${NC} $1"; }
log_error() { echo -e "${RED}ERROR:${NC} $1" >&2; }

# ------------------------------------------------------------------------------
# 1. Modo Status
# ------------------------------------------------------------------------------
if [[ "$STATUS_ONLY" -eq 1 ]]; then
  log_info "Consultando estado en $DEPLOY_HOST..."
  ssh "$DEPLOY_HOST" bash -s <<EOF
    set -e
    echo "--- Release activo ---"
    if [ -L "$REMOTE_BASE/current" ]; then
      CURRENT_TARGET=\$(readlink -f "$REMOTE_BASE/current")
      echo "Ubicación: \$CURRENT_TARGET"
      echo "SHA:       \$(basename "\$CURRENT_TARGET")"
    else
      echo "No existe enlace $REMOTE_BASE/current"
    fi
    echo
    echo "--- Estado de salavirtual.service ---"
    sudo systemctl --no-pager --full status salavirtual.service | sed -n '1,12p' || true
    echo
    echo "--- Healthcheck interno ---"
    curl -fsS "$APP_HEALTH_URL" 2>/dev/null && echo || echo "Healthcheck no respondió"
    echo
EOF
  exit 0
fi

# ------------------------------------------------------------------------------
# 2. Modo Rollback
# ------------------------------------------------------------------------------
if [[ "$ROLLBACK" -eq 1 ]]; then
  log_info "Iniciando rollback en $DEPLOY_HOST..."
  ssh -t "$DEPLOY_HOST" bash -s <<'EOF'
    set -euo pipefail
    BASE="/srv/apps/salavirtual-flacso"
    RELEASES="$BASE/releases"
    if [ ! -L "$BASE/current" ]; then
      echo "No hay release actual para revertir." >&2
      exit 1
    fi
    CURRENT="$(readlink -f "$BASE/current")"
    CURRENT_NAME="$(basename "$CURRENT")"

    # Listar releases ordenados por fecha de modificación (más reciente primero)
    PREV="$(ls -1td "$RELEASES"/* | grep -v "/$CURRENT_NAME$" | head -n 1 || true)"
    if [ -z "$PREV" ] || [ ! -d "$PREV" ]; then
      echo "No se encontró ningún release previo al cual hacer rollback." >&2
      exit 1
    fi

    echo "Release actual: $CURRENT_NAME"
    echo "Revirtiendo a:  $(basename "$PREV")"

    sudo ln -s "$PREV" "$BASE/.rollback-next-$"
    sudo mv -Tf "$BASE/.rollback-next-$" "$BASE/current"
    sudo systemctl restart salavirtual.service

    # Comprobar healthcheck
    OK=0
    for _ in $(seq 1 20); do
      if curl --fail --silent --show-error http://127.0.0.1:3101/api/health | grep -q '"database":"ok"'; then
        OK=1
        break
      fi
      sleep 2
    done

    if [ "$OK" -eq 1 ]; then
      echo "Rollback completado con éxito."
      curl -fsS http://127.0.0.1:3101/api/health
      echo
    else
      echo "Healthcheck falló tras el rollback. Restaurando release anterior..." >&2
      sudo ln -s "$CURRENT" "$BASE/.rollback-restore-$"
      sudo mv -Tf "$BASE/.rollback-restore-$" "$BASE/current"
      sudo systemctl restart salavirtual.service
      exit 1
    fi
EOF
  log_success "Rollback finalizado."
  exit 0
fi

# ------------------------------------------------------------------------------
# 3. Validaciones de CI Local (Replicando test-coverage.yml)
# ------------------------------------------------------------------------------
run_local_ci() {
  log_info "Ejecutando suite de CI local..."

  echo -e "\n${CYAN}[1/5] Validación de Schema y Prisma${NC}"
  npm run validate:schema
  npx prisma validate

  echo -e "\n${CYAN}[2/5] Comprobación de tipos TypeScript${NC}"
  npm run check

  echo -e "\n${CYAN}[3/5] Tests unitarios con Vitest${NC}"
  npm test

  echo -e "\n${CYAN}[4/5] Auditoría crítica de dependencias${NC}"
  npm audit --omit=dev --audit-level=critical

  echo -e "\n${CYAN}[5/5] Build de producción Next.js${NC}"
  npm run build

  log_success "Todas las validaciones de CI pasaron correctamente."
}

if [[ "$CI_ONLY" -eq 1 ]]; then
  run_local_ci
  exit 0
fi

if [[ "$SKIP_CI" -eq 1 && "$FORCE" -ne 1 ]]; then
  log_error "Omitir CI requiere --force y queda reservado a emergencias documentadas."
  exit 1
fi

if [[ "$SKIP_CI" -eq 0 ]]; then
  run_local_ci
else
  log_warn "Omitiendo validaciones locales de CI (--skip-ci activado)."
fi

# ------------------------------------------------------------------------------
# 4. Validaciones de Git y Commit Objetivo
# ------------------------------------------------------------------------------
log_info "Comprobando estado local de Git..."

# Comprobar si hay cambios sin commitear
if ! git diff --quiet || ! git diff --cached --quiet; then
  if [[ "$FORCE" -eq 1 ]]; then
    log_warn "Hay cambios locales sin commitear, pero continuando por --force."
  else
    log_error "Hay cambios locales sin commitear en el repositorio."
    log_warn "Haz commit o stash de tus cambios antes de desplegar, o usa --force si estás seguro."
    exit 1
  fi
fi

# Rama actual
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  if [[ "$FORCE" -eq 1 ]]; then
    log_warn "Estás en la rama '$CURRENT_BRANCH' (distinta de 'main'), continuando por --force."
  else
    log_error "No estás en la rama 'main' (rama actual: '$CURRENT_BRANCH')."
    log_warn "El entorno de producción se despliega desde 'main'. Haz merge/checkout a main o usa --force."
    exit 1
  fi
fi

# Determinar SHA a desplegar
if [[ -z "$TARGET_SHA" ]]; then
  TARGET_SHA="$(git rev-parse HEAD)"
fi

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  # Si pasaron un SHA corto o ref, resolverlo a full SHA
  TARGET_SHA="$(git rev-parse "$TARGET_SHA" 2>/dev/null || true)"
  if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    log_error "SHA objetivo inválido: '$TARGET_SHA'"
    exit 1
  fi
fi

log_info "Commit objetivo para despliegue: $TARGET_SHA"

# Comprobar si el SHA está en origin/main
log_info "Verificando sincronización con GitHub (origin/main)..."
git fetch origin main --quiet

REMOTE_MAIN_SHA="$(git rev-parse origin/main)"
if [[ "$REMOTE_MAIN_SHA" != "$TARGET_SHA" ]]; then
  log_warn "El commit local ($TARGET_SHA) no coincide con origin/main ($REMOTE_MAIN_SHA)."
  DO_PUSH=0
  if [[ "$AUTO_PUSH" -eq 1 ]]; then
    DO_PUSH=1
  elif [ -t 0 ]; then
    echo -n "¿Deseas hacer 'git push origin main' ahora para sincronizar con GitHub? [s/N]: "
    read -r RESP
    if [[ "$RESP" =~ ^[sSyY]$ ]]; then
      DO_PUSH=1
    fi
  fi

  if [[ "$DO_PUSH" -eq 1 ]]; then
    log_info "Haciendo 'git push origin main'..."
    git push origin main
  else
    if [[ "$FORCE" -eq 0 ]]; then
      log_error "El script en EC2 exige que el SHA esté en origin/main para evitar despliegues desactualizados."
      log_warn "Pushea a origin/main o usa --force o --push para continuar."
      exit 1
    fi
  fi
fi

# ------------------------------------------------------------------------------
# 5. Comprobar Conexión SSH al Servidor
# ------------------------------------------------------------------------------
log_info "Comprobando conexión SSH a $DEPLOY_HOST..."
if ! ssh -o BatchMode=yes -o ConnectTimeout=8 "$DEPLOY_HOST" true 2>/dev/null; then
  log_error "No se pudo conectar vía SSH a '$DEPLOY_HOST'."
  log_warn "Verifica tu configuración en ~/.ssh/config o el acceso por red."
  exit 1
fi
log_success "Conexión SSH exitosa a $DEPLOY_HOST."

# ------------------------------------------------------------------------------
# 6. Ejecutar Despliegue en EC2 (Replicando deploy-ec2.yml)
# ------------------------------------------------------------------------------
log_info "Iniciando despliegue remoto en $DEPLOY_HOST para SHA $TARGET_SHA..."

ssh "$DEPLOY_HOST" bash -s -- "$REMOTE_SRC" "$TARGET_SHA" <<'EOF'
set -euo pipefail
SRC="$1"
SHA="$2"

echo "=== [1/4] Actualizando repositorio en $SRC ==="
sudo -u ubuntu -H env PATH=/usr/bin:/bin:/usr/sbin:/sbin git -C "$SRC" fetch --prune origin main
sudo -u ubuntu -H env PATH=/usr/bin:/bin:/usr/sbin:/sbin git -C "$SRC" checkout -f main
sudo -u ubuntu -H env PATH=/usr/bin:/bin:/usr/sbin:/sbin git -C "$SRC" reset --hard "$SHA"

echo "=== [2/4] Ejecutando infra/ec2/deploy.sh ==="
sudo /bin/bash "$SRC/infra/ec2/deploy.sh" "$SHA"
EOF

# ------------------------------------------------------------------------------
# 7. Verificación Final
# ------------------------------------------------------------------------------
log_info "Comprobando healthcheck final en $DEPLOY_HOST..."
ssh "$DEPLOY_HOST" "curl -fsS $APP_HEALTH_URL"
echo

log_success "¡Despliegue completado con éxito en $DEPLOY_HOST!"
echo -e "Commit desplegado: ${GREEN}$TARGET_SHA${NC}"


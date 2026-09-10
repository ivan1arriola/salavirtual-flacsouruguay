#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${1:?Se requiere el directorio fuente}"
LEGACY_DOMAIN="salas-meet.flacso.edu.uy"
HTTP_SITE="/etc/apache2/sites-available/salas-meet-redirect-http.conf"
HTTPS_SITE="/etc/apache2/sites-available/salas-meet-redirect-https.conf"
CERTIFICATE="/etc/letsencrypt/live/${LEGACY_DOMAIN}/fullchain.pem"
CHALLENGE_DIR="/var/lib/letsencrypt/.well-known/acme-challenge"

for command in a2enmod a2ensite apache2ctl certbot install systemctl; do
  command -v "$command" >/dev/null || {
    echo "Falta el comando requerido: $command" >&2
    exit 1
  }
done

install -d -m 0755 "$CHALLENGE_DIR"
install -m 0644 "$SOURCE_DIR/infra/ec2/salas-meet-redirect-http.conf" "$HTTP_SITE"
a2enmod rewrite ssl >/dev/null
a2ensite salas-meet-redirect-http >/dev/null
apache2ctl configtest
systemctl reload apache2

if [[ ! -f "$CERTIFICATE" ]]; then
  certbot certonly --webroot \
    --webroot-path /var/lib/letsencrypt \
    --domain "$LEGACY_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --keep-until-expiring
fi

install -m 0644 "$SOURCE_DIR/infra/ec2/salas-meet-redirect-https.conf" "$HTTPS_SITE"
a2ensite salas-meet-redirect-https >/dev/null
apache2ctl configtest
systemctl reload apache2

curl --fail --silent --show-error --head \
  --resolve "${LEGACY_DOMAIN}:443:127.0.0.1" \
  "https://${LEGACY_DOMAIN}/" | grep -qi '^location: https://salavirtual\.flacso\.edu\.uy/$'

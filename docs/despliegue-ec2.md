# Despliegue de Sala Virtual en EC2

## Objetivo

Migrar `https://salavirtual.flacso.edu.uy` desde Vercel a una instancia EC2 sin cambiar el dominio público ni mezclar en el mismo corte la migración de la base de datos.

La primera fase mantiene la `DATABASE_URL` de producción actual. Esto permite mover únicamente el runtime de Next.js y reducir el riesgo del corte. La base puede migrarse a PostgreSQL local en una segunda ventana.

## Arquitectura objetivo

- Apache/ISPConfig termina HTTPS para `salavirtual.flacso.edu.uy`.
- Apache hace reverse proxy a `127.0.0.1:3101`.
- Sala Virtual se ejecuta como `salavirtual.service` con Node.js 24.
- El release activo vive en `/srv/apps/salavirtual-flacso/current`.
- Los secretos de infraestructura viven fuera del repositorio en `/srv/apps/salavirtual-flacso/shared/.env.production`.
- Las credenciales de cuentas de servicio de Google Workspace se administran desde la UI y sus claves privadas se guardan cifradas en PostgreSQL.
- Amazon SES usa el instance profile IAM de EC2 para enviar correo; no se configuran access keys de AWS en `.env.production`. Ver [configuracion-amazon-ses.md](configuracion-amazon-ses.md).
- El cron que Vercel ejecutaba a las `08:00 UTC` pasa a `salavirtual-calendar-sync.timer`.
- GitHub Actions publica releases inmutables en `/srv/apps/salavirtual-flacso/releases/<sha>`.

## 1. Preparar EC2 una sola vez

Comprobar Node:

```bash
node --version
```

Debe ser Node 24.x.

Crear usuario y estructura:

```bash
sudo useradd --system \
  --home-dir /srv/apps/salavirtual-flacso \
  --shell /usr/sbin/nologin \
  salavirtual 2>/dev/null || true

sudo install -d -o salavirtual -g salavirtual /srv/apps/salavirtual-flacso
sudo install -d -o salavirtual -g salavirtual /srv/apps/salavirtual-flacso/releases
sudo install -d -o salavirtual -g salavirtual /srv/apps/salavirtual-flacso/shared
```

Crear el archivo de entorno:

```bash
sudo nano /srv/apps/salavirtual-flacso/shared/.env.production
```

Copiar los valores de producción que actualmente usa el runtime. Como mínimo deben conservarse:

```dotenv
APP_BASE_URL="https://salavirtual.flacso.edu.uy"
TIMEZONE="America/Montevideo"
DATABASE_URL="..."
LEGACY_DATABASE_URL="..."
AUTH_SECRET="..."
AUTH_TRUST_HOST="true"
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
CRON_SECRET="..."
CONFIG_ENCRYPTION_KEY="..."
SMTP_FROM="..."
```

`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` y `GOOGLE_SERVICE_ACCOUNT_SUBJECT` no forman parte de la configuración de runtime. La cuenta Principal, las credenciales Legacy y la delegación se administran en **Configuración > Google Workspace**. `CONFIG_ENCRYPTION_KEY` sí debe permanecer en el entorno porque cifra las claves privadas almacenadas en PostgreSQL.

Incluir también todas las variables opcionales realmente configuradas en producción: SMTP, VAPID, Zoom histórico, webhooks y carpetas de Drive.

Proteger el archivo:

```bash
sudo chown root:salavirtual /srv/apps/salavirtual-flacso/shared/.env.production
sudo chmod 640 /srv/apps/salavirtual-flacso/shared/.env.production
```

## 2. Instalar las unidades systemd

Desde una copia del repositorio:

```bash
sudo cp infra/ec2/salavirtual.service /etc/systemd/system/
sudo cp infra/ec2/salavirtual-calendar-sync.service /etc/systemd/system/
sudo cp infra/ec2/salavirtual-calendar-sync.timer /etc/systemd/system/
sudo cp infra/ec2/salavirtual-artifacts-sync.service /etc/systemd/system/
sudo cp infra/ec2/salavirtual-artifacts-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable salavirtual.service
sudo systemctl enable salavirtual-calendar-sync.timer
sudo systemctl enable salavirtual-artifacts-sync.timer
```

No iniciar todavía `salavirtual.service` hasta que exista el primer release.

## 3. Configurar Apache/ISPConfig

Habilitar módulos si todavía no están activos:

```bash
sudo a2enmod proxy proxy_http headers
sudo systemctl reload apache2
```

Agregar al vhost de `salavirtual.flacso.edu.uy` las directivas de `infra/ec2/apache-proxy.conf`.

Antes del cambio DNS, Apache puede configurarse y probarse localmente sin afectar Vercel.

## 4. Configurar GitHub Actions

Crear estos secretos del repositorio:

- `EC2_HOST`: IP pública o hostname de la instancia.
- `EC2_USER`: usuario SSH con `sudo` para gestionar `/srv/apps/salavirtual-flacso` y `systemd`.
- `EC2_SSH_PRIVATE_KEY`: clave privada de despliegue.

El workflow `Deploy · EC2` es manual durante la migración para impedir un corte accidental.

## 5. Primer despliegue

Ejecutar manualmente el workflow `Deploy · EC2` sobre `main` después de fusionar la preparación EC2.

El workflow:

1. compila el proyecto con Node 24;
2. genera el build `standalone` de Next.js;
3. crea un release identificado por SHA;
4. lo copia a EC2;
5. actualiza el symlink `current`;
6. reinicia `salavirtual.service`;
7. exige que `http://127.0.0.1:3101/api/health` responda correctamente y que PostgreSQL sea accesible.

Comprobaciones manuales en EC2:

```bash
sudo systemctl status salavirtual.service --no-pager
curl -fsS http://127.0.0.1:3101/api/health
sudo journalctl -u salavirtual.service -n 100 --no-pager
```

El healthcheck esperado es similar a:

```json
{ "ok": true, "app": "flacso-meet", "database": "ok" }
```

## 6. Probar Apache antes del DNS

Con el vhost y certificado ya preparados en EC2, probar desde la propia instancia:

```bash
curl -kfsS \
  --resolve salavirtual.flacso.edu.uy:443:127.0.0.1 \
  https://salavirtual.flacso.edu.uy/api/health
```

También probar login, agenda, creación/edición de una reunión de prueba y acceso a grabaciones.

## 7. Corte de DNS

Solo cuando Node, PostgreSQL y Apache respondan correctamente:

1. bajar temporalmente el TTL del registro DNS;
2. cambiar `salavirtual.flacso.edu.uy` desde Vercel a la IP pública de EC2;
3. confirmar que el certificado TLS de EC2 cubre el dominio;
4. verificar externamente `/api/health`;
5. comprobar login de Google, agenda, grabaciones y creación/edición de reuniones.

No cambiar `APP_BASE_URL`: el dominio público sigue siendo el mismo.

Los redirect URI de Google OAuth tampoco deberían cambiar si ya usan `salavirtual.flacso.edu.uy`.

## 8. Activar el cron en EC2

Después del corte:

```bash
sudo systemctl start salavirtual-calendar-sync.timer
sudo systemctl list-timers salavirtual-calendar-sync.timer
```

Prueba manual:

```bash
sudo systemctl start salavirtual-calendar-sync.service
sudo journalctl -u salavirtual-calendar-sync.service -n 100 --no-pager
```

El timer conserva la ejecución diaria de Vercel a las `08:00 UTC`.

## 9. Retirar Vercel

Mantener Vercel disponible como rollback corto hasta comprobar estabilidad.

Cuando EC2 esté validado:

- retirar el cron de `vercel.json`;
- desasociar `salavirtual.flacso.edu.uy` del proyecto de Vercel;
- sustituir la lógica de CI que hoy crea commits `[vercel-deploy:verified]` por un despliegue EC2 posterior a CI;
- conservar temporalmente `flacso-meet.vercel.app` solo si se necesita para rollback o pruebas.

## 10. Rollback de aplicación

Los releases son inmutables. Para volver al anterior:

```bash
ls -1 /srv/apps/salavirtual-flacso/releases
sudo ln -sfn /srv/apps/salavirtual-flacso/releases/<SHA_ANTERIOR> \
  /srv/apps/salavirtual-flacso/current
sudo systemctl restart salavirtual.service
curl -fsS http://127.0.0.1:3101/api/health
```

Si el problema aparece después del cambio DNS y EC2 no puede recuperarse rápidamente, el rollback de infraestructura consiste en volver temporalmente el DNS al destino de Vercel mientras el proyecto siga disponible allí.

## 11. Despliegue local alternativo vía SSH (`servidor-flacso`)

Para desplegar directamente desde la máquina de desarrollo sin depender de GitHub Actions o AWS SSM:

```bash
# Flujo recomendado (ejecuta CI local, comprueba git y despliega vía SSH):
npm run deploy

# Despliegue rápido (omite suite de CI local si ya fue ejecutada):
npm run deploy:quick

# Consultar release activo, salud y estado de salavirtual.service:
npm run deploy:status

# Rollback al release inmediatamente anterior en el servidor:
npm run deploy:rollback

# Ejecutar únicamente la suite de validaciones locales (CI):
npm run ci:local
```

El script `scripts/deploy-ec2.sh`:

1. Comprueba la conexión SSH a `servidor-flacso`.
2. Verifica que el árbol de Git esté limpio y en rama `main`.
3. Valida que el commit a desplegar esté en `origin/main` (ofrece hacer `git push origin main` si falta).
4. Ejecuta las validaciones de CI (`schema`, `Prisma`, `TypeScript`, `Vitest`, `npm audit`, `build`).
5. Conecta por SSH y ejecuta `deploy.sh` en `/srv/apps/salavirtual-flacso/source`.
6. Verifica el healthcheck en tiempo real.

## Reuniones de Zoom compartidas por serie

Todos los encuentros de una serie en Zoom comparten una sola reunión (un solo enlace y una sola sala). Es el único comportamiento: la bandera `ZOOM_REUNION_COMPARTIDA` se retiró y, si sigue definida en `.env.production`, se ignora (puede borrarse).

Requisito del primer despliegue con este cambio: no puede quedar ninguna versión anterior del worker en ejecución. Una versión vieja procesaría un `CANCELAR` sobre un evento con reunión compartida y borraría la reunión que usan los demás encuentros. Orden obligatorio:

1. Detener el worker anterior y desplegar app y worker juntos con `deploy.sh`.
2. Comprobar que solo corre la versión nueva del worker.
3. Probar una serie nueva de 3 encuentros: deben tener el mismo enlace; cancelar uno no debe borrar la reunión; cancelar el último sí.
4. Recién entonces usar la migración de Meet a Zoom por serie y la corrección de series que ya tienen enlaces distintos.

Rollback: volver al despliegue anterior. Las series creadas con reunión compartida conservan su enlace; una versión anterior del código las trataría como eventos independientes, por lo que no debe reactivarse el worker viejo mientras existan.

## Segunda fase opcional: mover PostgreSQL a EC2

No hacer esta migración en el mismo corte que el runtime.

Cuando la aplicación ya esté estable en EC2:

1. crear una base y usuario PostgreSQL exclusivos para Sala Virtual;
2. programar una ventana corta sin escrituras;
3. ejecutar `pg_dump` de la base de producción actual;
4. restaurar en PostgreSQL local;
5. cambiar únicamente `DATABASE_URL` en `.env.production`;
6. reiniciar `salavirtual.service`;
7. validar `/api/health` y conteos críticos antes de reabrir escrituras.

Este orden separa el riesgo de hosting del riesgo de datos y simplifica el rollback.

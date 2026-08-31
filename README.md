# Sala Virtual FLACSO

Plataforma web para gestionar solicitudes, agenda, asistencia, grabaciones y liquidaciones de reuniones académicas de FLACSO Uruguay.

## Fuente vigente

Este repositorio es la aplicacion operativa vigente para Google Meet. Los cambios de producto, UI y dominio sobre reuniones actuales deben hacerse aca.

Este proyecto reemplaza a:

- `../flacso-zoom-plataforma-web`
- `../flacso-zoom-sincronizador-desktop`

Zoom queda como proveedor historico: se conserva para consulta, trazabilidad e importacion de registros previos, pero el flujo operativo nuevo se modela sobre Google Meet y Google Workspace.

## Objetivos

- Modelo de datos en 3NF, con entidades institucionales, solicitudes, eventos, proveedores y liquidaciones separadas.
- Nucleo agnostico de proveedor para no acoplar la plataforma a Meet ni a Zoom.
- Google Meet como proveedor operativo principal.
- Zoom como historico de reuniones, grabaciones y costos previos.
- Base preparada para migracion incremental desde la plataforma Zoom actual.

## Correo transaccional

Las notificaciones por correo usan la misma estrategia heredada de FLACSO Zoom: Gmail API con cuenta de servicio y delegacion de dominio. SMTP queda como fallback. Si no hay proveedor configurado, la app conserva las notificaciones internas y omite el envio de email sin romper el flujo.

Gmail API:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_SUBJECT`
- `SMTP_FROM`

SMTP fallback:

- `SMTP_HOST`
- `SMTP_PORT` (por defecto `587`)
- `SMTP_SECURE` (`true` para puerto 465)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

## Primer setup local

```bash
nvm install 24
nvm use 24
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

## Documentacion

- [Arquitectura](docs/arquitectura.md)
- [Modelo 3NF](docs/modelo-3nf.md)
- [Plan de migracion](docs/migracion-desde-flacso-zoom.md)
- [Configuracion de Google Workspace](docs/configuracion-google-workspace.md)
- [Reportes mensuales de asistencia tecnica](docs/reportes-mensuales-asistencia.md)
- [UI ligera](docs/ui-ligera.md)

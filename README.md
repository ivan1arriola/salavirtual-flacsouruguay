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

## Stack inicial

- Next.js App Router + TypeScript
- Prisma + PostgreSQL
- Auth.js
- Google Workspace APIs como integracion principal

## Google Workspace y correo transaccional

Las cuentas de servicio de Google Workspace se administran desde **Configuración > Google Workspace**. Sus claves privadas se guardan cifradas en PostgreSQL con `CONFIG_ENCRYPTION_KEY`; no se configuran como variables `GOOGLE_*` del runtime.

La credencial **Principal** es la única autorizada para crear reuniones nuevas. Se pueden registrar credenciales **Legacy** para administrar espacios Meet históricos creados por proyectos anteriores. El fallback Legacy solo se intenta ante el error específico de permisos sobre `Member` de un Meet existente.

Las notificaciones por correo usan Gmail API con la credencial Principal y la delegación configurada en la UI. SMTP queda como fallback. Si no hay proveedor configurado, la app conserva las notificaciones internas y omite el envio de email sin romper el flujo.

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

Después del primer acceso, completar la integración en **Configuración > Google Workspace**.

## Documentacion

- [Arquitectura](docs/arquitectura.md)
- [Modelo 3NF](docs/modelo-3nf.md)
- [Plan de migracion](docs/migracion-desde-flacso-zoom.md)
- [Despliegue en EC2](docs/despliegue-ec2.md)
- [Configuracion de Google Workspace](docs/configuracion-google-workspace.md)
- [Reportes mensuales de asistencia tecnica](docs/reportes-mensuales-asistencia.md)
- [UI ligera](docs/ui-ligera.md)

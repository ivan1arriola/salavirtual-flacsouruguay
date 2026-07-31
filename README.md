# Gestor FLACSO Google Meet

Nueva plataforma web para gestionar solicitudes, agenda, asistencia, grabaciones y liquidaciones de reuniones academicas de FLACSO Uruguay.

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
- [UI ligera](docs/ui-ligera.md)

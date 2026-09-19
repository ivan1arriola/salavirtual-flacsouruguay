# Etapa 4: Módulo Conferencias y Casos de Uso

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.
> Baseline: `npm test` passing (104 files, 755 tests), `npm run check` clean, `npm run build` clean.

**Goal:** Crear el módulo `src/modules/conferencias/` con sus cinco capas (`domain`, `ports`, `application`, `infrastructure`, `api.ts`), el puerto estable `ConferenceProvider`, casos de uso de aprovisionamiento, gestión de cohosts y descarte de operaciones con idempotencia, preservando fachadas retrocompatibles en `src/modules/meet/`.

**Architecture:** Monolito modular desacoplado. Las reglas puras de videoconferencias, links de Meet, cohosts, salud de integración y parsing de conferencias residen en `conferencias/domain`. Las interfaces de persistencia y de proveedor residen en `conferencias/ports`. Los flujos orquestados (claims, leases, guardado temprano de externalEventId, reintentos seguros) residen en `conferencias/application`. Los adaptadores a Google Workspace (`src/integrations/google`) y Prisma residen en `conferencias/infrastructure`. La composición de dependencias se centraliza en `src/bootstrap/conferencias.server.ts`.

**Tech Stack:** Node.js 24, TypeScript, Prisma 6, Vitest, Next.js 16 App Router.

**Spec Reference:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md` (Secciones 4, 6, 8, 9, 14, 15, 17) y `docs/superpowers/plans/2026-09-19-capas-y-encapsulamiento-plan-rector.md` (Etapa 4).

---

## Invariantes y Restricciones

1. **Pureza de Dominio:** `src/modules/conferencias/domain/` contendrá únicamente tipos `readonly` y funciones sincrónicas puras. Cero imports de Prisma, Next.js, React, `google-auth-library` o APIs externas.
2. **Idempotencia de Aprovisionamiento:**
   - Si existe `externalEventId`, un retry bajo ninguna circunstancia debe crear un nuevo evento en Calendar.
   - Guardado temprano de `externalEventId` inmediatamente después de la llamada exitosa a Calendar.
   - Claims y leases de integración con expiración de 10 minutos para proteger concurrencia.
   - Ejecución estricta de la `operacionPendiente` persistida (`PROVISIONAR`, `REPROGRAMAR`, `CONFIGURAR_MEET`, `CANCELAR`).
3. **Manejo de Cohosts:**
   - Verificación real de membresías en Google Meet (`spaces.members`).
   - Soporte de fallback a credenciales Legacy restringido a reuniones históricas.
4. **Fachadas Temporales:** `src/modules/meet/` mantendrá sus nombres y firmas exportadas (`MeetProvider`, `crearGoogleCalendarProvider`, `sincronizarEventosPendientes`, `descartarOperacionPendiente`, etc.) delegando a `conferencias` para garantizar cero roturas en llamadas existentes.
5. **Verificación Continua:** `npm run check`, `npm test`, `npm run validate:schema`, `npm run build`.

---

## Tareas

### Tarea 1: Capa de Dominio de Conferencias (`src/modules/conferencias/domain/`)
- Crear `src/modules/conferencias/domain/conferencias.types.ts`:
  - Tipos base: `ConferenceProvisionRequest`, `ConferenceProvisionResult`, `DetalleCohostsVerificados`, `IntegracionConferenciaHealth`, `EstadoIntegracionConferencia`, `OperacionPendienteConferencia`.
- Crear `src/modules/conferencias/domain/cohosts.domain.ts`:
  - Funciones puras `normalizeCohostEmails`, `cohostAccountGuidance`.
- Crear `src/modules/conferencias/domain/cohost-verification.domain.ts`:
  - Funciones puras `registrarVerificacionCohosts`, `invalidarVerificacionCohosts`, `detalleCohostsVerificados`, `cohostsConfirmados`.
- Crear `src/modules/conferencias/domain/conferencia-health.domain.ts`:
  - Funciones puras `esErrorNoBloqueanteDeScopesMeet`, `requiereAtencionIntegracionMeet`, `estadoIntegracionEfectivo`, `esErrorDeScopesInsuficientes`.
- Crear `src/modules/conferencias/domain/meet-link.domain.ts`:
  - Funciones puras `normalizeMeetLink`, `meetLinks`.
- Crear `src/modules/conferencias/domain/calendar-event.domain.ts`:
  - Funciones puras `crearCalendarEvent`, `crearConferenceDataMeet`, `extraerMeetProvisionado`, `eventoCalendarCoincideConSolicitud`, `extraerConferenceData`.
- Crear `src/modules/conferencias/domain/index.ts`.
- Crear `test/conferencias-domain.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 2: Capa de Puertos de Conferencias (`src/modules/conferencias/ports/`)
- Crear `src/modules/conferencias/ports/conference-provider.port.ts`:
  - Contrato `ConferenceProvider` (`crearEventoCalendar`, `obtenerEvento`, `configurarEventoMeet`, `cancelarEvento`, `actualizarEvento`, `compartirConferenciaCalendar`, `configurarMeetExistente`, `sincronizarCohostsExistente`).
- Crear `src/modules/conferencias/ports/conferencias-repository.port.ts`:
  - Contrato `ConferenciasRepositoryPort` (`obtenerSnapshotEvento`, `reclamarEventoParaSincronizar`, `guardarExitoProvision`, `registrarErrorOperacion`, `descartarOperacion`, `descartarOperacionesNoBloqueantesLote`).
- Crear `src/modules/conferencias/ports/index.ts`.
- Verificar con `npm run check`.

### Tarea 3: Capa de Aplicación de Conferencias (`src/modules/conferencias/application/`)
- Crear `src/modules/conferencias/application/provisionar-conferencias.use-case.ts`:
  - Implementar orquestación de aprovisionamiento con claims, persistencia de `externalEventId`, polling de conferencia y ejecución de operación pendiente con idempotencia.
- Crear `src/modules/conferencias/application/sincronizar-cohosts.use-case.ts`:
  - Sincronización de cohosts en eventos ya creados.
- Crear `src/modules/conferencias/application/descartar-operaciones.use-case.ts`:
  - Descarte individual y en lote no bloqueante.
- Crear `src/modules/conferencias/application/index.ts`.
- Crear `test/conferencias-application.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 4: Capa de Infraestructura de Conferencias (`src/modules/conferencias/infrastructure/`)
- Crear `src/modules/conferencias/infrastructure/google/google-conference-provider.adapter.ts`:
  - Implementa `ConferenceProvider` coordinando `src/integrations/google` y resolviendo credenciales de workspace.
- Crear `src/modules/conferencias/infrastructure/prisma/prisma-conferencias-repository.adapter.ts`:
  - Implementa `ConferenciasRepositoryPort` encapsulando las transacciones de Prisma sobre `EventoProveedor`, `recalcularSolicitud` y locks de base de datos.
- Crear `src/modules/conferencias/infrastructure/index.ts`.
- Crear `test/conferencias-infrastructure.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 5: API Pública, Raíz de Composición Servidor y Fachadas
- Crear `src/modules/conferencias/api.ts`.
- Crear `src/bootstrap/conferencias.server.ts` con `server-only` y `obtenerServicioConferencias()`.
- Crear `test/conferencias-bootstrap.test.ts`.
- Conectar fachadas retrocompatibles en `src/modules/meet/`:
  - `provider.ts`, `cohosts.domain.ts`, `cohost-verification.domain.ts`, `integration-health.domain.ts`, `meet-link.domain.ts`, `google-calendar.domain.ts`, `google-calendar.adapter.ts`, `provisionar-eventos.service.ts`, `operaciones-integracion.service.ts`.
- Verificar que todos los tests existentes de regresión sigan pasando.

### Tarea 6: Fronteras Arquitectónicas y Verificación Integral
- Auditar que `src/modules/conferencias/` cumpla las 5 capas en `test/architecture-boundaries.test.ts` y que `test/functional-architecture.test.ts` certifique pureza en `domain/`.
- Ejecutar:
  - `npm run check`
  - `npm test`
  - `npm run validate:schema`
  - `npm run build`
- Documentar en `walkthrough.md` y registrar commit.


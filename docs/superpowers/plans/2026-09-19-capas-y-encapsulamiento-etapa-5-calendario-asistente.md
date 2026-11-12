# Etapa 5: Calendario del Asistente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.
> Baseline: `npm test` passing (108 files, 815 tests), `npm run check` clean, `npm run build` clean.

**Goal:** Implementar las 5 capas arquitectónicas para el calendario del asistente (`domain`, `ports`, `application`, `infrastructure`, `api.ts`), el puerto `AssistantCalendarProvider`, casos de uso de sincronización de instancias, solicitudes, usuarios y reconciliación periódica con contención segura de errores, y adaptar la infraestructura a los clientes técnicos de Google (`src/integrations/google`), preservando fachadas retrocompatibles en `src/modules/asistencia/`.

**Architecture:** Monolito modular desacoplado.

- `src/modules/asistencia/domain/`: Tipos inmutables y reglas puras (hashes determinísticos de eventos, cuentas deseadas, planificación de sincronización publicar/eliminar, verificación de errores).
- `src/modules/asistencia/ports/`: Contrato de integración `AssistantCalendarProvider` (publicar/eliminar eventos) y contrato de persistencia `AssistantCalendarRepositoryPort`.
- `src/modules/asistencia/application/`: Casos de uso de sincronización (`sincronizarCalendarioAsistenteInstancia`, `sincronizarCalendariosAsistenteSolicitud`, `sincronizarCalendariosAsistenteUsuario`, `reconciliarCalendariosAsistentes`) y contención de fallos (`intentarSincronizacionCalendarioAsistente`).
- `src/modules/asistencia/infrastructure/`: Adaptador Google `GoogleAssistantCalendarProvider` consumiendo `src/integrations/google` con resolución de conflictos 409 (PATCH) y 404/410; adaptador Prisma `PrismaAssistantCalendarRepository` con descifrado seguro de credenciales.
- `src/modules/asistencia/api.ts` y `src/bootstrap/asistencia.server.ts`: Raíz de composición con `server-only`.
- Fachadas en `src/modules/asistencia/calendario-asistente*`: Reexportan y delegan transparentemente sin romper consumidores.

**Tech Stack:** Node.js 24, TypeScript, Prisma 6, Vitest, Google Workspace Calendar API (`src/integrations/google`).

**Spec Reference:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md` (Secciones 4, 8, 9, 10, 14, 15) y `docs/superpowers/plans/2026-09-19-capas-y-encapsulamiento-plan-rector.md` (Etapa 5).

---

## Invariantes y Restricciones

1. **Pureza de Dominio:** `src/modules/asistencia/domain/` contendrá únicamente tipos `readonly` y funciones sincrónicas puras. Cero imports de Prisma, Next.js, React, `google-auth-library` o APIs externas. `createHash` de `node:crypto` es permitido por ser una función matemática pura sin reloj ni estado.
2. **Idempotencia y Tolerancia a Fallos en Calendario:**
   - La sincronización de Google Calendar en el login y en las operaciones de asistencia debe aislarse de errores con contención para que nunca interrumpa el flujo principal (`intentarSincronizacionCalendarioAsistente`).
   - Reintento de publicación: si Google Calendar responde 409 (conflicto / ya existe), se debe aplicar `PATCH` (`sendUpdates=none`).
   - Eliminación: si Google Calendar responde 404 o 410, se debe considerar un éxito idempotente sin lanzar error.
3. **Desacoplamiento de Clientes Técnicos Google:**
   - El adaptador `google-assistant-calendar-provider.adapter.ts` debe usar `src/integrations/google` (`crearGoogleCalendarAuthClient`, `crearEventoCalendarHttp`, `actualizarEventoCalendarHttp`, `eliminarEventoCalendarHttp`), eliminando imports directos de `google-auth-library`.
4. **Fachadas Temporales Retrocompatibles:**
   - `calendario-asistente.domain.ts` reexporta del nuevo dominio.
   - `calendario-asistente-google.adapter.ts` mantiene `publicarEventoCalendarioAsistente`, `eliminarEventoCalendarioAsistente`, `EventoCalendarioAsistente`.
   - `calendario-asistente.service.ts` mantiene `sincronizarCalendarioAsistenteInstancia`, `sincronizarCalendariosAsistenteSolicitud`, `sincronizarCalendariosAsistenteUsuario`, `reconciliarCalendariosAsistentes`, `hayErroresSincronizacionCalendarioAsistente`.
   - `calendario-asistente-safe.service.ts` mantiene `intentarSincronizacionCalendarioAsistente`.
5. **Verificación Integral Obligatoria:**
   - `test/architecture-boundaries.test.ts`
   - `test/functional-architecture.test.ts`
   - `npm run check`
   - `npm test`
   - `npm run validate:schema`
   - `npm run build`

---

## Tareas

### Tarea 1: Capa de Dominio (`src/modules/asistencia/domain/`)

- Crear `src/modules/asistencia/domain/calendario-asistente.types.ts`:
  - Tipos `CuentaCalendarioAsistente`, `AsignacionCalendarioAsistente`, `SnapshotCalendarioAsistente`, `PlanCalendarioAsistente`, `ResultadoSincronizacionCalendarioAsistente`, `IntentoSincronizacionCalendarioAsistente`.
- Crear `src/modules/asistencia/domain/calendario-asistente.domain.ts`:
  - `idEventoCalendarioAsistente(instanciaId, cuentaGoogleId)`
  - `cuentasCalendarioDeseadas(snapshot)`
  - `planificarSincronizacionCalendarioAsistente(snapshot)`
  - `hayErroresSincronizacionCalendarioAsistente(results)`
- Crear `src/modules/asistencia/domain/index.ts`.
- Mover tests a `test/calendario-asistente-domain.test.ts` actualizando imports para verificar tanto el nuevo dominio como la fachada.
- Verificar con Vitest y `npm run check`.

### Tarea 2: Capa de Puertos (`src/modules/asistencia/ports/`)

- Crear `src/modules/asistencia/ports/assistant-calendar-provider.port.ts`:
  - Tipo `EventoCalendarioAsistente`.
  - Interfaz `AssistantCalendarProvider` con `publicarEvento(credentials, event)` y `eliminarEvento(credentials, eventId)`.
- Crear `src/modules/asistencia/ports/assistant-calendar-repository.port.ts`:
  - Tipo `InstanciaParaCalendario`.
  - Interfaz `AssistantCalendarRepositoryPort` con:
    - `obtenerInstanciaParaCalendario(instanciaSalaId)`
    - `obtenerInstanciasDeSolicitud(solicitudSalaId)`
    - `obtenerInstanciasDeAsistente(usuarioId)`
    - `obtenerInstanciasFuturasParaReconciliar(now)`
    - `obtenerCredencialesGoogleWorkspace()`
- Crear `src/modules/asistencia/ports/index.ts`.
- Verificar con `npm run check`.

### Tarea 3: Capa de Aplicación (`src/modules/asistencia/application/`)

- Crear `src/modules/asistencia/application/sincronizar-calendario-instancia.use-case.ts`:
  - Caso de uso `sincronizarCalendarioAsistenteInstanciaUseCase(repository, provider, instanciaSalaId)`.
- Crear `src/modules/asistencia/application/sincronizar-calendario-solicitud.use-case.ts`:
  - Caso de uso `sincronizarCalendariosAsistenteSolicitudUseCase(repository, provider, solicitudSalaId)`.
- Crear `src/modules/asistencia/application/sincronizar-calendario-usuario.use-case.ts`:
  - Caso de uso `sincronizarCalendariosAsistenteUsuarioUseCase(repository, provider, usuarioId)`.
- Crear `src/modules/asistencia/application/reconciliar-calendarios.use-case.ts`:
  - Caso de uso `reconciliarCalendariosAsistentesUseCase(repository, provider, now)`.
- Crear `src/modules/asistencia/application/safe-calendar-sync.use-case.ts`:
  - Caso de uso `intentarSincronizacionCalendarioAsistenteUseCase(operation)`.
- Crear `src/modules/asistencia/application/index.ts`.
- Crear `test/calendario-asistente-application.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 4: Capa de Infraestructura (`src/modules/asistencia/infrastructure/`)

- Crear `src/modules/asistencia/infrastructure/google/google-assistant-calendar-provider.adapter.ts`:
  - Implementa `AssistantCalendarProvider` delegando en `src/integrations/google` (`crearGoogleCalendarAuthClient`, `crearEventoCalendarHttp`, `actualizarEventoCalendarHttp`, `eliminarEventoCalendarHttp`).
  - Manejo de 409 con PATCH y 404/410 como no-op en eliminación.
- Crear `src/modules/asistencia/infrastructure/prisma/prisma-assistant-calendar-repository.adapter.ts`:
  - Implementa `AssistantCalendarRepositoryPort` consultando `db.instanciaSala`, `db.configuracionGoogleWorkspace` y descifrando la clave privada.
- Crear `src/modules/asistencia/infrastructure/index.ts`.
- Crear `test/calendario-asistente-infrastructure.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 5: API Pública, Raíz de Composición Servidor y Fachadas

- Crear `src/modules/asistencia/api.ts`:
  - Exporta `crearServicioCalendarioAsistente(repository, provider)` y los tipos públicos de asistencia/calendario.
- Crear `src/bootstrap/asistencia.server.ts`:
  - Inyecta `db`, `descifrarConfiguracion`, `crearGoogleAssistantCalendarProvider` y `crearPrismaAssistantCalendarRepository`.
  - Expone `obtenerServicioCalendarioAsistente()`.
- Crear `test/calendario-asistente-bootstrap.test.ts`.
- Actualizar fachadas en `src/modules/asistencia/`:
  - `calendario-asistente.domain.ts`
  - `calendario-asistente-google.adapter.ts`
  - `calendario-asistente.service.ts`
  - `calendario-asistente-safe.service.ts`
- Verificar compatibilidad de `src/bootstrap/identity.server.ts` y tests existentes (`test/calendario-asistente-service.test.ts`, `test/identity-bootstrap.test.ts`).

### Tarea 6: Fronteras Arquitectónicas y Verificación Integral

- Auditar que `src/modules/asistencia/` cumpla las reglas de capas en `test/architecture-boundaries.test.ts` y que `test/functional-architecture.test.ts` certifique pureza en `domain/`.
- Ejecutar:
  - `npm run check`
  - `npm test`
  - `npm run validate:schema`
  - `npm run build`
- Documentar en `walkthrough.md`, actualizar `task_tracking.md` y hacer commit atómico de la Etapa 5.

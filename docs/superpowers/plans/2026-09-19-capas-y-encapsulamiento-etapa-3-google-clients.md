# Etapa 3: Extracción de Clientes Técnicos Google (Auth, Calendar, Meet)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.
> Baseline: `npm test` passing (101 files, 725 tests), `npm run check` clean, `npm run build` clean.

**Goal:** Extraer los clientes técnicos de transporte y autenticación de Google Workspace a `src/integrations/google/` (`auth/`, `calendar/`, `meet/`) sin alterar la interfaz `MeetProvider` ni la lógica de cohosts, aislando llamadas HTTP, scopes y paginación fuera de los dominios y módulos.

**Architecture:** Monolito modular con aislamiento de clientes de terceros en `src/integrations/google/`. Los clientes técnicos operan como clientes HTTP puros de Google API, sin conocimiento de conceptos de FLACSO (docentes, asistentes, programas, reuniones). `src/modules/meet/google-calendar.adapter.ts` se refactoriza para consumir estos clientes preservando al 100% su contrato observable y su lógica de reconciliación y fallback legacy.

**Tech Stack:** Node.js 24, TypeScript, `google-auth-library` (JWT), Vitest.

**Spec Reference:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md` (Secciones 9, 14, 15, 17) y `docs/superpowers/plans/2026-09-19-capas-y-encapsulamiento-plan-rector.md` (Etapa 3).

---

## Restricciones e Invariantes

1. **Sin conceptos de negocio en `src/integrations/google/`:** Los clientes no deben importar `src/modules/`, `@prisma/client`, `next` ni `react`.
2. **Preservar `MeetProvider`:** El contrato de `src/modules/meet/provider.ts` y las firmas de `google-calendar.adapter.ts` (`crearGoogleCalendarProvider`, `configurarGoogleMeetExistente`, `sincronizarCohostsGoogleExistente`, `compartirConferenciaGoogleCalendar`, `GoogleCalendarCredentials`) deben permanecer inalteradas.
3. **Preservar compatibilidad de mocks en tests:** `test/google-workspace-legacy-meet.test.ts` y `test/meet-cohosts-regression.test.ts` mockean `google-auth-library` (`JWT.prototype.request`). Los clientes técnicos deben utilizar `JWT` de `google-auth-library` y delegar a `auth.request(...)` para garantizar compatibilidad total sin alterar los tests existentes.
4. **Preservar manejo de errores y fallback:**
   - Detección de errores 409 / `ALREADY_EXISTS`.
   - Detección de errores 404.
   - Detección de 403 / "Permission denied on resource Member".
   - Fallback a credenciales Legacy en reuniones existentes ante fallo de permisos en Members.
5. **Verificaciones obligatorias al finalizar cada tarea:** `npm run check` y tests correspondientes.

---

## Tareas

### Tarea 1: Cliente Técnico de Autenticación Google (`src/integrations/google/auth/`)

- Crear `src/integrations/google/auth/google-auth.client.ts`:
  - Tipos `GoogleAuthCredentials`: `{ serviceAccountEmail: string; privateKey: string; subject?: string }`.
  - Scopes estándar: `GOOGLE_CALENDAR_SCOPES`, `GOOGLE_MEET_SCOPES`.
  - Factorías: `crearGoogleAuthJwt`, `crearGoogleCalendarAuth`, `crearGoogleMeetAuth`.
  - Constante de timeout: `GOOGLE_HTTP_TIMEOUT_MS = 60_000`.
- Crear `src/integrations/google/auth/index.ts`.
- Crear test unitario en `test/integrations-google-auth.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 2: Cliente Técnico de Google Calendar API (`src/integrations/google/calendar/`)

- Crear `src/integrations/google/calendar/calendar-events.client.ts`:
  - Tipos `GoogleCalendarAttendee`, `GoogleCalendarEvent`.
  - Operaciones:
    - `obtenerEventoCalendar(auth, calendarId, eventId, options)`
    - `obtenerEventoCalendarSiExiste(auth, calendarId, eventId, options)`
    - `crearEventoCalendarHttp(auth, calendarId, eventData, options)`
    - `actualizarEventoCalendarHttp(auth, calendarId, eventId, patchData, options)`
    - `eliminarEventoCalendarHttp(auth, calendarId, eventId, options)`
  - Utilidades de error: `isAlreadyCalendarEventError`, `isCalendarNotFoundError`.
- Crear `src/integrations/google/calendar/index.ts`.
- Crear test unitario en `test/integrations-google-calendar.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 3: Cliente Técnico de Google Meet API (`src/integrations/google/meet/`)

- Crear `src/integrations/google/meet/meet-spaces.client.ts`:
  - Tipos `GoogleMeetSpace`, `GoogleMeetSpaceConfig`, `GoogleMeetSpaceMember`.
  - Operaciones de Espacios (Meet API v2):
    - `obtenerEspacioMeet(auth, spaceNameOrCode)`
    - `crearEspacioMeetHttp(auth, config)`
    - `actualizarEspacioMeetHttp(auth, spaceName, config, updateMask)`
  - Operaciones de Miembros (Meet API v2):
    - `listarMiembrosMeetHttp(auth, spaceName)` (con paginación `nextPageToken`)
    - `crearMiembroMeetHttp(auth, spaceName, email, role)`
    - `eliminarMiembroMeetHttp(auth, memberName)`
  - Analizadores de error: `isAlreadyCohostError`, `isMeetNotFoundError`, `isMemberPermissionError`.
- Crear `src/integrations/google/meet/index.ts`.
- Crear `src/integrations/google/index.ts` reexportando los subclientes.
- Crear test unitario en `test/integrations-google-meet.test.ts`.
- Verificar con Vitest y `npm run check`.

### Tarea 4: Refactorización de `src/modules/meet/google-calendar.adapter.ts`

- Migrar `google-calendar.adapter.ts` para consumir los clientes técnicos de `src/integrations/google/`.
- Mantener intactas las firmas públicas y tipos exportados.
- Preservar la lógica de negocio de cohosts: normalización de correos, exclusión de la cuenta de sala, verificación real contra membresías, y el fallback Legacy.
- Ejecutar tests de regresión: `test/google-workspace-legacy-meet.test.ts`, `test/meet-cohosts-regression.test.ts`, `test/resincronizar-cohosts-route.test.ts`.

### Tarea 5: Fronteras Arquitectónicas y Verificación Integral

- Actualizar `test/architecture-boundaries.test.ts` para auditar `src/integrations/google/` verificando que no importe módulos de negocio (`src/modules/`), Prisma ni frameworks de presentación.
- Ejecutar:
  - `npx vitest run test/architecture-boundaries.test.ts`
  - `npm run check`
  - `npm test`
  - `npm run validate:schema`
  - `npm run build`
- Documentar resultados en `walkthrough.md` y registrar commit de la etapa.

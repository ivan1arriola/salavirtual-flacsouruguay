# Zoom Reuniones con Horario Fijo (Eliminación de Type 3 y Adopción de Type 8 / Type 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar completamente la creación de reuniones Zoom sin horario fijo (`type: 3`), agendando series con un único enlace compartido mediante reuniones recurrentes con horario fijo (`type: 8`) y encuentros únicos como reuniones programadas puntuales (`type: 2`), garantizando que toda reunión en Zoom tenga fechas y horarios en el calendario y soportando reconciliación de feriados y reprogramación por ocurrencia.

**Architecture:** Para solicitudes de un solo encuentro (`instancias.length === 1`), no se crea `ReunionProveedor` compartida y se aprovisiona una reunión puntual (`type: 2`) con su `start_time` y `duration`. Para series (`instancias.length > 1`), se crea una `ReunionProveedor` y el aprovisionamiento genera en Zoom una reunión recurrente con horario fijo (`type: 8`) con `start_time`, `duration`, `timezone` y `recurrence` (semanal, `weekly_days` y `end_times`). Las ocurrencias generadas por Zoom se reconcilian con las instancias de la base de datos: las ocurrencias sobrantes (feriados) se eliminan vía `DELETE /meetings/{id}?occurrence_id=...` y cada encuentro conserva el mismo `meetingId` y `join_url`.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, Zoom API v2 (Server-to-Server OAuth), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-07-zoom-reuniones-con-horario-fijo-design.md`  
**Revisión Adversaria:** `docs/revisiones/2026-11-07-informe-adversario-claude.md`

## Global Constraints

- Prohibido crear reuniones Zoom con `type: 3` (reunión recurrente sin horario fijo). Toda reunión en Zoom debe tener fecha y horario.
- Prohibido que los encuentros de una misma serie tengan enlaces (`join_url`) o IDs de Zoom diferentes: deben compartir el mismo `meetingId` y `join_url`.
- Solicitudes de encuentro único (`instancias.length === 1`) se aprovisionan como reunión programada puntual (`type: 2`) en Zoom.
- Series (`instancias.length > 1`) se aprovisionan como reunión recurrente con horario fijo (`type: 8`) en Zoom con objeto `recurrence`.
- Límite estricto de Zoom API: máximo 50 ocurrencias por serie recurrente. Series con más de 50 encuentros se rechazan con validación previa.
- Días de la semana en Zoom API: `1` = Domingo, `2` = Lunes, `3` = Martes, `4` = Miércoles, `5` = Jueves, `6` = Viernes, `7` = Sábado. Fórmula de conversión desde JavaScript (`Date.getDay()` donde 0 es Domingo): `dayOfWeek + 1`.
- Zona horaria predeterminada: `America/Montevideo` (UTC-3).
- El `start_url` no se persiste en base de datos.
- Respetar los límites arquitectónicos del repositorio (`test/architecture-boundaries.test.ts` y `test/functional-architecture.test.ts`).
- Antes de cada commit: `npm run check` y los tests enfocados correspondientes.

## Review Focus

1. **Encuentros únicos:** Una solicitud con 1 sola fecha no crea `ReunionProveedor` y llama a `crearReunionZoomHttp` (`type: 2`) con `start_time` y `duration`.
2. **Series recurrentes:** Una serie de N encuentros genera `POST` a Zoom con `type: 8`, `start_time` del primer encuentro, `duration`, `timezone`, y `recurrence: { type: 2, repeat_interval: 1, weekly_days: "...", end_times: N }`.
3. **Mapeo de días de semana:** Días calculados en zona horaria local `America/Montevideo` (ej. martes y jueves envían `weekly_days: "3,5"`).
4. **Feriados / fechas salteadas:** Ocurrencias generadas por Zoom en fechas que no existen en Sala Virtual se eliminan de Zoom vía `DELETE /meetings/{id}?occurrence_id={occId}`.
5. **Límite de ocurrencias:** Validar que una serie con más de 50 encuentros sea rechazada antes de llamar a Zoom.
6. **Reprogramación y cancelación por ocurrencia:** Operaciones individuales sobre un encuentro de la serie llaman a `PATCH /meetings/{id}?occurrence_id=...` o `DELETE ...?occurrence_id=...`.

---

### Task 1: Cliente Zoom para reuniones recurrentes con horario fijo (`type: 8`) y gestión de ocurrencias

**Files:**
- Modify: `src/integrations/zoom/zoom-client.ts`
- Test: `test/integrations-zoom-recurrente.test.ts`
- Test: `test/integrations-zoom-client.test.ts`

**Interfaces:**
- Produces:
  - `type ZoomOccurrenceResult = Readonly<{ occurrenceId: string; startTime: string; duration: number; status?: string }>`
  - `type ZoomMeetingWithOccurrencesResult = ZoomMeetingResult & Readonly<{ occurrences?: readonly ZoomOccurrenceResult[] }>`
  - `type ZoomRecurrenceInput = Readonly<{ type: 1 | 2 | 3; repeatInterval: number; weeklyDays?: string; endTimes?: number; endDateTime?: string }>`
  - `type ZoomCreateRecurringMeetingInput = Readonly<{ topic: string; startTime: Date; durationMinutes: number; timezone: string; agenda?: string | null; requiereGrabacion?: boolean; recurrence: ZoomRecurrenceInput }>`
  - `crearReunionZoomRecurrenteHttp(token: string, userEmail: string, input: ZoomCreateRecurringMeetingInput): Promise<ZoomMeetingWithOccurrencesResult>`
  - `eliminarOcurrenciaZoomHttp(token: string, meetingId: string, occurrenceId: string): Promise<void>`
  - `actualizarOcurrenciaZoomHttp(token: string, meetingId: string, occurrenceId: string, input: Readonly<{ startTime?: Date; durationMinutes?: number }>): Promise<void>`

- [ ] **Step 1: Write failing tests in `test/integrations-zoom-recurrente.test.ts`**
  - Probar que `crearReunionZoomRecurrenteHttp` envía `type: 8` (no `type: 3`).
  - Probar que incluye `start_time`, `duration`, `timezone`, y `recurrence`.
  - Probar que parsea y devuelve el array de `occurrences` devuelto por Zoom.
  - Probar `eliminarOcurrenciaZoomHttp` enviando `DELETE /meetings/{id}?occurrence_id={occId}`.
  - Probar `actualizarOcurrenciaZoomHttp` enviando `PATCH /meetings/{id}?occurrence_id={occId}`.

- [ ] **Step 2: Run test to verify it fails**
  - Comando: `npx vitest run test/integrations-zoom-recurrente.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement in `src/integrations/zoom/zoom-client.ts`**
  - Actualizar `crearReunionZoomRecurrenteHttp` para enviar `type: 8` con `recurrence`, `start_time`, `duration`, `timezone`.
  - Implementar `eliminarOcurrenciaZoomHttp` y `actualizarOcurrenciaZoomHttp`.

- [ ] **Step 4: Run test to verify it passes**
  - Comando: `npx vitest run test/integrations-zoom-recurrente.test.ts test/integrations-zoom-client.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(zoom): cliente Zoom para type 8 y operaciones de ocurrencias"`

---

### Task 2: Dominio puro de cálculo de recurrencia Zoom y reconciliación de ocurrencias

**Files:**
- Create: `src/modules/conferencias/domain/zoom-recurrence.domain.ts`
- Test: `test/zoom-recurrence-domain.test.ts`

**Interfaces:**
- Produces:
  - `MAX_ZOOM_OCCURRENCES = 50`
  - `calcularRecurrenciaZoom(instancias: readonly Readonly<{ inicio: Date; fin: Date }>[], timezone: string): Readonly<{ startTime: Date; durationMinutes: number; recurrence: ZoomRecurrenceInput }>`
  - `detectarOcurrenciasSobrantes(ocurrenciasZoom: readonly Readonly<{ occurrenceId: string; startTime: string }>[], instanciasRequeridas: readonly Readonly<{ inicio: Date }>[], timezone: string): readonly string[]` (devuelve los `occurrenceId` que Zoom generó y que no coinciden con ninguna fecha de la serie, ej. feriados).

- [ ] **Step 1: Write failing tests in `test/zoom-recurrence-domain.test.ts`**
  - Probar cálculo de `weekly_days` en Montevideo (ej. martes=3, jueves=5).
  - Probar error si `instancias.length > 50` o si la lista está vacía.
  - Probar `detectarOcurrenciasSobrantes` identificando la ocurrencia del feriado que Zoom generó pero no estaba en `instanciasRequeridas`.

- [ ] **Step 2: Run test to verify it fails**
  - Comando: `npx vitest run test/zoom-recurrence-domain.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement in `src/modules/conferencias/domain/zoom-recurrence.domain.ts`**
  - Implementar funciones puras inmutables.
  - Comparar fechas locales con tolerancia (mismo día y hora en la zona horaria).

- [ ] **Step 4: Run test to verify it passes**
  - Comando: `npx vitest run test/zoom-recurrence-domain.test.ts test/functional-architecture.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(conferencias): cálculo de regla type 8 y detección de ocurrencias sobrantes"`

---

### Task 3: Soporte de horarios de serie y ocurrencias en el repositorio de conferencias

**Files:**
- Modify: `src/modules/conferencias/ports/conferencias-repository.port.ts`
- Modify: `src/modules/conferencias/infrastructure/prisma/prisma-conferencias-repository.adapter.ts`
- Test: `test/conferencias-reunion-compartida-adapter.test.ts`

**Interfaces:**
- Produces:
  - `ReclamoReunionCompartida` incluye `instanciasHorarios: readonly Readonly<{ id: string; inicio: Date; fin: Date }>[];`
  - Método `guardarOcurrenciaZoomEvento(eventoId: string, occurrenceId: string): Promise<void>` (guarda en `payloadUltimo.zoom.occurrenceId` de `EventoProveedor`).

- [ ] **Step 1: Write failing test in `test/conferencias-reunion-compartida-adapter.test.ts`**
  - Probar que `reclamarCreacionReunionCompartida` retorna `instanciasHorarios` ordenadas por fecha.

- [ ] **Step 2: Run test to verify it fails**
  - Comando: `npx vitest run test/conferencias-reunion-compartida-adapter.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement in `prisma-conferencias-repository.adapter.ts`**
  - Consultar las instancias no canceladas de la serie y retornarlas en `reclamarCreacionReunionCompartida`.
  - Implementar guardado de `occurrenceId`.

- [ ] **Step 4: Run test to verify it passes**
  - Comando: `npx vitest run test/conferencias-reunion-compartida-adapter.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(conferencias): soporte de horarios de serie y occurrenceId en repositorio"`

---

### Task 4: Creación condicional en servicio y aprovisionamiento con `type: 8` y `type: 2`

**Files:**
- Modify: `src/modules/reuniones/crear-reuniones.service.ts`
- Modify: `src/modules/conferencias/application/provisionar-conferencias.use-case.ts`
- Test: `test/crear-reuniones-service.test.ts`
- Test: `test/conferencias-reunion-compartida.test.ts`

**Interfaces:**
- Comportamiento:
  1. Si `input.instancias.length === 1`: no se crea `ReunionProveedor`. El evento nace con `reunionProveedorId: null` y se aprovisiona como `type: 2` (reunión puntual con fecha y duración).
  2. Si `input.instancias.length > 1`: se crea `ReunionProveedor`. Se aprovisiona con `type: 8` pasando `recurrence`.
  3. Tras crear la reunión `type: 8`, se eliminan en Zoom las ocurrencias sobrantes (feriados) detectadas por `detectarOcurrenciasSobrantes`.
  4. Si `input.instancias.length > 50`, `crearReuniones` lanza `ValidationApiError`.

- [ ] **Step 1: Write failing tests in `test/crear-reuniones-service.test.ts` y `test/conferencias-reunion-compartida.test.ts`**
  - Probar que 1 instancia no crea `ReunionProveedor` y se aprovisiona como `type: 2`.
  - Probar que > 1 instancias crea `ReunionProveedor` y se aprovisiona como `type: 8` con `recurrence`.
  - Probar que más de 50 instancias es rechazado con error de validación.
  - Probar que ocurrencias de feriados son eliminadas de Zoom con `eliminarOcurrenciaZoomHttp`.

- [ ] **Step 2: Run tests to verify they fail**
  - Comando: `npx vitest run test/crear-reuniones-service.test.ts test/conferencias-reunion-compartida.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement in `crear-reuniones.service.ts` y `provisionar-conferencias.use-case.ts`**
  - En `crear-reuniones.service.ts`: validar `input.instancias.length <= 50`, crear `ReunionProveedor` solo si `length > 1`.
  - En `provisionar-conferencias.use-case.ts`: calcular recurrencia, llamar a `crearReunionZoomRecurrenteHttp` (`type: 8`), reconciliar y eliminar sobrantes.

- [ ] **Step 4: Run tests to verify they pass**
  - Comando: `npx vitest run test/crear-reuniones-service.test.ts test/conferencias-reunion-compartida.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(conferencias): aprovisionar Zoom type 8 para series y type 2 para encuentros únicos"`

---

### Task 5: Soporte de reprogramación y cancelación de ocurrencias en gestión de encuentros

**Files:**
- Modify: `src/modules/conferencias/application/provisionar-conferencias.use-case.ts`
- Modify: `src/modules/reuniones/gestionar-encuentros.service.ts`
- Test: `test/gestionar-encuentros-reunion-compartida.test.ts`
- Test: `test/cancelar-solicitudes-zoom.test.ts`

**Interfaces:**
- Comportamiento:
  - Al reprogramar la fecha/hora de un encuentro de una serie Zoom (`EDITAR_FECHA`), si el evento tiene reunión compartida, se marca operación pendiente `REPROGRAMAR` para actualizar la ocurrencia en Zoom con `actualizarOcurrenciaZoomHttp`.
  - Al cancelar un encuentro puntual de la serie, se elimina su ocurrencia en Zoom con `eliminarOcurrenciaZoomHttp` (siempre que queden otros encuentros activos en la serie; si es el último activo, se elimina la reunión completa).

- [ ] **Step 1: Write failing tests in `test/gestionar-encuentros-reunion-compartida.test.ts`**
  - Probar que reprogramar fecha deja operación `REPROGRAMAR` y el worker llama a actualizar ocurrencia en Zoom.
  - Probar que cancelar un encuentro de la serie elimina la ocurrencia en Zoom.

- [ ] **Step 2: Run tests to verify they fail**
  - Comando: `npx vitest run test/gestionar-encuentros-reunion-compartida.test.ts`
  - Expected: FAIL.

- [ ] **Step 3: Implement in `gestionar-encuentros.service.ts` y `provisionar-conferencias.use-case.ts`**
  - En `gestionar-encuentros.service.ts`: permitir operación `REPROGRAMAR` en eventos Zoom compartidos.
  - En `provisionar-conferencias.use-case.ts`: en `REPROGRAMAR`, si es compartido, actualizar la ocurrencia con el nuevo horario.

- [ ] **Step 4: Run tests to verify they pass**
  - Comando: `npx vitest run test/gestionar-encuentros-reunion-compartida.test.ts test/cancelar-solicitudes-zoom.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit**
  - `git commit -m "feat(reuniones): reprogramar y cancelar ocurrencias Zoom en series compartidas"`

---

### Task 6: Verificación de unificación de series y suite completa

**Files:**
- Modify: `src/modules/reuniones/corregir-serie-enlaces.service.ts`
- Test: `test/corregir-serie-enlaces.test.ts`
- Test: toda la suite (`npm test`, `npm run check`)

- [ ] **Step 1: Adaptar `corregir-serie-enlaces.service.ts` para crear `type: 8`**
  - Al corregir series, pasar los datos de recurrencia de los encuentros futuros.
  - Verificar con `npx vitest run test/corregir-serie-enlaces.test.ts`.

- [ ] **Step 2: Run type checking**
  - Comando: `npm run check`
  - Expected: PASS sin errores de TypeScript.

- [ ] **Step 3: Run entire test suite**
  - Comando: `npm test`
  - Expected: Todos los tests pasan.

- [ ] **Step 4: Commit**
  - `git commit -m "chore: suite verificada para creación Zoom con horario fijo (type 8/2)"`

# Un solo enlace de Zoom por serie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos los encuentros de una serie en Zoom comparten una sola reunión recurrente (mismo `join_url`, misma cuenta anfitriona), tanto al crear series nuevas como al migrarlas desde Meet.

**Architecture:** Nueva entidad `ReunionProveedor` para la reunión externa compartida; `EventoProveedor` la referencia y conserva una copia de `externalEventId`/`joinUrl` para no cambiar las lecturas. El worker aprovisiona la reunión una vez y la elimina solo cuando no queda ningún encuentro activo que la use. La migración pasa a ser por serie completa.

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar rutas o páginas), TypeScript, Prisma/PostgreSQL, Zoom Server-to-Server OAuth, Google Calendar API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md`

## Global Constraints

- Una reunión Zoom compartida es **recurrente sin horario fijo** (`type: 3`); reprogramar un encuentro no llama a Zoom salvo cambio de título.
- Una sola cuenta anfitriona por serie; capacidad 1 por cuenta; se valida la disponibilidad de **todos** los horarios de la serie.
- La reunión Zoom se elimina **una sola vez**, y solo cuando no queda ningún encuentro no cancelado que la use.
- La migración por serie cambia `proveedorActivoTipo` de todos los encuentros en **una sola transacción**, y solo después de verificar todas las citas de Calendar. Un fallo previo deja la serie en Meet y es reintentable sin crear una segunda reunión.
- Datos antiguos (`reunionProveedorId` nulo) y Meet siguen funcionando exactamente como hoy.
- El `start_url` no se persiste ni se envía al navegador (se pide fresco a Zoom).
- Respetar `test/architecture-boundaries.test.ts` y `test/functional-architecture.test.ts` (los archivos `*.domain.ts` no usan `let`, `var`, `.push/.sort/.set`, clases ni importan `@prisma/client`).
- Antes de cada commit: `npm run check` y los tests enfocados.

## Review Focus

- Cancelar un encuentro de una serie con otros encuentros activos no elimina la reunión compartida; cancelar el último sí, una sola vez, aunque la operación se reintente.
- Dos encuentros de la misma serie aprovisionados a la vez no crean dos reuniones Zoom (carrera en el primer `PROVISIONAR`).
- Migrar una serie de varios encuentros cuando falla el parche de Calendar del tercero: ningún encuentro cambia de proveedor, y el reintento no duplica la reunión.
- Agregar un encuentro a una serie cuya cuenta anfitriona está ocupada en ese horario: error claro, sin elegir otra sala.
- Una serie con una excepción `Conservar en Google Meet` en uno solo de sus encuentros no se migra.
- Series de Meet y series antiguas de Zoom (sin reunión compartida) siguen leyéndose y cancelándose como hoy.

---

### Task 1: Esquema de la reunión compartida

**Files:**
- Modify: `prisma/schema.prisma` (modelo `EventoProveedor`, nuevo `ReunionProveedor`, relaciones en `ProveedorReunion` y `CuentaProveedor`)
- Create: `prisma/migrations/<timestamp>_reunion_proveedor_compartida/migration.sql`
- Test: `test/schema-contract.test.ts`

**Interfaces:**
- Produces: modelo `ReunionProveedor { id; proveedorId; cuentaProveedorId?; serieClave String; externalId String?; joinUrl String?; estadoIntegracion EstadoIntegracion @default(PENDIENTE); errorIntegracion String?; createdAt; updatedAt; @@unique([proveedorId, externalId]); @@unique([proveedorId, serieClave]); eventos EventoProveedor[] }`; campo `EventoProveedor.reunionProveedorId String?` con relación y `@@index([reunionProveedorId])`; se elimina `@@unique([proveedorId, externalEventId])` de `EventoProveedor` y se reemplaza por `@@index([proveedorId, externalEventId])`.

- [ ] **Step 1: Failing test** en `test/schema-contract.test.ts`: el esquema contiene el modelo `ReunionProveedor` con ambas unicidades, `reunionProveedorId` en `EventoProveedor`, y ya no contiene `@@unique([proveedorId, externalEventId])` en `EventoProveedor`; la migración crea la tabla, agrega la columna y reemplaza el índice único.
- [ ] **Step 2:** `npx vitest run test/schema-contract.test.ts` → FAIL.
- [ ] **Step 3:** Editar el esquema y escribir la migración SQL (sin backfill: los eventos existentes quedan con `reunionProveedorId` nulo).
- [ ] **Step 4:** `npx prisma generate` y el test → PASS. **Step 5: Commit** `feat: esquema de reunión compartida por serie`.

### Task 2: Cliente Zoom para reuniones recurrentes

**Files:**
- Modify: `src/integrations/zoom/zoom-client.ts`
- Test: `test/integrations-zoom-client.test.ts`

**Interfaces:**
- Produces: `crearReunionZoomRecurrenteHttp(token: string, userEmail: string, input: { topic: string; agenda?: string | null; requiereGrabacion?: boolean }): Promise<ZoomMeetingResult>` — `POST /users/{email}/meetings` con `type: 3` y `recurrence`/`settings` suficientes para una reunión sin horario fijo; devuelve `meetingId`, `joinUrl`, `startUrl?`.

- [ ] **Step 1: Failing tests** con `fetch` simulado: el cuerpo enviado lleva `type: 3`; no lleva `start_time`; respeta `requiereGrabacion` (`auto_recording: "cloud"`); un error HTTP lanza `Error` con el estado; una respuesta sin `join_url` lanza error.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar siguiendo el estilo de `crearReunionZoomHttp`. **Step 4:** PASS. **Step 5: Commit** `feat: cliente Zoom para reuniones recurrentes sin horario fijo`.

### Task 3: Dominio de uso de la reunión compartida

**Files:**
- Create: `src/modules/reuniones/reunion-compartida.domain.ts`
- Test: `test/reunion-compartida-domain.test.ts`

**Interfaces:**
- Produces:
  - `type UsoReunionCompartida = Readonly<{ eventoProveedorId: string; instanciaEstado: string }>`
  - `usosActivos(usos: readonly UsoReunionCompartida[], excluirEventoId?: string): number` — cuenta los usos cuyo `instanciaEstado` no es `CANCELADA`, sin contar el excluido.
  - `debeEliminarseReunionCompartida(usos: readonly UsoReunionCompartida[], eventoQueCancela: string): boolean` — verdadero solo si, descontado ese evento, no queda ningún uso activo.
  - `claveSerieReunion` ya existe en `serie-reunion.domain.ts` (reutilizar para `serieClave`).

- [ ] **Step 1: Failing tests:** con tres usos activos cancelar uno devuelve falso; con un solo uso activo devuelve verdadero; usos cancelados no cuentan; repetir la cancelación del último sigue devolviendo verdadero (idempotente); lista vacía devuelve verdadero.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar sin `let` ni mutación. **Step 4:** PASS + `npx vitest run test/functional-architecture.test.ts`. **Step 5: Commit** `feat: dominio de uso de reuniones compartidas`.

### Task 4: Aprovisionamiento con reunión compartida

**Files:**
- Modify: `src/modules/conferencias/ports/conferencias-repository.port.ts`, `src/modules/conferencias/infrastructure/prisma/prisma-conferencias-repository.adapter.ts`, `src/modules/conferencias/application/provisionar-conferencias.use-case.ts`
- Test: `test/conferencias-application.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces en `ConferenciasRepositoryPort`:
  - `reservarReunionCompartida(eventoProveedorId: string): Promise<Readonly<{ reunionId: string; externalId: string | null; joinUrl: string | null; creada: boolean }> | null>` — `null` si el evento no tiene `reunionProveedorId`; toma un bloqueo asesor (`pg_advisory_xact_lock` por la reunión) para que dos encuentros de la serie no la creen a la vez.
  - `guardarReunionCompartida(reunionId: string, datos: Readonly<{ externalId: string; joinUrl: string }>): Promise<void>` — guarda en la reunión y copia `externalEventId`/`joinUrl` a todos sus eventos pendientes.
  - `usosDeReunionCompartida(reunionId: string): Promise<readonly UsoReunionCompartida[]>`
  - `marcarReunionCompartidaEliminada(reunionId: string): Promise<void>`
- Comportamiento del caso de uso para eventos Zoom con reunión compartida: `PROVISIONAR` crea (Task 2) una sola vez y reutiliza si ya existe (GET); `REPROGRAMAR` y `CONFIGURAR_MEET` solo refrescan el enlace (GET), sin cambiar horarios; `CANCELAR` elimina en Zoom únicamente si `debeEliminarseReunionCompartida(...)` y, si ya se eliminó, no repite la llamada. Eventos sin reunión compartida mantienen el comportamiento actual.

- [ ] **Step 1: Failing tests** con repositorio y cliente simulados: (a) dos eventos de la misma reunión, `PROVISIONAR` secuencial, crean una sola reunión Zoom y ambos terminan con el mismo `joinUrl`; (b) `CANCELAR` con otros usos activos no llama a `eliminarReunionZoomHttp`; (c) `CANCELAR` del último uso la elimina una vez y un reintento no la vuelve a eliminar; (d) `REPROGRAMAR` de un evento compartido no llama a `actualizarReunionZoomHttp` con horarios; (e) un evento sin reunión compartida sigue creando su propia reunión.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar puerto, adaptador y caso de uso. **Step 4:** PASS + `npx vitest run test/conferencias-application.test.ts test/integrations-zoom-client.test.ts`. **Step 5: Commit** `feat: aprovisionamiento Zoom con reunión compartida por serie`.

### Task 5: Series nuevas con una sola reunión

**Files:**
- Modify: `src/modules/reuniones/crear-reuniones.service.ts`
- Test: `test/crear-reuniones-service.test.ts`

**Interfaces:**
- Consumes: Task 1 (modelo), Task 3 (`claveSerieReunion` para `serieClave`).
- Produces: al crear una solicitud Zoom, se crea **una** `ReunionProveedor` (`cuentaProveedorId = cuentaHostId`, `serieClave` derivado de `serieReunionId`) y cada `EventoProveedor` se crea con ese `reunionProveedorId`.

- [ ] **Step 1: Failing tests:** una serie de 3 encuentros crea una `ReunionProveedor` y 3 eventos con el mismo `reunionProveedorId` y la misma `cuentaProveedorId`; una reunión de un solo encuentro también crea la suya; la validación de disponibilidad de todos los horarios no cambia (reutilizar los tests existentes).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/crear-reuniones-service.test.ts`. **Step 5: Commit** `feat: series nuevas de Zoom con una sola reunión`.

### Task 6: Agregar, reprogramar y cancelar encuentros y series

**Files:**
- Modify: `src/modules/reuniones/gestionar-encuentros.service.ts`, `src/modules/reuniones/cancelar-solicitudes-atomicas.service.ts`
- Test: `test/gestionar-encuentros-service.test.ts`, `test/cancelar-solicitudes-zoom.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Comportamiento: `agregarEncuentro` en una serie Zoom con reunión compartida crea el `EventoProveedor` con ese `reunionProveedorId` y la misma cuenta; si la cuenta está ocupada en el horario nuevo lanza `ConflictApiError("La sala de la serie está ocupada en ese horario.")` y no elige otra. `actualizarEncuentro` (`EDITAR_FECHA`) sigue validando la cuenta de la serie pero marca `REPROGRAMAR` solo si el título cambió; en otro caso no deja operación pendiente en Zoom. `eliminarEncuentro`, `eliminarReunionCompleta` y `cancelarSolicitudesAtomicas` marcan `CANCELAR` en cada evento; la decisión de eliminar en Zoom la toma el worker (Task 4), por lo que no se deduplican IDs externos aquí.

- [ ] **Step 1: Failing tests:** (a) agregar a una serie con reunión compartida vincula el evento nuevo y misma cuenta; (b) agregar con cuenta ocupada lanza el conflicto y no crea nada; (c) reprogramar la fecha de un encuentro compartido no deja `REPROGRAMAR` en Zoom; (d) cancelar un encuentro marca `CANCELAR` solo en su evento; (e) los tests existentes de series sin reunión compartida siguen verdes.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/gestionar-encuentros-service.test.ts test/gestionar-encuentros-titular.test.ts test/cancelar-solicitudes-zoom.test.ts test/cancelar-solicitudes-atomicas.test.ts`. **Step 5: Commit** `feat: gestión de encuentros con reunión compartida`.

### Task 7: Migración Meet→Zoom por serie

**Files:**
- Modify: `src/modules/reuniones/migracion-zoom-preview.domain.ts`, `src/modules/reuniones/migracion-zoom.service.ts`, `src/modules/reuniones/migracion-zoom-aplicar.service.ts`, `src/modules/reuniones/migracion-zoom-avisos.service.ts`, `app/api/v1/reuniones/migracion-zoom/**` (rutas existentes), `src/components/migracion-zoom-aplicar-control.tsx`
- Test: `test/migracion-zoom-preview.test.ts`, `test/migracion-zoom-service.test.ts`, `test/migracion-zoom-aplicar.test.ts`, `test/migracion-zoom-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - Vista previa por serie: `planificarMigracionZoomPorSerie(input): readonly FilaSerieMigracionZoom[]` con `FilaSerieMigracionZoom = { serieClave: string; encuentroIds: readonly string[]; estado: EstadoVistaPreviaZoom; hostId: string | null }`. Un único host debe tener capacidad para **todos** los horarios (`elegirCuentaHostParaPeriodos` con todos los periodos de la serie). El estado `SERIE` (bloqueo provisorio) desaparece. Una serie con excepciones en solo algunos encuentros queda `REVISAR`.
  - `aplicarMigracionZoomSerie(deps, actor, input: { modo: "PILOTO" | "LOTE"; serieClaves: readonly string[] }): Promise<readonly ResultadoMigracionSerie[]>` — por serie: bloqueo, crear/reutilizar `ReunionProveedor` + eventos Zoom, sincronizar, verificar con GET, parchear y verificar **todas** las citas de Calendar, y recién entonces `updateMany` de `proveedorActivoTipo = "ZOOM"` de todos los encuentros en una transacción; auditoría `MIGRACION_ZOOM_SERIE_APLICADA`; avisos deduplicados por serie y destinatario. El piloto migra exactamente una serie.
  - La interfaz lista series (no encuentros) con sus encuentros, host propuesto y el estado.

- [ ] **Step 1: Failing tests:** (a) planificación: una serie de 3 encuentros con un host libre en todos los horarios es `MIGRABLE` con ese host; si el host solo está libre en 2 de los 3 horarios elige otro o queda `SIN_SALA`; (b) aplicar: éxito deja los 3 encuentros en Zoom con el mismo `joinUrl` y un solo `EventoProveedor` de reunión compartida; (c) el parche de Calendar del tercer encuentro falla → ningún encuentro cambia de proveedor, y reintentar no crea otra reunión Zoom; (d) serie con una excepción parcial → `REVISAR`; (e) avisos: un destinatario presente en los 3 encuentros recibe un solo aviso; (f) un encuentro individual no se puede migrar por separado.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/migracion-zoom-*.test.ts` y `npx vitest run test/functional-architecture.test.ts`. **Step 5: Commit** `feat: migración de Meet a Zoom por serie con un solo enlace`.

### Task 8: Inicio como anfitrión y verificación final

**Files:**
- Modify: `src/modules/reuniones/iniciar-reunion-zoom.service.ts`
- Test: `test/iniciar-reunion-zoom.test.ts`

**Interfaces:**
- `obtenerEnlaceInicioZoom` toma el ID externo de la reunión compartida cuando el evento tiene `reunionProveedorId`; si no, de `externalEventId` como hoy.

- [ ] **Step 1: Failing test:** con un evento con reunión compartida pide el `start_url` con el ID de la reunión compartida.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS.
- [ ] **Step 5:** `npm run check`, `npx vitest run` y `npm run build` limpios.
- [ ] **Step 6 (manual, requiere Zoom real):** crear una serie de 3 encuentros y comprobar que tienen el mismo enlace; cancelar uno y comprobar que el enlace sigue; cancelar el último y comprobar que la reunión desaparece de Zoom. Si no se ejecuta, dejarlo anotado: no declarar verificado.
- [ ] **Step 7: Commit** `feat: inicio como anfitrión con reunión compartida`.

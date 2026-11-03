# Un solo enlace de Zoom por serie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos los encuentros de una serie en Zoom comparten una sola reunión recurrente (mismo `join_url`, misma cuenta anfitriona), tanto al crear series nuevas como al migrarlas desde Meet.

**Architecture:** Nueva entidad `ReunionProveedor` para la reunión externa compartida; `EventoProveedor` la referencia y conserva una copia de `externalEventId`/`joinUrl` para no cambiar las lecturas. El worker aprovisiona la reunión una vez y la elimina solo cuando no queda ningún encuentro activo que la use. La migración pasa a ser por serie completa.

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar rutas o páginas), TypeScript, Prisma/PostgreSQL, Zoom Server-to-Server OAuth, Google Calendar API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md`

## Orden de ejecución

Task 1, **Task 9 (bandera)**, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7 y Task 8. La bandera `ZOOM_REUNION_COMPARTIDA` se implementa antes de las tareas que la respetan. La creación compartida (Tasks 4 y 5) y la migración por serie (Task 7) **solo actúan con la bandera encendida**; con ella apagada, la vista previa mantiene el bloqueo provisorio (`SERIE`) y todo funciona como hoy. Secuencia de activación: (1) desplegar con la bandera apagada; (2) encenderla; (3) probar la creación de una serie de 3 encuentros; (4) recién entonces migrar por serie y corregir las series existentes.

## Global Constraints

- Una reunión Zoom compartida es **recurrente sin horario fijo** (`type: 3`); reprogramar un encuentro no llama a Zoom salvo cambio de título.
- Una sola cuenta anfitriona por serie; capacidad 1 por cuenta; se valida la disponibilidad de **todos** los horarios de la serie.
- La reunión Zoom se elimina **una sola vez**, y solo cuando no queda ningún **encuentro activo** que la use. Activo = no cancelado, `PROGRAMADA` o `EN_CURSO`, con fin posterior a ahora; los encuentros pasados no cuentan.
- La creación de la reunión compartida se **reclama con estado persistido** (`PENDIENTE` → `CREANDO`, con token y hora), no con un bloqueo asesor: este se libera al cerrar la transacción y el POST a Zoom ocurre fuera. Un reclamo vencido (más de 5 minutos) se puede retomar tras buscar una reunión huérfana de la serie.
- La creación compartida está detrás de la bandera `ZOOM_REUNION_COMPARTIDA` (apagada por defecto). Se enciende solo después de desplegar y con ninguna versión anterior del worker en ejecución.
- Un encuentro sin cita de Google Calendar no bloquea migrar ni corregir una serie.
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
- Dos workers procesan a la vez el `PROVISIONAR` de la misma serie: una sola creación en Zoom (prueba con dos reclamos simultáneos).
- Cancelar el resto de la serie cuando quedan encuentros ya pasados: la reunión se elimina igual (los pasados no cuentan como uso).
- Un reclamo de creación que murió después del POST a Zoom y antes de guardar: el reintento reutiliza la reunión huérfana, no crea otra.
- Fallo del parche de Calendar en la 1.ª, 2.ª y 3.ª cita: ningún encuentro cambia de proveedor y el reintento retoma solo las citas pendientes.
- Una serie sin citas de Calendar (nacida en Zoom) se migra igual.
- Con la bandera `ZOOM_REUNION_COMPARTIDA` apagada, crear series se comporta exactamente como hoy.

---

### Task 1: Esquema de la reunión compartida

**Files:**
- Modify: `prisma/schema.prisma` (modelo `EventoProveedor`, nuevo `ReunionProveedor`, relaciones en `ProveedorReunion` y `CuentaProveedor`)
- Create: `prisma/migrations/<timestamp>_reunion_proveedor_compartida/migration.sql`
- Test: `test/schema-contract.test.ts`

**Interfaces:**
- Produces: modelo `ReunionProveedor { id; proveedorId; cuentaProveedorId?; serieClave String; externalId String?; joinUrl String?; estadoCreacion String @default("PENDIENTE") /* PENDIENTE | CREANDO | CREADA | ELIMINADA */; reclamoToken String?; reclamoAt DateTime?; estadoIntegracion EstadoIntegracion @default(PENDIENTE); errorIntegracion String?; createdAt; updatedAt; @@unique([proveedorId, externalId]); @@unique([proveedorId, serieClave]); eventos EventoProveedor[] }`; modelo `CambioEnlaceCita { id; instanciaSalaId; reunionProveedorId; enlaceNuevo String; estado String @default("PENDIENTE") /* PENDIENTE | PARCHEADA | VERIFICADA */; reunionAnteriorExternalId String?; eliminarDespuesDe DateTime?; reunionAnteriorEliminadaAt DateTime?; sinCita Boolean @default(false); @@unique([instanciaSalaId, reunionProveedorId]) }` (una fila por encuentro de la serie, tenga o no cita de Calendar; `sinCita` indica que no hay cita que parchear y la fila nace `VERIFICADA`; `reunionAnteriorEliminadaAt` evita repetir la eliminación); modelo `AvisoEnlaceSerie { id; serieClave String; email String; tipo String /* MIGRACION_SERIE | CORRECCION_ENLACE */; estado String; enviadoAt DateTime?; @@unique([serieClave, email, tipo]) }`; campo `EventoProveedor.reunionProveedorId String?` con relación y `@@index([reunionProveedorId])`; se elimina `@@unique([proveedorId, externalEventId])` de `EventoProveedor` y se reemplaza por `@@index([proveedorId, externalEventId])`.

- [ ] **Step 1: Failing test** en `test/schema-contract.test.ts`: el esquema contiene el modelo `ReunionProveedor` con ambas unicidades y los campos de estado de creación, los modelos `CambioEnlaceCita` y `AvisoEnlaceSerie` con sus unicidades, `reunionProveedorId` en `EventoProveedor`, y ya no contiene `@@unique([proveedorId, externalEventId])` en `EventoProveedor`; la migración crea la tabla, agrega la columna y reemplaza el índice único.
- [ ] **Step 2:** `npx vitest run test/schema-contract.test.ts` → FAIL.
- [ ] **Step 3:** Editar el esquema y escribir la migración SQL (sin backfill: los eventos existentes quedan con `reunionProveedorId` nulo).
- [ ] **Step 4:** `npx prisma generate` y el test → PASS. **Step 5: Commit** `feat: esquema de reunión compartida por serie`.

### Task 2: Cliente Zoom para reuniones recurrentes

**Files:**
- Modify: `src/integrations/zoom/zoom-client.ts`
- Test: `test/integrations-zoom-client.test.ts`

**Interfaces:**
- Produces:
  - `crearReunionZoomRecurrenteHttp(token: string, userEmail: string, input: { topic: string; agenda?: string | null; requiereGrabacion?: boolean }): Promise<ZoomMeetingResult>` — `POST /users/{email}/meetings` con `type: 3` (recurrente sin horario fijo) y los `settings` necesarios, **sin** `start_time` ni `recurrence` (verificar el cuerpo exacto contra la documentación de Zoom y una prueba real antes de fijarlo); devuelve `meetingId`, `joinUrl`, `startUrl?`. La `agenda` lleva la marca `[serie:<serieClave>]`.
  - `buscarReunionZoomPorMarcaHttp(token: string, userEmail: string, marca: string): Promise<ZoomMeetingResult | null>` — lista las reuniones del anfitrión y devuelve la que contenga la marca en su agenda, o `null`; recorre las páginas.

- [ ] **Step 1: Failing tests** con `fetch` simulado: el cuerpo enviado lleva `type: 3`; no lleva `start_time`; respeta `requiereGrabacion` (`auto_recording: "cloud"`); un error HTTP lanza `Error` con el estado; una respuesta sin `join_url` lanza error; `buscarReunionZoomPorMarcaHttp` encuentra la reunión con la marca en la segunda página y devuelve `null` si ninguna la tiene.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar siguiendo el estilo de `crearReunionZoomHttp`. **Step 4:** PASS. **Step 5: Commit** `feat: cliente Zoom para reuniones recurrentes sin horario fijo`.

### Task 3: Dominio de uso de la reunión compartida

**Files:**
- Create: `src/modules/reuniones/reunion-compartida.domain.ts`
- Test: `test/reunion-compartida-domain.test.ts`

**Interfaces:**
- Produces:
  - `type UsoReunionCompartida = Readonly<{ eventoProveedorId: string; instanciaEstado: string; instanciaFin: Date }>`
  - `usosActivos(usos: readonly UsoReunionCompartida[], ahora: Date, excluirEventoId?: string): number` — cuenta los usos activos: `instanciaEstado` en `PROGRAMADA` o `EN_CURSO` y `instanciaFin` posterior a `ahora`, sin contar el excluido. Los cancelados y los pasados no cuentan.
  - `debeEliminarseReunionCompartida(usos: readonly UsoReunionCompartida[], eventoQueCancela: string, ahora: Date): boolean` — verdadero solo si, descontado ese evento, no queda ningún uso activo.
  - `claveSerieReunion` ya existe en `serie-reunion.domain.ts` (reutilizar para `serieClave`).

- [ ] **Step 1: Failing tests:** con tres usos activos cancelar uno devuelve falso; con un solo uso activo devuelve verdadero; usos cancelados no cuentan; un encuentro ya terminado (fin anterior a `ahora`) no cuenta como uso, así que cancelar el último encuentro futuro devuelve verdadero aunque queden encuentros pasados; un encuentro `EN_CURSO` sí cuenta; repetir la cancelación del último sigue devolviendo verdadero (idempotente); lista vacía devuelve verdadero.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar sin `let` ni mutación. **Step 4:** PASS + `npx vitest run test/functional-architecture.test.ts`. **Step 5: Commit** `feat: dominio de uso de reuniones compartidas`.

### Task 4: Aprovisionamiento con reunión compartida

**Files:**
- Modify: `src/modules/conferencias/ports/conferencias-repository.port.ts`, `src/modules/conferencias/infrastructure/prisma/prisma-conferencias-repository.adapter.ts`, `src/modules/conferencias/application/provisionar-conferencias.use-case.ts`
- Test: `test/conferencias-application.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces en `ConferenciasRepositoryPort`:
  - `reclamarCreacionReunionCompartida(eventoProveedorId: string, token: string, ahora: Date): Promise<Readonly<{ reunionId: string; resultado: "RECLAMADA" | "EN_CURSO_POR_OTRO" | "YA_CREADA"; externalId: string | null; joinUrl: string | null }> | null>` — `null` si el evento no tiene `reunionProveedorId`. Es una **actualización condicional** (`PENDIENTE` → `CREANDO` con `reclamoToken` y `reclamoAt`; también retoma un reclamo `CREANDO` con más de 5 minutos), no un bloqueo asesor: este se libera al cerrar la transacción y el POST a Zoom ocurre fuera.
  - `registrarExternalIdTemprano(reunionId: string, token: string, externalId: string): Promise<void>` — guarda el ID apenas Zoom responde, solo si el token sigue siendo el del reclamo.
  - `guardarReunionCompartida(reunionId: string, token: string, datos: Readonly<{ externalId: string; joinUrl: string }>): Promise<void>` — pasa a `CREADA` y copia `externalEventId`/`joinUrl` a todos sus eventos pendientes.
  - `usosDeReunionCompartida(reunionId: string): Promise<readonly UsoReunionCompartida[]>`
  - `EventoReclamableInfo` (el evento que devuelve `reclamarEvento`) gana `reunionProveedorId: string | null` y `serieClave: string | null`, para armar la marca `[serie:<serieClave>]` y para que `CANCELAR`/`REPROGRAMAR` sepan a qué reunión compartida pertenece el evento sin otra consulta.
  - `liberarReclamoEvento(claim: ClaimInfo): Promise<void>` — limpia `reclamoIntegracionAt` y `reclamoIntegracionToken` del evento manteniendo `operacionPendiente`, para que un `EN_CURSO_POR_OTRO` se pueda reintentar de inmediato y no tras vencer el reclamo del evento.
  - `marcarReunionCompartidaEliminada(reunionId: string): Promise<void>`
- Comportamiento del caso de uso para eventos Zoom con reunión compartida: `PROVISIONAR` reclama la creación; si el resultado es `EN_CURSO_POR_OTRO` deja la operación pendiente sin llamar a Zoom y reintenta después; si es `RECLAMADA` primero busca una reunión huérfana con `buscarReunionZoomPorMarcaHttp` y, si no existe, la crea (Task 2), guardando el ID temprano; si es `YA_CREADA` reutiliza (GET); `REPROGRAMAR` y `CONFIGURAR_MEET` solo refrescan el enlace (GET), sin cambiar horarios; `CANCELAR` elimina en Zoom únicamente si `debeEliminarseReunionCompartida(...)` y, si ya se eliminó, no repite la llamada. Eventos sin reunión compartida mantienen el comportamiento actual.

- [ ] **Step 1: Failing tests** con repositorio y cliente simulados: (a) dos eventos de la misma reunión, `PROVISIONAR` secuencial, crean una sola reunión Zoom y ambos terminan con el mismo `joinUrl`; (a2) **dos reclamos simultáneos**: uno recibe `RECLAMADA` y llama a Zoom, el otro `EN_CURSO_POR_OTRO` y no llama; (a3) un reclamo vencido tras un POST que sí llegó a Zoom reutiliza la reunión huérfana y no crea otra; (a4) un token distinto no puede guardar el resultado; (a5) con `EN_CURSO_POR_OTRO` se libera el reclamo del evento y la operación queda pendiente sin llamar a Zoom; (a6) `marcarReunionCompartidaEliminada` es condicional (`estadoCreacion != "ELIMINADA"`): una segunda cancelación no repite el `DELETE`; (b) `CANCELAR` con otros usos activos no llama a `eliminarReunionZoomHttp`; (c) `CANCELAR` del último uso la elimina una vez y un reintento no la vuelve a eliminar; (d) `REPROGRAMAR` de un evento compartido no llama a `actualizarReunionZoomHttp` con horarios; (e) un evento sin reunión compartida sigue creando su propia reunión.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar puerto, adaptador y caso de uso. **Step 4:** PASS + `npx vitest run test/conferencias-application.test.ts test/integrations-zoom-client.test.ts`. **Step 5: Commit** `feat: aprovisionamiento Zoom con reunión compartida por serie`.

### Task 5: Series nuevas con una sola reunión

**Files:**
- Modify: `src/modules/reuniones/crear-reuniones.service.ts`
- Test: `test/crear-reuniones-service.test.ts`

**Interfaces:**
- Consumes: Task 1 (modelo), Task 3 (`claveSerieReunion` para `serieClave`).
- Produces: con la bandera `ZOOM_REUNION_COMPARTIDA` encendida (Task 9), al crear una solicitud Zoom, se crea **una** `ReunionProveedor` (`cuentaProveedorId = cuentaHostId`, `serieClave` derivado de `serieReunionId`) y cada `EventoProveedor` se crea con ese `reunionProveedorId`.

- [ ] **Step 1: Failing tests:** una serie de 3 encuentros crea una `ReunionProveedor` y 3 eventos con el mismo `reunionProveedorId` y la misma `cuentaProveedorId`; una reunión de un solo encuentro también crea la suya; la validación de disponibilidad de todos los horarios no cambia (reutilizar los tests existentes); con la bandera apagada no se crea `ReunionProveedor` y cada encuentro conserva su evento independiente, como hoy.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/crear-reuniones-service.test.ts`. **Step 5: Commit** `feat: series nuevas de Zoom con una sola reunión`.

### Task 6: Agregar, reprogramar y cancelar encuentros y series

**Files:**
- Modify: `src/modules/reuniones/gestionar-encuentros.service.ts`, `src/modules/reuniones/cancelar-solicitudes-atomicas.service.ts`
- Test: `test/gestionar-encuentros-service.test.ts`, `test/cancelar-solicitudes-zoom.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4.
- Comportamiento: `agregarEncuentro` en una serie Zoom con reunión compartida crea el `EventoProveedor` con ese `reunionProveedorId` y la misma cuenta; si la cuenta está ocupada en el horario nuevo lanza `ConflictApiError("La sala de la serie está ocupada en ese horario.")` y no elige otra. `actualizarEncuentro` (`EDITAR_FECHA`) sigue validando la cuenta de la serie pero, si el evento tiene reunión compartida, **no** deja ninguna operación pendiente en Zoom (el horario vive en Sala Virtual y en Calendar; el título de la reunión no lo cambia este servicio); sin reunión compartida mantiene el comportamiento actual. La condición exacta es: el evento activo del encuentro es de Zoom y tiene `reunionProveedorId` y `externalEventId`; en cualquier otro caso (Meet, Zoom antiguo sin reunión compartida) se conserva el comportamiento previo.
- **Cita histórica de Google Calendar:** esta tarea no la cambia. Hoy, al reprogramar o cancelar un encuentro ya migrado, la cita de Calendar (que pertenece al evento Meet histórico) no se actualiza; se mantiene como limitación conocida y se anota en el spec, fuera de este plan.
- **Decisión pendiente (series mixtas):** hoy `agregarEncuentro` agrega siempre en Zoom, incluso en una serie cuyos demás encuentros siguen en Meet, y deja la serie mixta. Hasta decidir si se rechaza ("migrá la serie a Zoom primero") o se permite, esta tarea no cambia ese comportamiento; la migración por serie (Task 7) resuelve las series mixtas existentes. `eliminarEncuentro`, `eliminarReunionCompleta` y `cancelarSolicitudesAtomicas` marcan `CANCELAR` en cada evento; la decisión de eliminar en Zoom la toma el worker (Task 4), por lo que no se deduplican IDs externos aquí.

- [ ] **Step 1: Failing tests:** (a) agregar a una serie con reunión compartida vincula el evento nuevo y misma cuenta; (b) agregar con cuenta ocupada lanza el conflicto y no crea nada; (c) reprogramar la fecha de un encuentro compartido no deja `REPROGRAMAR` en Zoom; (d) cancelar un encuentro marca `CANCELAR` solo en su evento; (e) los tests existentes de series sin reunión compartida siguen verdes.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/gestionar-encuentros-service.test.ts test/gestionar-encuentros-titular.test.ts test/cancelar-solicitudes-zoom.test.ts test/cancelar-solicitudes-atomicas.test.ts`. **Step 5: Commit** `feat: gestión de encuentros con reunión compartida`.

### Task 7: Migración Meet→Zoom por serie

**Files:**
- Modify: `src/modules/reuniones/migracion-zoom-preview.domain.ts`, `src/modules/reuniones/migracion-zoom.service.ts`, `src/modules/reuniones/migracion-zoom-aplicar.service.ts`, `src/modules/reuniones/migracion-zoom-avisos.service.ts`, `app/api/v1/reuniones/migracion-zoom/**` (rutas existentes), `src/components/migracion-zoom-aplicar-control.tsx`
- Test: `test/migracion-zoom-preview.test.ts`, `test/migracion-zoom-service.test.ts`, `test/migracion-zoom-aplicar.test.ts`, `test/migracion-zoom-routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces:
  - Vista previa por serie: `planificarMigracionZoomPorSerie(input): readonly FilaSerieMigracionZoom[]` con `FilaSerieMigracionZoom = { serieClave: string; encuentroIds: readonly string[]; estado: EstadoVistaPreviaZoom; hostId: string | null }`. Un único host debe tener capacidad para **todos** los horarios (`elegirCuentaHostParaPeriodos` con todos los periodos de la serie). El estado `SERIE` (bloqueo provisorio) desaparece. Una serie con excepciones en solo algunos encuentros queda `REVISAR`. Una serie **mixta** (con encuentros ya en Zoom que tienen reuniones propias distintas) también queda `REVISAR`: por defecto no es migrable, y su resolución es una **decisión pendiente** (unificarla dentro de esta misma operación reutilizando la lógica del plan de corrección, o corregirla antes). Una serie con encuentros en Zoom que ya comparten la reunión compartida y el resto en Meet sí es migrable: las reservas de los encuentros de la propia serie no cuentan como colisión de sala entre sí (comparten la misma reunión y cuenta, y sus horarios no se superponen).
  - `aplicarMigracionZoomSerie(deps, actor, input: { modo: "PILOTO" | "LOTE"; serieClaves: readonly string[] }): Promise<readonly ResultadoMigracionSerie[]>` — por serie: **un solo bloqueo asesor por serie** (tomado antes de la reserva de salas; sin bloqueos por encuentro dentro de la operación), crear/reutilizar `ReunionProveedor` + eventos Zoom, sincronizar, verificar con GET, parchear y verificar las citas de Calendar de todos los encuentros que **tengan cita** guardando el avance de cada una en `CambioEnlaceCita` (el reintento retoma solo las pendientes), y recién entonces `updateMany` de `proveedorActivoTipo = "ZOOM"` de todos los encuentros en una transacción; auditoría `MIGRACION_ZOOM_SERIE_APLICADA`; avisos registrados en `AvisoEnlaceSerie` (tipo `MIGRACION_SERIE`), una vez por serie y destinatario. Un encuentro sin cita de Calendar no bloquea. Si cualquier encuentro de la serie comienza dentro del margen de seguridad, toda la serie es `CERCANO`. `actualizarExcepcionGoogleMeet` pasa a tomar también el bloqueo asesor por serie (misma clave), de modo que una excepción no cambie mientras se aplica la migración. Además, frente a la edición de excepciones, el cambio final de proveedor usa un `updateMany` condicionado a `conservarGoogleMeet: false` y a Meet activo, y si la cantidad de filas cambiadas no coincide con el total de encuentros de la serie la transacción se revierte y se informa para reintentar. El piloto migra exactamente una serie.
  - La interfaz lista series (no encuentros) con sus encuentros, host propuesto y el estado.

- [ ] **Step 1: Failing tests:** (a) planificación: una serie de 3 encuentros con un host libre en todos los horarios es `MIGRABLE` con ese host; si el host solo está libre en 2 de los 3 horarios elige otro o queda `SIN_SALA`; (b) aplicar: éxito deja los 3 encuentros en Zoom con el mismo `joinUrl` y un solo `EventoProveedor` de reunión compartida; (c) el parche de Calendar falla en la 1.ª, la 2.ª y la 3.ª cita → ningún encuentro cambia de proveedor, `CambioEnlaceCita` refleja cuáles quedaron `VERIFICADA`, y reintentar retoma solo las pendientes sin crear otra reunión Zoom; (c2) una serie sin citas de Calendar se migra igual; (c3) un encuentro a menos de 24 horas deja toda la serie en `CERCANO`; (d) serie con una excepción parcial → `REVISAR`; (e) avisos: un destinatario presente en los 3 encuentros recibe un solo aviso, y un aviso de migración anterior (`AvisoMigracionZoom`) no lo bloquea; (f) un encuentro individual no se puede migrar por separado.
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

### Task 9: Bandera de creación compartida y orden de despliegue

**Files:**
- Modify: `src/modules/reuniones/crear-reuniones.service.ts` (lectura de la bandera), `docs/despliegue-ec2.md` (nota de despliegue)
- Test: `test/crear-reuniones-service.test.ts`

**Interfaces:**
- `reunionCompartidaHabilitada(env: Readonly<Record<string, string | undefined>>): boolean` — verdadero solo si `ZOOM_REUNION_COMPARTIDA` vale `"1"` o `"true"`; apagada por defecto. Las Tasks 4 a 7 respetan la bandera: con ella apagada nada cambia respecto de hoy.

- [ ] **Step 1: Failing tests:** la función es falsa sin la variable, con `"0"` y con cualquier otro valor; verdadera con `"1"` y `"true"`; `crearReuniones` con la bandera apagada no crea `ReunionProveedor`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar y documentar el orden: (1) desplegar migración y código con la bandera apagada; (2) comprobar que no queda ninguna versión anterior del worker en ejecución; (3) encender la bandera; (4) probar una serie de 3 encuentros; (5) recién entonces usar la migración por serie y la corrección de series existentes. **Step 4:** PASS. **Step 5: Commit** `feat: bandera de creación compartida y orden de despliegue`.

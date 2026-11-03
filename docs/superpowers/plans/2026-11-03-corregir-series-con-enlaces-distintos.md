# Corregir series con enlaces de Zoom distintos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar las series que ya tienen encuentros con enlaces de Zoom distintos y unificarlas en una sola reunión compartida, sin dejar a nadie con un enlace inválido.

**Architecture:** Detección de solo lectura; un plan de corrección por serie (enlace canónico, reuniones a retirar, citas a parchear); aplicación idempotente por serie que crea y verifica la reunión compartida y las citas de Calendar, vincula los encuentros y difiere siete días la limpieza de reuniones antiguas. Reutiliza `ReunionProveedor` y las tablas de seguimiento del plan de enlace único.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, Zoom Server-to-Server OAuth, Google Calendar API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md` (sección "Corrección de series existentes")

**Depende de:** Tasks 1 a 4 de `docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md`, incluidas las tablas `CambioEnlaceCita` y `AvisoEnlaceSerie` y los campos de estado de creación persistido de `ReunionProveedor`. Este plan no se ejecuta antes.

## Decisión pendiente (confirmar antes de ejecutar)

Una reunión Zoom programada (tipo 2) no se puede convertir en recurrente (tipo 3) por API. Hay dos formas de unificar:

- **A. Adoptar una de las reuniones existentes** como enlace de la serie. Menos cambios de enlace, pero es una reunión con horario fijo (puede caducar tras la fecha de su encuentro) y el comportamiento no coincide con las series nuevas.
- **B. Crear una reunión recurrente nueva** y cambiar el enlace de **todos** los encuentros de la serie, incluso del que ya tenía uno. Es uniforme con las series nuevas y no caduca, pero toda persona invitada recibe un enlace nuevo una vez.

**Este plan asume B** (recomendado: uniformidad y sin caducidad). Si se elige A, cambian solo las Tasks 3 y 4.

## Global Constraints

- Las reuniones Zoom antiguas se conservan durante **7 días** después de verificar la serie, como período de convivencia para quienes conserven el enlace viejo en un correo; solo después las elimina una limpieza explícita. Una reunión antigua inexistente (404) no hace fallar la limpieza.
- Los avisos de esta corrección se registran en `AvisoEnlaceSerie` (único por serie, destinatario y tipo), nunca en `AvisoMigracionZoom`.
- Un encuentro sin cita de Google Calendar no bloquea la corrección.
- Idempotente y reanudable por serie: reintentar no crea una segunda reunión compartida ni vuelve a enviar avisos ya enviados.
- Solo Administración puede ver la detección y aplicar la corrección. Todo cambio deja auditoría (`SERIE_ENLACE_UNIFICADO`).
- Una cuenta anfitriona con capacidad 1: la sala elegida debe estar libre en **todos** los horarios futuros de la serie; si no, la serie queda `REVISAR`, sin cambios.
- Solo encuentros futuros (`PROGRAMADA`, inicio posterior a ahora) y no cancelados. Las series con algún encuentro en curso o en las próximas 24 horas se difieren (`CERCANO`).
- No incluir el `start_url` en avisos ni pantallas.
- Respetar `test/architecture-boundaries.test.ts` y `test/functional-architecture.test.ts`.
- Antes de cada commit: `npm run check` y los tests enfocados.

## Review Focus

- Una serie creada en Zoom sin citas de Calendar se corrige igual.
- El aviso de corrección no choca con un aviso de la migración anterior para el mismo encuentro y correo.
- El enlace viejo sigue funcionando durante los 7 días de convivencia.
- Un fallo al parchear la primera, segunda o tercera cita deja la serie sin vincular y el reintento retoma solo las citas pendientes.
- Una serie ya unificada no vuelve a corregirse.
- La limpieza no elimina reuniones antes de los 7 días; después las elimina, tolera 404 y no repite eliminaciones.
- Un destinatario presente en varios encuentros de la serie recibe un solo aviso.
- Una serie ya unificada (todos con el mismo enlace) no aparece en la detección y aplicarla de nuevo no cambia nada.
- Una serie mixta (algunos encuentros en Meet y otros en Zoom) no se corrige con este flujo: se informa y se deja para la migración por serie.
- Una reunión Zoom antigua que ya no existe (404 al eliminar) no hace fallar la corrección.
- Un encuentro cancelado de la serie conserva su enlace antiguo y no cuenta como "distinto".

---

### Task 1: Detección de series con enlaces distintos (solo lectura)

**Files:**
- Create: `src/modules/reuniones/series-enlaces-distintos.service.ts`
- Test: `test/series-enlaces-distintos.test.ts`

**Interfaces:**
- Produces:
  - `type SerieConEnlacesDistintos = Readonly<{ serieClave: string; titulo: string; programa: string; docente: string; encuentros: readonly Readonly<{ instanciaId: string; inicio: Date; joinUrl: string | null; externalEventId: string | null; cuentaProveedorId: string | null }>[]; enlacesDistintos: number }>`
  - `detectarSeriesConEnlacesDistintos(db: PrismaClient, actor: Readonly<{ id: string; rol: string }>, ahora?: Date): Promise<readonly SerieConEnlacesDistintos[]>` — solo Administración; considera encuentros futuros `PROGRAMADA` cuyo proveedor activo es Zoom, agrupa por `claveSerieReunion` y devuelve las series con más de un `joinUrl` Zoom distinto. Excluye series ya compartidas (todos con el mismo `reunionProveedorId`).

- [ ] **Step 1: Failing tests** con `db` simulado: (a) una serie de 3 encuentros con 3 enlaces distintos aparece con `enlacesDistintos: 3`; (b) una con el mismo enlace no aparece; (c) los cancelados y pasados no cuentan; (d) una serie legada (sin `serieReunionId`) se agrupa por docente-programa, título y fecha de creación; (e) un docente (no admin) recibe `ForbiddenApiError`; (f) una serie mixta no aparece.
- [ ] **Step 2:** `npx vitest run test/series-enlaces-distintos.test.ts` → FAIL.
- [ ] **Step 3:** Implementar con una sola consulta de encuentros futuros activos en Zoom e incluir el evento Zoom, agrupar con `claveSerieReunion`.
- [ ] **Step 4:** PASS. **Step 5: Commit** `feat: detectar series con enlaces de Zoom distintos`.

### Task 2: Plan de corrección por serie (dominio puro)

**Files:**
- Create: `src/modules/reuniones/corregir-serie-enlaces.domain.ts`
- Test: `test/corregir-serie-enlaces-domain.test.ts`

**Interfaces:**
- Produces:
  - `type EncuentroSerieParaCorregir = Readonly<{ instanciaId: string; inicio: Date; fin: Date; joinUrl: string | null; externalEventId: string | null; cuentaProveedorId: string | null; calendarId: string | null; calendarEventId: string | null }>`
  - `type PlanCorreccionSerie = Readonly<{ estado: "CORREGIBLE" | "SIN_SALA" | "CERCANO" | "REVISAR"; hostId: string | null; encuentroIds: readonly string[]; reunionesARetirar: readonly string[]; encuentrosSinCalendar: readonly string[] }>`
  - `planificarCorreccionSerie(input: Readonly<{ ahora: Date; margenSeguridadHoras: number; encuentros: readonly EncuentroSerieParaCorregir[]; hosts: readonly Readonly<{ id: string; prioridad: number; limiteConcurrente: number | null }>[]; reservasZoom: readonly Readonly<{ cuentaProveedorId: string; inicio: Date; fin: Date; instanciaId: string }>[] }>): PlanCorreccionSerie` — la reserva de la propia serie no cuenta como colisión; el host se elige con `elegirCuentaHostParaPeriodos` para **todos** los horarios, prefiriendo la cuenta que ya usan más encuentros de la serie; `reunionesARetirar` son los `externalEventId` distintos y no nulos de la serie.

- [ ] **Step 1: Failing tests:** (a) serie de 3 encuentros en cuentas distintas, sala libre → `CORREGIBLE` con la cuenta más usada y 3 reuniones a retirar; (b) la cuenta preferida ocupada en un horario → otra libre o `SIN_SALA`; (c) si cualquier encuentro comienza dentro del margen de seguridad, toda la serie queda `CERCANO`; (d) un encuentro sin cita no bloquea y aparece en `encuentrosSinCalendar` sin cambiar el estado; (e) las reservas de la propia serie no bloquean; (f) función pura sin `let`/mutación.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/functional-architecture.test.ts`. **Step 5: Commit** `feat: planificar la corrección de series con enlaces distintos`.

### Task 3: Aplicar la corrección por serie

**Files:**
- Create: `src/modules/reuniones/corregir-serie-enlaces.service.ts`
- Modify: `src/modules/reuniones/migracion-zoom-calendar.domain.ts` (reemplazo de un enlace Zoom por otro en la cita)
- Test: `test/corregir-serie-enlaces.test.ts`, `test/migracion-zoom-calendar.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; plan de enlace único Tasks 1–4.
- Produces:
  - `prepararCambioEnlaceZoomACalendar(actual: EventoCalendarMigracion, enlaceAnterior: string | null, enlaceNuevo: string): Readonly<Record<string, unknown>>` — misma forma que `prepararCambioEnlaceCalendarZoom`; quita cualquier enlace de Zoom previo en descripción y ubicación, agrega el nuevo sin dejar dos enlaces y no toca otros campos.
  - `corregirSerieEnlaces(deps: DependenciasCorreccionSerie, actor: Readonly<{ id: string; rol: string }>, input: Readonly<{ serieClave: string }>): Promise<ResultadoCorreccionSerie>` con `ResultadoCorreccionSerie = { serieClave; resultado: "CORREGIDA" | "YA_UNIFICADA" | "OMITIDA" | "ERROR"; etapa: "VALIDACION" | "ZOOM" | "CALENDAR" | "VINCULACION" | "AVISOS"; mensaje?: string; reintentable: boolean }`.
  - `limpiarReunionesAntiguas(deps: DependenciasCorreccionSerie, actor: Readonly<{ id: string; rol: string }>, ahora?: Date): Promise<Readonly<{ eliminadas: number; pendientes: number; errores: number }>>` — solo actúa en series con todas sus citas `VERIFICADA`; elimina reuniones cuya fecha `eliminarDespuesDe` ya pasó, tolera 404 y es idempotente.
  - Etapas bajo bloqueo asesor de la serie: (1) revalidar el plan; (2) crear o reutilizar `ReunionProveedor` en la cuenta elegida y verificar `join_url` con GET; (3) por cada encuentro con cita, parchear y verificar Calendar, persistiendo por cita en `CambioEnlaceCita` los estados `PENDIENTE` → `PARCHEADA` → `VERIFICADA`, y en reintentos retomar solo las pendientes; los encuentros sin cita no bloquean; (4) en transacción, vincular los eventos Zoom a la reunión nueva, actualizando `EventoProveedor.cuentaProveedorId = plan.hostId`, `externalEventId`, `joinUrl` y `reunionProveedorId`, y auditar `SERIE_ENLACE_UNIFICADO`; (5) registrar en `CambioEnlaceCita` `reunionAnteriorExternalId` y `eliminarDespuesDe = ahora + 7 días`, sin eliminar reuniones; (6) registrar avisos en `AvisoEnlaceSerie` con tipo `CORRECCION_ENLACE`, una vez por serie y destinatario.

- [ ] **Step 1: Failing tests** con puertos simulados (Zoom, Calendar, correo): (a) camino feliz: una reunión nueva, citas con estado `VERIFICADA`, eventos vinculados, avisos deduplicados y fecha de limpieza registrada a siete días; no se elimina ninguna reunión en el momento; (b) fallo al parchear la primera, segunda o tercera cita deja la serie sin vincular y reintentable; el reintento reutiliza la reunión y retoma solo citas `PENDIENTE`; (c) serie sin citas de Calendar se corrige y se vincula; (d) serie ya unificada devuelve `YA_UNIFICADA` sin llamadas externas; (e) destinatario en varios encuentros recibe un aviso en `AvisoEnlaceSerie` con tipo `CORRECCION_ENLACE`, sin colisión con `AvisoMigracionZoom` del mismo encuentro y correo; (f) dos citas con enlaces Zoom previos distintos quedan con un solo enlace; (g) `limpiarReunionesAntiguas` antes de siete días no elimina, después elimina, tolera 404 y no repite; (h) la limpieza no actúa en serie que no tenga todas las citas `VERIFICADA`; (i) `prepararCambioEnlaceZoomACalendar` quita múltiples enlaces Zoom previos de descripción y ubicación y conserva otros campos.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/corregir-serie-enlaces.test.ts test/migracion-zoom-calendar.test.ts`. **Step 5: Commit** `feat: unificar el enlace de Zoom de una serie`.

### Task 4: Ruta y pantalla de administración

**Files:**
- Create: `app/api/v1/reuniones/migracion-zoom/series-enlaces/route.ts`
- Modify: `src/components/migracion-zoom-aplicar-control.tsx` (o una sección nueva en la pantalla `/reuniones/migracion-zoom`)
- Test: `test/series-enlaces-route.test.ts`

**Interfaces:**
- `GET` devuelve `{ series: SerieConEnlacesDistintos[]; planes: Record<serieClave, PlanCorreccionSerie> }` (vista previa, sin escrituras). `POST` con `{ modo: "PILOTO" | "LOTE", serieClaves }` aplica `corregirSerieEnlaces` a cada una; el piloto corrige exactamente una serie y un lote admite hasta 5. También acepta `{ accion: "LIMPIAR" }` sin `serieClaves` e invoca `limpiarReunionesAntiguas`. Ambos modos exigen Administración.
- La pantalla lista las series afectadas con sus enlaces, el plan (host, estado) y un botón por serie para el piloto y por lote; muestra resultados y errores por serie, y suma el botón “Limpiar reuniones antiguas” con el conteo de pendientes.

- [ ] **Step 1: Failing tests** de la ruta con `db` y servicios simulados: (a) no administrador → 403; (b) `GET` no escribe; (c) `POST` piloto con más de una serie → 422; (d) lote de más de 5 → 422; (e) un error de una serie no impide aplicar las demás; (f) solo Administración puede ejecutar `LIMPIAR`; (g) `LIMPIAR` no elimina reuniones cuya fecha aún no llegó (dentro de los 7 días).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar ruta y pantalla (leer `node_modules/next/dist/docs/` para la ruta). **Step 4:** PASS. **Step 5: Commit** `feat: pantalla para corregir series con enlaces distintos`.

### Task 5: Verificación y salida a producción

- [ ] **Step 1:** `npm run check`, `npx vitest run` y `npm run build` limpios.
- [ ] **Step 2 (manual, requiere Zoom y Calendar reales):** correr la detección y revisar a mano que las series listadas sean las esperadas.
- [ ] **Step 3:** Piloto con **una** serie de bajo impacto: comprobar en Zoom que existe una sola reunión recurrente, el enlace antiguo sigue vivo durante los 7 días y desaparece tras ejecutar la limpieza; en Google Calendar que todas las citas tienen el enlace nuevo; y que los avisos llegaron una sola vez.
- [ ] **Step 4:** Lotes pequeños, revisando errores por serie antes de la siguiente tanda.
- [ ] **Step 5:** Si no se ejecutaron los pasos manuales, dejarlo anotado: no declarar la corrección verificada.


## Decisiones pendientes

- Opción A/B del enlace: ver la decisión pendiente indicada arriba; el plan asume B.
- Series mixtas (Meet y Zoom): este plan solo las informa y no las corrige; se resuelven con la migración por serie.

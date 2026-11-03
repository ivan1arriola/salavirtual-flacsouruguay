# Corregir series con enlaces de Zoom distintos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar las series que ya tienen encuentros con enlaces de Zoom distintos y unificarlas en una sola reunión compartida, sin dejar a nadie con un enlace inválido.

**Architecture:** Detección de solo lectura; un plan de corrección por serie (enlace canónico, reuniones a retirar, citas a parchear); aplicación idempotente por serie que primero crea y verifica la reunión compartida y las citas de Calendar, y solo después elimina las reuniones sobrantes. Reutiliza el modelo `ReunionProveedor` del plan de enlace único.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, Zoom Server-to-Server OAuth, Google Calendar API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-zoom-enlace-unico-por-serie-design.md` (sección "Corrección de series existentes")

**Depende de:** `docs/superpowers/plans/2026-11-03-zoom-enlace-unico-por-serie.md`, Tasks 1 a 4 (esquema `ReunionProveedor`, cliente Zoom recurrente, dominio de usos y worker). Este plan no se ejecuta antes.

## Decisión pendiente (confirmar antes de ejecutar)

Una reunión Zoom programada (tipo 2) no se puede convertir en recurrente (tipo 3) por API. Hay dos formas de unificar:

- **A. Adoptar una de las reuniones existentes** como enlace de la serie. Menos cambios de enlace, pero es una reunión con horario fijo (puede caducar tras la fecha de su encuentro) y el comportamiento no coincide con las series nuevas.
- **B. Crear una reunión recurrente nueva** y cambiar el enlace de **todos** los encuentros de la serie, incluso del que ya tenía uno. Es uniforme con las series nuevas y no caduca, pero toda persona invitada recibe un enlace nuevo una vez.

**Este plan asume B** (recomendado: uniformidad y sin caducidad). Si se elige A, cambian solo las Tasks 3 y 4.

## Global Constraints

- La corrección no elimina ninguna reunión Zoom antigua hasta que **todas** las citas de Calendar de la serie estén parcheadas y verificadas con el enlace nuevo.
- Idempotente y reanudable por serie: reintentar no crea una segunda reunión compartida ni vuelve a enviar avisos ya enviados.
- Solo Administración puede ver la detección y aplicar la corrección. Todo cambio deja auditoría (`SERIE_ENLACE_UNIFICADO`).
- Una cuenta anfitriona con capacidad 1: la sala elegida debe estar libre en **todos** los horarios futuros de la serie; si no, la serie queda `REVISAR`, sin cambios.
- Solo encuentros futuros (`PROGRAMADA`, inicio posterior a ahora) y no cancelados. Las series con algún encuentro en curso o en las próximas 24 horas se difieren (`CERCANO`).
- No incluir el `start_url` en avisos ni pantallas.
- Respetar `test/architecture-boundaries.test.ts` y `test/functional-architecture.test.ts`.
- Antes de cada commit: `npm run check` y los tests enfocados.

## Review Focus

- Una serie cuya corrección falla al parchear la tercera cita no elimina ninguna reunión antigua y el reintento termina sin duplicar la reunión compartida.
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
  - `type PlanCorreccionSerie = Readonly<{ estado: "CORREGIBLE" | "SIN_SALA" | "CERCANO" | "SIN_CALENDAR" | "REVISAR"; hostId: string | null; encuentroIds: readonly string[]; reunionesARetirar: readonly string[]; encuentrosSinCalendar: readonly string[] }>`
  - `planificarCorreccionSerie(input: Readonly<{ ahora: Date; margenSeguridadHoras: number; encuentros: readonly EncuentroSerieParaCorregir[]; hosts: readonly Readonly<{ id: string; prioridad: number; limiteConcurrente: number | null }>[]; reservasZoom: readonly Readonly<{ cuentaProveedorId: string; inicio: Date; fin: Date; instanciaId: string }>[] }>): PlanCorreccionSerie` — la reserva de la propia serie no cuenta como colisión; el host se elige con `elegirCuentaHostParaPeriodos` para **todos** los horarios, prefiriendo la cuenta que ya usan más encuentros de la serie; `reunionesARetirar` son los `externalEventId` distintos y no nulos de la serie.

- [ ] **Step 1: Failing tests:** (a) serie de 3 encuentros en cuentas distintas, sala libre → `CORREGIBLE` con la cuenta más usada y 3 reuniones a retirar; (b) la cuenta preferida ocupada en un horario → otra libre o `SIN_SALA`; (c) un encuentro a menos de 24 horas → `CERCANO`; (d) un encuentro sin cita de Calendar → `SIN_CALENDAR` listando cuál; (e) las reservas de la propia serie no bloquean; (f) función pura sin `let`/mutación.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/functional-architecture.test.ts`. **Step 5: Commit** `feat: planificar la corrección de series con enlaces distintos`.

### Task 3: Aplicar la corrección por serie

**Files:**
- Create: `src/modules/reuniones/corregir-serie-enlaces.service.ts`
- Modify: `src/modules/reuniones/migracion-zoom-calendar.domain.ts` (reemplazo de un enlace Zoom por otro en la cita)
- Test: `test/corregir-serie-enlaces.test.ts`, `test/migracion-zoom-calendar.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; plan de enlace único Tasks 1–4.
- Produces:
  - `prepararCambioEnlaceZoomACalendar(actual: EventoCalendarMigracion, enlaceAnterior: string | null, enlaceNuevo: string): Readonly<Record<string, unknown>>` — misma forma que `prepararCambioEnlaceCalendarZoom`; reemplaza el `join_url` anterior por el nuevo en descripción y ubicación y no toca otros campos.
  - `corregirSerieEnlaces(deps: DependenciasCorreccionSerie, actor, input: Readonly<{ serieClave: string }>): Promise<ResultadoCorreccionSerie>` con `ResultadoCorreccionSerie = { serieClave; resultado: "CORREGIDA" | "YA_UNIFICADA" | "OMITIDA" | "ERROR"; etapa: "VALIDACION" | "ZOOM" | "CALENDAR" | "VINCULACION" | "LIMPIEZA" | "AVISOS"; mensaje?: string; reintentable: boolean }`.
  - Etapas, bajo bloqueo asesor de la serie: (1) revalidar el plan; (2) crear o reutilizar la `ReunionProveedor` recurrente en la cuenta elegida y verificar su `join_url` con GET; (3) parchear y verificar cada cita de Calendar con el enlace nuevo; (4) en una transacción, vincular todos los eventos Zoom de la serie a la reunión nueva (copiando `externalEventId`/`joinUrl`) y auditar `SERIE_ENLACE_UNIFICADO`; (5) eliminar en Zoom las reuniones antiguas (404 se tolera); (6) avisar a los destinatarios, una vez por serie y destinatario.

- [ ] **Step 1: Failing tests** con puertos simulados (Zoom, Calendar, correo): (a) camino feliz: una sola reunión nueva, 3 citas parcheadas, 3 eventos vinculados, 3 reuniones antiguas eliminadas, una auditoría; (b) el parche de la tercera cita falla → no se vincula ni se elimina nada, `reintentable: true`, y el reintento reutiliza la reunión ya creada; (c) fallo al eliminar una reunión antigua con error distinto de 404 → la serie queda unificada, resultado `CORREGIDA` con la limpieza pendiente anotada; (d) serie ya unificada → `YA_UNIFICADA` sin llamadas externas; (e) un destinatario en 3 encuentros recibe un solo aviso; (f) `prepararCambioEnlaceZoomACalendar` reemplaza el enlace anterior y conserva el resto de la descripción.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npx vitest run test/corregir-serie-enlaces.test.ts test/migracion-zoom-calendar.test.ts`. **Step 5: Commit** `feat: unificar el enlace de Zoom de una serie`.

### Task 4: Ruta y pantalla de administración

**Files:**
- Create: `app/api/v1/reuniones/migracion-zoom/series-enlaces/route.ts`
- Modify: `src/components/migracion-zoom-aplicar-control.tsx` (o una sección nueva en la pantalla `/reuniones/migracion-zoom`)
- Test: `test/series-enlaces-route.test.ts`

**Interfaces:**
- `GET` devuelve `{ series: SerieConEnlacesDistintos[]; planes: Record<serieClave, PlanCorreccionSerie> }` (vista previa, sin escrituras). `POST` con `{ modo: "PILOTO" | "LOTE", serieClaves }` aplica `corregirSerieEnlaces` a cada una; el piloto corrige exactamente una serie y un lote admite hasta 5. Ambos exigen Administración.
- La pantalla lista las series afectadas con sus enlaces, el plan (host, estado) y un botón por serie para el piloto y por lote; muestra resultados y errores por serie.

- [ ] **Step 1: Failing tests** de la ruta con `db` y servicios simulados: (a) no administrador → 403; (b) `GET` no escribe; (c) `POST` piloto con más de una serie → 422; (d) lote de más de 5 → 422; (e) un error de una serie no impide aplicar las demás.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar ruta y pantalla (leer `node_modules/next/dist/docs/` para la ruta). **Step 4:** PASS. **Step 5: Commit** `feat: pantalla para corregir series con enlaces distintos`.

### Task 5: Verificación y salida a producción

- [ ] **Step 1:** `npm run check`, `npx vitest run` y `npm run build` limpios.
- [ ] **Step 2 (manual, requiere Zoom y Calendar reales):** correr la detección y revisar a mano que las series listadas sean las esperadas.
- [ ] **Step 3:** Piloto con **una** serie de bajo impacto: comprobar en Zoom que existe una sola reunión recurrente y las antiguas desaparecieron; en Google Calendar que todas las citas tienen el enlace nuevo; y que los avisos llegaron una sola vez.
- [ ] **Step 4:** Lotes pequeños, revisando errores por serie antes de la siguiente tanda.
- [ ] **Step 5:** Si no se ejecutaron los pasos manuales, dejarlo anotado: no declarar la corrección verificada.

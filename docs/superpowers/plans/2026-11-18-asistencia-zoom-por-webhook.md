# Asistencia de Zoom por webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `meeting.ended` de Zoom sincronice la asistencia de esa ocurrencia (con reintentos del propio webhook), eliminar el sondeo periódico roto y mostrar un botón de reintento manual en la ficha.

**Architecture:** `procesarWebhooksZoom` recibe una función `sincronizarAsistencia` inyectada y la llama fuera de la transacción tras un `meeting.ended`. Un 404 de Zoom o un error se convierten en fallo reintentable del aviso, usando la espera exponencial ya existente (`proximoIntento`, `MAX_INTENTOS = 10`). El botón reutiliza `AttendanceRegenerateAction` y la ruta `POST .../asistencia/regenerar`, ya existentes (solo administración).

**Tech Stack:** Next.js (App Router, versión con cambios: leer `node_modules/next/dist/docs/` antes de tocar rutas/páginas), Prisma, vitest, worker Node (`scripts/zoom-archivos-worker.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-asistencia-zoom-por-webhook-design.md`. Desvío respecto del spec: la escala de reintento es la existente (2, 4, 8 … min, hasta 10 intentos ≈ 17 h), no 2/5/15/60; así no se toca `proximoIntento`.

## Global Constraints

- Sin barrido de respaldo: ningún proceso periódico consulta asistencia a Zoom.
- Un 404 de Zoom es "aún no entregó el reporte", nunca "cero asistentes"; un error/404 no borra asistencia guardada.
- La llamada a Zoom nunca ocurre dentro de `db.$transaction`.
- Botón solo para `ADMINISTRACION` (la ruta ya lo valida con 403).
- Textos de UI en español rioplatense como el resto de la app.
- Sin migraciones de base de datos.
- Despliegue por SSH: `bash scripts/deploy-ec2.sh --force`.

## Review Focus

- `meeting.ended` cuyo reporte sigue en 404 tras los 10 intentos → aviso `FALLIDO`, sin bucle ni excepción (Task 1).
- `meeting.ended` de otra cuenta Zoom → `IGNORADO` sin llamar a Zoom (Task 1).
- La sincronización lanza una excepción inesperada → aviso `ERROR` reintentable, el worker sigue con los demás (Task 1).
- Zoom sin credenciales al sincronizar (`ZOOM_NO_CONFIGURADO`) → aviso `ERROR` con ese código, reintentable (Task 1).
- Pulsar el botón cuando todas las ocurrencias dan 404 → mensaje "Zoom aún no entregó el reporte", no "Sincronización terminada" (Task 3).

---

### Task 1: Sincronizar asistencia al procesar `meeting.ended`

**Files:**
- Modify: `src/bootstrap/zoom-webhook-worker.ts` (`aplicarAviso`, `procesarWebhooksZoom`)
- Test: `test/zoom-webhook-worker.test.ts`

**Interfaces:**
- Consumes: `ResultadoAsistenciaZoom` de `src/modules/archivos/application/sincronizar-asistencia-zoom.use-case.ts` (`tipo: "OK" | "PENDIENTE" | "CONFLICTO" | "ERROR"`, el de error trae `codigo`).
- Produces: `procesarWebhooksZoom(cuentaZoomId: string, limite = 25, sincronizarAsistencia?: (ocurrenciaId: string) => Promise<ResultadoAsistenciaZoom>)`. `aplicarAviso` devuelve `{ estado: "PROCESADO" | "IGNORADO"; ocurrenciaId: string | null }`.

- [ ] **Step 1: Write the failing tests** en `test/zoom-webhook-worker.test.ts` (reusar `aviso`, `mocks`; `mocks.upsert` ya devuelve `{ id: "ocurrencia-1", ... }`). Agregar un `describe("asistencia al finalizar")` con:
  - `"meeting.ended sincroniza la ocurrencia fuera de la transacción"`: `sync = vi.fn().mockResolvedValue({ tipo: "OK", estadoReporte: "DISPONIBLE", participantes: 3, sesionesNuevas: 3 })`; `procesarWebhooksZoom("cuenta-1", 2, sync)` → `{ procesados: 1, ignorados: 0, errores: 0 }` y `sync` llamado una vez con `"ocurrencia-1"`.
  - `"meeting.started no sincroniza"`: aviso `tipo: "meeting.started"` → `sync` no llamado.
  - `"otra cuenta se ignora sin llamar a Zoom"`: aviso con `cuentaZoomId: "otra"` → `ignorados: 1`, `sync` no llamado.
  - `"404 de Zoom deja el aviso en ERROR reintentable"`: `sync` devuelve `{ tipo: "PENDIENTE", estadoReporte: "NO_DISPONIBLE" }` → `errores: 1` y `mocks.updateMany` recibe `data` con `estado: "ERROR"`, `errorCodigo: "ReporteZoomPendiente"` y `proximoIntentoAt` Date.
  - `"404 en el último intento deja el aviso FALLIDO"`: aviso con `intentos: 9` (el claim suma 1 → 10) → `estado: "FALLIDO"`.
  - `"CONFLICTO de reprogramación cuenta como procesado"`: `sync` devuelve `{ tipo: "CONFLICTO", motivo: "REPROGRAMADO" }` → `procesados: 1`.
  - `"error de la sincronización conserva su código"`: `sync` devuelve `{ tipo: "ERROR", codigo: "ZOOM_NO_CONFIGURADO" }` → `errores: 1`, `errorCodigo: "ZOOM_NO_CONFIGURADO"`.
  - `"excepción inesperada no detiene el ciclo"`: `sync` rechaza con `new Error("boom")` → `errores: 1`, `errorCodigo: "Error"`.
  - `"sin función de sincronización se comporta como antes"`: llamada con 2 argumentos → `procesados: 1`.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run test/zoom-webhook-worker.test.ts` → FAIL (la función ignora el 3.er argumento).

- [ ] **Step 3: Implement** en `src/bootstrap/zoom-webhook-worker.ts`: `aplicarAviso` devuelve `{ estado, ocurrenciaId }` (la `ocurrenciaId` sale del `upsert` dentro de la transacción; `null` si se ignora). En `procesarWebhooksZoom`, tras `aplicarAviso` y solo si `aviso.tipo === "meeting.ended"`, `estado === "PROCESADO"` y hay `sincronizarAsistencia`, ejecutar `await sincronizarAsistencia(ocurrenciaId)` **antes** de marcar el aviso `PROCESADO`. Resultado `PENDIENTE` → `throw` de un `Error` con `name = "ReporteZoomPendiente"`; `ERROR` → `Error` con `name = resultado.codigo` (el regex `/^\w{1,60}$/` ya existente lo valida; si no cumple cae en `ERROR_INESPERADO`); `OK`/`CONFLICTO` → continúa. Todo cae en el `catch` ya existente, que aplica `proximoIntento` y `FALLIDO` al agotar intentos.

- [ ] **Step 4: Run to verify they pass** — `npx vitest run test/zoom-webhook-worker.test.ts` → PASS (también los tests previos).

- [ ] **Step 5: Commit** — `git add src/bootstrap/zoom-webhook-worker.ts test/zoom-webhook-worker.test.ts && git commit -m "feat(zoom): sincronizar la asistencia al recibir meeting.ended"`

### Task 2: Cablear el worker y retirar el sondeo de asistencia

**Files:**
- Modify: `src/bootstrap/zoom-archivos.server.ts` (quitar `sincronizarAsistenciaPendiente` del tipo `WorkerZoomArchivos`, de la rama "salud no ok", de la rama activa, el import `sincronizarAsistenciaPendienteZoomUseCase`, `crearPrismaAsistenciaPendienteAdapter` y la constante `LOTE_ASISTENCIA`; pasar la sincronización a `procesarWebhooks`)
- Modify: `scripts/zoom-archivos-worker.ts` (quitar la tarea `"asistencia-pendiente"`)
- Modify: `src/modules/archivos/application/index.ts:16`, `src/modules/archivos/infrastructure/index.ts:16` (quitar los `export *` de lo eliminado)
- Delete: `src/modules/archivos/application/sincronizar-asistencia-pendiente-zoom.use-case.ts`, `src/modules/archivos/infrastructure/prisma/prisma-asistencia-pendiente.adapter.ts`, `test/zoom-asistencia-pendiente.test.ts`

**Interfaces:**
- Consumes: `procesarWebhooksZoom(cuentaZoomId, limite, sincronizarAsistencia)` (Task 1); `sincronizarAsistenciaZoomUseCase`, `crearPrismaSincronizacionAsistenciaZoomAdapter`, `crearPrismaAsistenciaZoomRepositoryAdapter`, `crearZoomAsistenciaProviderAdapter` (ya importados en ese archivo).
- Produces: `WorkerZoomArchivos` sin `sincronizarAsistenciaPendiente`. `procesarWebhooks: () => procesarWebhooksZoom(cuentaZoomId, 25, (id) => sincronizarAsistenciaZoomUseCase(asistencia, id))`, con `asistencia = { sync, repo, provider }` armado como hoy en la rama activa.

- [ ] **Step 1: Cablear** `procesarWebhooks` en la rama activa y retirar el resto como indica *Files*; en la rama "salud no ok" `procesarWebhooks` sigue siendo no-op.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` sin errores; `grep -rn "AsistenciaPendiente\|asistencia-pendiente" src scripts test` sin resultados.
- [ ] **Step 3: Run** `npx vitest run` → todo PASS (ajustar cualquier test de despliegue/worker que mencione la tarea eliminada).
- [ ] **Step 4: Commit** — `git add -A && git commit -m "refactor(zoom): retirar el sondeo de asistencia; el worker usa el webhook"`

### Task 3: Botón de reintento en la ficha

**Files:**
- Modify: `src/components/attendance-regenerate-action.tsx` (exportar `mensajeRegeneracion`; usarlo en `actualizar`)
- Modify: `src/components/zoom-asistencia-vista.tsx` (prop `puedeReintentar?: boolean`, por defecto `false`; renderiza `<AttendanceRegenerateAction instanciaId={instanciaId} />` junto al bloque de ocurrencias cuando es `true` y el estado no es `DISPONIBLE`)
- Modify: `src/bootstrap/ui/reuniones/reunion-zoom-historica.tsx` (pasar `puedeReintentar={rol === "ADMINISTRACION"}`) y los demás consumidores de `ZoomAsistenciaVista` que sean fichas de administración (buscar con `grep -rn "ZoomAsistenciaVista" src app`; la página `.../asistencia/page.tsx` ya tiene su propio botón: no duplicar)
- Test: `test/mensaje-regeneracion.test.ts`

**Interfaces:**
- Produces: `mensajeRegeneracion(data: { estado?: string; resultados?: ReadonlyArray<{ sincronizacion: string }> }): string`.

- [ ] **Step 1: Write the failing test** `test/mensaje-regeneracion.test.ts`:
  - `{ proveedor: "ZOOM", resultados: [{ sincronizacion: "PENDIENTE" }] }` → `"Zoom aún no entregó el reporte. Volvé a intentar más tarde."`
  - `{ resultados: [{ sincronizacion: "PENDIENTE" }, { sincronizacion: "OK" }] }` → `"Sincronización terminada. Actualizando la vista…"`
  - `{ resultados: [{ sincronizacion: "ERROR" }] }` → `"No se pudo sincronizar con Zoom. Volvé a intentar más tarde."`
  - `{ estado: "ARTEFACTOS_PENDIENTES" }` → el mensaje actual de Google.
- [ ] **Step 2: Run** `npx vitest run test/mensaje-regeneracion.test.ts` → FAIL (función inexistente).
- [ ] **Step 3: Implement** `mensajeRegeneracion` y reemplazar el `setEstado(...)` de `actualizar` por `setEstado(mensajeRegeneracion(data))`; agregar la prop y el render en la vista y pasarla desde la ficha histórica.
- [ ] **Step 4: Run** el test → PASS; `npx tsc --noEmit` sin errores.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(zoom): botón de reintento de asistencia en la ficha"`

### Task 4: Verificar y desplegar

**Files:** ninguno nuevo.

- [ ] **Step 1:** `npx vitest run && npx tsc --noEmit` → todo en verde.
- [ ] **Step 2:** Publicar en `main` y desplegar: `bash scripts/deploy-ec2.sh --force`; luego `bash scripts/deploy-ec2.sh --status`.
- [ ] **Step 3:** En la ficha de "Formación BROU" (administración) pulsar el botón y comprobar que cambia el estado o muestra "Zoom aún no entregó el reporte".
- [ ] **Step 4:** Tras la próxima reunión Zoom, por SSH en `servidor-flacso`: `journalctl -u salavirtual-zoom-archivos.service --since today | grep webhooks` debe mostrar el aviso procesado y la asistencia aparecer sin pulsar nada.

## Fuera de alcance / seguimiento
- La ficha de "Formación BROU" sigue en "Realización sin verificar": el vínculo automático ya tolera 45 min de inicio anticipado ([zoom-vinculo-automatico.ts:12](../../../src/modules/archivos/infrastructure/prisma/zoom-vinculo-automatico.ts)), así que la causa es otra (probable `externalEventId` ≠ `meetingId`). Requiere una consulta de solo lectura a la base de producción; se trata aparte.
- Inconsistencias de la ficha histórica (horario real ignora `inicioRealAt`; botón JSON sin reporte).

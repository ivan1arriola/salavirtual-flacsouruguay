# Asistencia en Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los encuentros con Zoom como proveedor activo producen, al terminar, registros de asistencia conciliables y la planilla `LISTA_ASISTENCIA` en Drive, sin tocar los datos de Meet.

**Architecture:** Un cliente de reportes Zoom entrega sesiones de participantes; un dominio puro las agrupa por nombre y calcula minutos/porcentaje; un caso de uso propio (`sincronizarAsistenciaZoomUseCase`) persiste en `RegistroAsistenciaMeet` sin pisar vínculos confirmados y sube la planilla usando el proveedor Google solo para Drive. La conciliación es un caso de uso aparte con API y auditoría.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, Zoom Server-to-Server OAuth, Google Drive/Sheets, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-zoom-asistencia-design.md`

## Global Constraints

- Solo asistencia **posterior**; no tocar la asistencia en vivo (`reunion-operativa.service.ts` lectura de participantes activos).
- Registros y planillas de Meet quedan intactos: `proveedor` por defecto `GOOGLE_MEET`, `estadoConciliacion` por defecto `CONCILIADO`.
- `cumpleNormativa` es verdadero solo con `estadoConciliacion = CONCILIADO` y porcentaje `>= 80` (el umbral que ya usa `reunion-operativa.service.ts:692`).
- Identidad Zoom: nombre mostrado normalizado; ID de usuario Zoom si existe.
- Un vínculo confirmado nunca se pisa en una nueva sincronización.
- El proveedor se elige con `seleccionarEventoProveedorActivo`; no comparar contra `GOOGLE_MEET` en código nuevo de asistencia.
- Respetar `test/architecture-boundaries.test.ts` (capas: domain no importa infrastructure).
- Antes de cada commit: `npm run check` y los tests enfocados. Next.js tiene cambios de API: leer `node_modules/next/dist/docs/` antes de escribir una ruta nueva.

## Review Focus

- Reporte Zoom aún no publicado (404): el evento queda `SIN_REGISTRO_FINALIZADO`, sin error ni borrado de datos.
- Dos participantes con el mismo nombre mostrado: se agrupan en uno; el operador los separa o vincula a mano.
- Persona que se desconecta y vuelve: minutos sumados, `numeroConexiones` correcto, sesiones solapadas no cuentan doble.
- Sesiones que empiezan antes o terminan después del horario programado: minutos recortados a la ventana programada.
- Re-sincronizar después de conciliar: vínculos y `invitadoReunionId` se conservan.
- Host/cohost de Zoom en el reporte: marcados `esHostOCohost` y excluidos del cómputo de normativa de estudiantes.

---

### Task 1: Esquema de conciliación

**Files:**

- Modify: `prisma/schema.prisma` (modelos `RegistroAsistenciaMeet`, `InvitadoReunion`)
- Create: `prisma/migrations/20261103000000_asistencia_zoom_conciliacion/migration.sql`
- Test: `test/schema-contract.test.ts`

**Interfaces:**

- Produces: columnas `RegistroAsistenciaMeet.proveedor String @default("GOOGLE_MEET")`, `estadoConciliacion String @default("CONCILIADO")`, `invitadoReunionId String?` (relación a `InvitadoReunion`, `onDelete: SetNull`), `@@index([instanciaSalaId, estadoConciliacion])`; relación inversa `registrosAsistencia RegistroAsistenciaMeet[]` en `InvitadoReunion`.

- [ ] **Step 1: Failing test** en `test/schema-contract.test.ts`: el esquema contiene los tres campos en `RegistroAsistenciaMeet` con los defaults `GOOGLE_MEET` y `CONCILIADO`, y la migración incluye `ADD COLUMN` para cada uno.
- [ ] **Step 2:** `npx vitest run test/schema-contract.test.ts` → FAIL.
- [ ] **Step 3:** Editar `schema.prisma` y escribir la migración SQL (columnas con DEFAULT para que las filas existentes queden `GOOGLE_MEET`/`CONCILIADO`; FK con `ON DELETE SET NULL`; índice).
- [ ] **Step 4:** `npx prisma generate` y `npx vitest run test/schema-contract.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat: campos de conciliación en RegistroAsistenciaMeet`.

### Task 2: Cliente de reportes Zoom

**Files:**

- Create: `src/integrations/zoom/zoom-reports.client.ts`
- Test: `test/zoom-reports-client.test.ts`

**Interfaces:**

- Consumes: `obtenerZoomAccessToken(creds: ZoomCredentials): Promise<string>` de `zoom-client.ts`.
- Produces:
  - `type ZoomSesionParticipante = Readonly<{ participantId: string | null; userId: string | null; nombre: string; email: string | null; joinTime: Date; leaveTime: Date }>`
  - `listarParticipantesReunionPasadaZoomHttp(token: string, meetingId: string): Promise<readonly ZoomSesionParticipante[] | null>` — `null` si Zoom responde 404 (reporte aún no disponible).

- [ ] **Step 1: Failing tests** con `fetch` simulado: (a) dos páginas con `next_page_token` devuelven las sesiones concatenadas (`page_size=300`); (b) 404 devuelve `null`; (c) respuesta sin participantes devuelve `[]`; (d) 5xx lanza `Error` con el status; (e) campos vacíos (`user_email: ""`) se mapean a `null`.
- [ ] **Step 2:** Correr → FAIL.
- [ ] **Step 3:** Implementar contra `GET https://api.zoom.us/v2/past_meetings/{meetingId}/participants`, con `meetingId` codificado, siguiendo el estilo de `zoom-client.ts`.
- [ ] **Step 4:** Correr → PASS. **Step 5: Commit** `feat: cliente de reportes de participantes Zoom`.

### Task 3: Dominio de agrupamiento y cálculo

**Files:**

- Create: `src/modules/archivos/domain/asistencia-zoom.domain.ts` (exportar desde `domain/index.ts`)
- Test: `test/asistencia-zoom-domain.test.ts`

**Interfaces:**

- Produces:
  - `normalizarNombreParticipante(nombre: string): string` — minúsculas, sin acentos, espacios colapsados.
  - `claveParticipanteZoom(sesion: { userId: string | null; nombre: string }): string` — `zoom:user:{userId}` si hay ID, si no `zoom:nombre:{normalizado}`.
  - `ParticipanteAsistenciaZoom = Readonly<{ claveParticipante: string; nombre: string; email: string | null; primeraEntradaAt: Date; ultimaSalidaAt: Date; minutosConectado: number; porcentajeAsistencia: number; numeroConexiones: number; esHostOCohost: boolean }>`
  - `agruparSesionesZoom(sesiones: readonly ZoomSesionParticipante[], ventana: { inicio: Date; fin: Date }, hostEmails: readonly string[]): readonly ParticipanteAsistenciaZoom[]`
  - `sugerirVinculos(participantes: readonly { claveParticipante: string; nombre: string }[], invitados: readonly { id: string; email: string; nombre: string | null }[], previos: ReadonlyMap<string, string>): ReadonlyMap<string, string>` — clave → `invitadoReunionId` sugerido; `previos` son vínculos confirmados de la serie.

- [ ] **Step 1: Failing tests:** acentos/mayúsculas normalizan igual; tres sesiones del mismo usuario suman minutos y `numeroConexiones = 3`; sesiones solapadas no cuentan doble (se unen intervalos); sesión previa al inicio se recorta a la ventana; porcentaje = minutos / duración programada × 100 con dos decimales y tope 100; participante cuyo email está en `hostEmails` queda `esHostOCohost = true`; `sugerirVinculos` usa `previos` primero y luego coincidencia exacta de nombre normalizado, y no sugiere si hay dos invitados con el mismo nombre normalizado.
- [ ] **Step 2:** Correr → FAIL. **Step 3:** Implementar (unión de intervalos para solapamientos). **Step 4:** PASS. **Step 5: Commit** `feat: dominio de asistencia Zoom`.

### Task 4: Persistencia sin pisar vínculos

**Files:**

- Modify: `src/modules/archivos/ports/archivos-repository.port.ts`, `src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter.ts`
- Test: `test/archivos-asistencia-zoom-repository.test.ts` (estilo de `test/archivos-infrastructure.test.ts`)

**Interfaces:**

- Produces en `ArchivosRepositoryPort`:
  - `type EventoZoomParaAsistencia = Readonly<{ id: string; instanciaSalaId: string; zoomMeetingId: string; emailOrganizador: string | null; hostEmails: readonly string[]; inicioProgramadoAt: Date; finProgramadoAt: Date; timezone: string; tituloSolicitud: string; archivos: readonly ArchivoExistente[]; asistenciaDriveFileId: string | null; invitados: readonly { id: string; email: string; nombre: string | null }[] }>`
  - `obtenerEventosZoomParaAsistencia(eventoProveedorIds: readonly string[]): Promise<readonly EventoZoomParaAsistencia[]>` — filtra `proveedor.tipo = "ZOOM"`; `zoomMeetingId` es `externalEventId`.
  - `guardarAsistenciaZoom(instanciaSalaId: string, participantes: readonly (ParticipanteAsistenciaZoom & { estadoConciliacion: "SUGERIDO" | "SIN_IDENTIFICAR"; invitadoReunionId: string | null })[]): Promise<void>` — upsert por `instanciaSalaId_claveParticipante` con `proveedor: "ZOOM"`; si el registro existente ya está `CONCILIADO`, solo actualiza minutos/entradas/salidas y conserva `estadoConciliacion`, `invitadoReunionId`, `email` y `nombre`.
  - `listarAsistenciaInstancia(instanciaSalaId: string): Promise<readonly RegistroAsistenciaZoom[]>` — `RegistroAsistenciaZoom` incluye los campos del modelo más `estadoConciliacion` e `invitadoReunionId`.
  - `vinculosConfirmadosDeSerie(instanciaSalaId: string): Promise<ReadonlyMap<string, string>>` — clave participante → `invitadoReunionId` en otras instancias de la misma solicitud.

- [ ] **Step 1: Failing tests** con el doble de `db` del estilo existente: re-guardar con un registro `CONCILIADO` no cambia su estado ni su `invitadoReunionId`; un registro nuevo entra `SUGERIDO` o `SIN_IDENTIFICAR`; `obtenerEventosZoomParaAsistencia` ignora eventos Meet; registros de Meet no se tocan.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar port y adapter. **Step 4:** PASS. **Step 5: Commit** `feat: persistencia de asistencia Zoom`.

### Task 5: Sincronización de asistencia Zoom y planilla

**Files:**

- Create: `src/modules/archivos/application/sincronizar-asistencia-zoom.use-case.ts` (exportar desde `application/index.ts`)
- Modify: `src/bootstrap/archivos.server.ts`, `src/modules/archivos/application/seleccionar-eventos-operativos.use-case.ts` (incluir eventos Zoom terminados)
- Test: `test/sincronizar-asistencia-zoom.test.ts`

**Interfaces:**

- Consumes: `listarParticipantesReunionPasadaZoomHttp`, `agruparSesionesZoom`, `sugerirVinculos`, los métodos de la Task 4, `ArtifactProviderFactory` (solo `obtenerOCrearCarpeta` y `subirPlanillaAsistencia`).
- Produces: `sincronizarAsistenciaZoomUseCase(repositorio: ArchivosRepositoryPort, obtenerReporte: (zoomMeetingId: string) => Promise<readonly ZoomSesionParticipante[] | null>, providerFactory: ArtifactProviderFactory, descifrar: (c: string) => string, input: { eventoProveedorIds: readonly string[] }): Promise<readonly SyncArtifactsResult[]>`; y `construirPlanillaAsistenciaZoom(registros: readonly RegistroAsistenciaZoom[]): NonNullable<MeetAttendanceDocument["planilla"]>` (puro, mismo archivo de dominio de la Task 3 o contiguo): una sesión por participante en `sesionesMeet` con `tipo: "MEET"` (compatibilidad con `construirVistaAsistencia`; el renombre es del sub-proyecto 3) y `correosAuditados` solo con los `CONCILIADO` que tienen email; `eventosAuditoria: []`.
- Bootstrap: `sincronizarAsistenciaZoom(eventoProveedorIds: readonly string[])`, y `sincronizarArtefactosOperativos` la invoca para los eventos Zoom del lote.

- [ ] **Step 1: Failing tests:** reporte `null` → resultado `SIN_REGISTRO_FINALIZADO` y nada escrito; reporte con sesiones → `guardarAsistenciaZoom` llamado una vez y planilla subida con `asistenciaDriveFileId` previo si existe; error de Zoom → `registrarErrorSincronizacion` y resultado `ERROR` sin llamar a `guardarAsistenciaZoom`; el caso de uso nunca exige `codigoReunion`; la subida usa como `subject` la cuenta del Workspace principal (`serviceAccountSubject`), no un correo de host Google.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar; si faltan credenciales de Workspace devolver `ERROR` por evento, igual que el caso de uso de Meet. **Step 4:** PASS. **Step 5: Commit** `feat: sincronización de asistencia Zoom con planilla`.

### Task 6: Conciliación

**Files:**

- Create: `src/modules/archivos/application/conciliar-asistencia-zoom.use-case.ts`, `app/api/v1/reuniones/instancias/[instanciaId]/asistencia/conciliar/route.ts`
- Test: `test/conciliar-asistencia-zoom.test.ts`

**Interfaces:**

- Produces: `conciliarAsistenciaZoomUseCase(deps, input: { instanciaSalaId: string; claveParticipante: string; accion: { tipo: "VINCULAR"; invitadoReunionId: string } | { tipo: "EXTERNO" } | { tipo: "DESVINCULAR" }; actorId: string }): Promise<RegistroAsistenciaZoom>`; `VINCULAR` y `EXTERNO` dejan `CONCILIADO` (con `email` e `invitadoReunionId` del invitado, o `externo = true` sin invitado); `DESVINCULAR` vuelve a `SIN_IDENTIFICAR`. Cada acción escribe una fila en `Auditoria`. Al terminar regenera la planilla (`sincronizarAsistenciaZoom` con `asistenciaDriveFileId` existente).
- La ruta valida con el esquema del estilo de las rutas vecinas y autoriza al docente de la instancia o a admin con la misma verificación que usan las demás rutas de `instancias`.

- [ ] **Step 1: Failing tests:** vincular a un invitado de otra instancia → rechazo; docente de otra reunión → 403; `VINCULAR` deja `CONCILIADO` y recalcula `cumpleNormativa` con el umbral 80; `DESVINCULAR` vuelve a `SIN_IDENTIFICAR` y `cumpleNormativa = false`; cada acción crea `Auditoria`; registro de Meet → rechazo.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar caso de uso y ruta. **Step 4:** PASS. **Step 5: Commit** `feat: conciliación de asistencia Zoom`.

### Task 7: Interfaz de conciliación y vista

**Files:**

- Create: `src/components/asistencia-zoom-conciliacion.tsx`
- Modify: detalle de reunión (`src/bootstrap/ui/reuniones/reunion-detail-page.server.tsx` y componente cliente asociado), `src/modules/archivos/domain/attendance-view.domain.ts` y `attendance-raw-export.domain.ts` (columna de conciliación)
- Test: `test/asistencia-zoom-conciliacion-ui.test.ts`, ampliar el test de vista existente en `test/archivos-domain.test.ts`

**Interfaces:**

- Consumes: la ruta de la Task 6 y `listarAsistenciaInstancia`.
- Produces: componente que lista los participantes Zoom con estado (`CONCILIADO`/`SUGERIDO`/`SIN_IDENTIFICAR`), un selector de invitado, "Marcar externo" y "Desvincular"; visible solo si el evento activo es Zoom. `FilaVistaAsistencia` gana `estadoConciliacion?: "CONCILIADO" | "SUGERIDO" | "SIN_IDENTIFICAR"`; las exportaciones agregan esa columna para filas Zoom y no cambian para filas Meet.

- [ ] **Step 1: Failing tests:** el componente aparece solo con evento activo Zoom (usar `seleccionarEventoProveedorActivo`); las filas `SIN_IDENTIFICAR` se muestran aparte; la exportación de una reunión Meet es idéntica a la actual (snapshot del encabezado); la de Zoom incluye la columna.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar siguiendo `docs/ui-ligera.md` y el estilo de `src/components/attendance-regenerate-action.tsx`. **Step 4:** PASS. **Step 5: Commit** `feat: interfaz de conciliación de asistencia Zoom`.

### Task 8: Verificación y salida

**Files:** `docs/migracion-desde-flacso-zoom.md` (nota operativa)

- [ ] **Step 1:** Confirmar en la app Zoom el scope `report:read:admin` (o `meeting:read:list_past_participants`) y que `GET /past_meetings/{id}/participants` responde 200 para una reunión real terminada. Si responde 401/403 detener: el spec no es implementable sin ese acceso.
- [ ] **Step 2:** `npm run check`, `npm test` y `npm run build` limpios.
- [ ] **Step 3:** Reunión Zoom de prueba con dos participantes (uno entra dos veces): verificar registros, planilla en Drive, vista y exportación; conciliar uno y re-sincronizar para confirmar que el vínculo se conserva.
- [ ] **Step 4:** Agregar la nota operativa (scope requerido, flujo de conciliación) y commit `docs: operativa de asistencia Zoom`.

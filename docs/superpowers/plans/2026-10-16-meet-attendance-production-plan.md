# Meet Attendance Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce and safely regenerate one complete Google Sheet attendance record for each Meet encounter, with verified identities, accurate intervals, and durable recovery.

**Architecture:** Keep calculations in pure `archivos/domain` functions, Reports API and Sheets calls in Google infrastructure adapters, and orchestration in the existing application use case. Use the existing encrypted Workspace service account and durable Google operation table; preserve the spreadsheet ID on regeneration.

**Tech Stack:** Node.js 24, TypeScript 5.9, Vitest 4, Prisma 6, `google-auth-library` 11, Google Meet API, Admin SDK Reports API, Sheets API, Drive API.

**Spec:** `docs/superpowers/specs/2026-10-16-asistencia-meet-produccion-design.md`

## Global Constraints

- Use `America/Montevideo` for displayed connection times.
- Publish the tabs `Asistencia`, `Host y cohosts` and `Datos brutos`.
- Recover identity only when Reports API returns `identifier_type=email_address`.
- Reuse the encrypted service account and domain-wide delegation; add no credentials.
- Do not infer email from names or merge events from different conference instances.
- Do not deploy; merge to `main` only after all checks are correct.

## Review Focus

- Overlapping, reversed, empty, or out-of-schedule intervals must produce bounded union time; pin in Task 1 with `resumirIntervalosAsistencia recorta y une intervalos`.
- Adjacent conferences reusing one code must not share audit events; pin in Task 2 with `aisla eventos de auditoría por intervalo de conferencia`.
- Missing or non-email identifiers must remain raw and unattributed; pin in Task 2 with `conserva identificadores no verificables sin asignar correo`.
- A failed Sheets create after remote acceptance must not create a second spreadsheet on retry; pin in Task 3 with `recupera creación incierta sin duplicar hojas`.
- Updating an old sheet with fewer rows must remove stale rows while preserving its file ID; pin in Task 3 with `regenera planilla existente en el mismo ID y limpia filas antiguas`.

---

### Task 1: Pure interval and code normalization

**Files:**
- Create: `src/modules/archivos/domain/meet-attendance-summary.domain.ts`
- Modify: `src/modules/archivos/domain/index.ts`
- Test: `test/meet-attendance-summary.test.ts`

**Interfaces:**
- Produces `resumirIntervalosAsistencia(intervalos: readonly { inicio: string; fin: string }[], inicioProgramadoAt: Date, finProgramadoAt: Date): ResumenIntervalosAsistencia`, where the result has `primeraConexion: string | null`, `ultimaDesconexion: string | null`, `minutosConectados: number`, `porcentaje: number`, `cumpleCincoSextos: boolean`, and `conexiones: number`.
- Produces `normalizarCodigoMeet(codigo: string): string`, lowercasing and removing separators for comparisons; raw values remain unchanged in exports.

- [ ] **Step 1: Write failing unit tests** for overlapping reconnects, clipped intervals, outside-schedule connections, invalid windows, exact 5/6 threshold, and codes with/without hyphens.
- [ ] **Step 2: Run** `npm test -- test/meet-attendance-summary.test.ts --reporter=dot`; confirm failures are missing behavior.
- [ ] **Step 3: Implement** both pure functions in the domain file and export them.
- [ ] **Step 4: Re-run** the targeted test; confirm all cases pass.
- [ ] **Step 5: Commit** as `feat: add verified attendance interval summary`.

### Task 2: Reports API events and conference isolation

**Files:**
- Modify: `src/modules/archivos/infrastructure/google/google-meet-audit-emails.client.ts`
- Modify: `src/modules/archivos/infrastructure/google/google-artifacts-provider.adapter.ts`
- Test: `test/google-meet-audit-emails.test.ts`
- Test: `test/google-api-retry.test.ts`

**Interfaces:**
- Produces `EventoAuditoriaMeet` with original `conference_id`, `endpoint_id`, `meeting_code`, `identifier`, `identifier_type`, display name, event timestamp, duration, and original parameters.
- Produces `obtenerEventosAuditoriaMeet(input): Promise<readonly EventoAuditoriaMeet[]>`; retain existing retry semantics and paginate every Reports response.
- Consumes Task 1 `normalizarCodigoMeet` and `resumirIntervalosAsistencia`.

- [ ] **Step 1: Write failing tests** named `página todos los eventos call_ended y conserva campos originales`, `acepta códigos con y sin guiones`, `aisla eventos de auditoría por intervalo de conferencia`, `conserva identificadores no verificables sin asignar correo`, and retry cases for permission `403`, rate-limit `429`, transient `5xx`, and timeout.
- [ ] **Step 2: Run** `npm test -- test/google-meet-audit-emails.test.ts test/google-api-retry.test.ts --reporter=dot`; confirm the new assertions fail.
- [ ] **Step 3: Implement** ungrouped event parsing first; only group verified email events after matching the specific conference and scheduled instance. Keep ambiguous events in raw data only.
- [ ] **Step 4: Re-run** both targeted test files.
- [ ] **Step 5: Commit** as `fix: isolate Meet audit attendance by conference`.

### Task 3: Three-tab sheet, safe updates, and durable recovery

**Files:**
- Modify: `src/modules/archivos/infrastructure/google/google-meet-attendance-sheets.client.ts`
- Modify: `src/modules/archivos/infrastructure/google/google-artifacts-provider.adapter.ts`
- Modify: `src/modules/operaciones/google-operaciones-externas.service.ts` only if the existing operation contract needs a recovery hook
- Test: `test/google-meet-attendance-sheets.test.ts`
- Test: `test/google-durable-operations-postgres.test.ts`

**Interfaces:**
- Produces `crearOActualizarPlanillaAsistenciaGoogle(auth: JWT, input: MeetSheetInput, spreadsheetId?: string): Promise<MovedDriveFile>`.
- For a new file, use the existing durable one-shot operation and a deterministic Drive reconciliation marker. For an existing file, write to its current ID and clear cells beyond the new row count.
- The summary uses Task 1 results; raw rows retain original Meet and Reports identifiers. Text cells beginning with spreadsheet formula characters remain escaped.

- [ ] **Step 1: Write failing tests** named `crea tres pestañas y aplica formato horario y mapa de calor`, `separa host y cohosts configurados de asistencia de estudiantes`, `exporta identificadores originales en Datos brutos`, `coloca la planilla en la carpeta del encuentro`, `regenera planilla existente en el mismo ID y limpia filas antiguas`, `escapa texto que podría ejecutarse como fórmula`, and `recupera creación incierta sin duplicar hojas`.
- [ ] **Step 2: Run** `npm test -- test/google-meet-attendance-sheets.test.ts --reporter=dot`; confirm expected request body, updates, and failures.
- [ ] **Step 3: Implement** create/update request construction, raw data mapping, conditional formatting, and deterministic recovery without blind retries of writes.
- [ ] **Step 4: Re-run** the sheet and durable-operation tests; run the PostgreSQL integration test only when `MEET_HISTORY_DATABASE_TEST=1` and its test database is configured.
- [ ] **Step 5: Commit** as `feat: update Meet attendance sheets idempotently`.

### Task 4: Synchronization, historical regeneration, and Workspace documentation

**Files:**
- Modify: `src/modules/archivos/application/sincronizar-artefactos.use-case.ts`
- Modify: `src/modules/archivos/ports/artifact-provider.port.ts`
- Modify: `src/modules/archivos/ports/archivos-repository.port.ts`
- Modify: `src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter.ts`
- Create: `app/api/v1/reuniones/instancias/[instanciaId]/asistencia/regenerar/route.ts`
- Modify: `docs/configuracion-google-workspace.md`
- Test: `test/sincronizar-artefactos-service.test.ts`
- Test: `test/regenerar-asistencia-route.test.ts`

**Interfaces:**
- Add an explicit `regenerarAsistencia?: boolean` option to the internal synchronization input; keep normal scheduled synchronization behavior unchanged.
- Include the registered attendance `driveFileId` in `EventoParaSincronizarArchivos` so the application can update the existing spreadsheet.
- The regeneration route accepts an instance ID, requires an active `ADMINISTRACION` actor, finds that instance's Meet event, and invokes synchronization with `regenerarAsistencia: true`.

- [ ] **Step 1: Write failing tests** named `mantiene la creación de reunión independiente de Reports API`, `deja asistencia reintentable ante fallo de auditoría`, `actualiza la planilla registrada al regenerar una instancia antigua`, `reintenta la planilla fallida sin volver a crear otros artefactos`, `rechaza regeneración sin rol de administración`, and `no registra correos ni secretos al informar errores`.
- [ ] **Step 2: Run** `npm test -- test/sincronizar-artefactos-service.test.ts test/regenerar-asistencia-route.test.ts --reporter=dot`; confirm failures match the missing behavior.
- [ ] **Step 3: Implement** the opt-in regeneration path and authorization. Reuse existing files and operation records; keep a Reports failure retryable without publishing partial attendance.
- [ ] **Step 4: Update** Workspace documentation with enabled APIs, exact scopes, delegated admin setting, Drive access, permission error handling, and the limits of email visibility.
- [ ] **Step 5: Run** targeted tests and `npm run check`; commit as `feat: support authorized Meet attendance regeneration`.

### Task 5: Baseline repairs and attendance regression suite

**Files:**
- Modify: `test/archivos-infrastructure.test.ts`
- Modify: `test/sincronizar-artefactos-service.test.ts`
- Modify only if required to fix a proven false positive: `test/functional-architecture.test.ts` or the implicated use-case source files.

- [ ] **Step 1: Reproduce** the current baseline failures after Prisma generation with `npm test -- --reporter=dot`; capture each failing assertion before changing it.
- [ ] **Step 2: Add/repair** fixtures for configured and linked cohosts; add regression assertions that match the approved attendance behavior.
- [ ] **Step 3: Investigate** each functional-architecture failure. Change its test or source only after demonstrating whether it is a false positive or a real layering/purity violation; do not suppress unrelated checks.
- [ ] **Step 4: Run** all attendance, archive-infrastructure, and functional-architecture tests; then run `npm run check`, `npm test -- --reporter=dot`, and `npm run build`.
- [ ] **Step 5: Commit** as `test: cover Meet attendance production regressions`.


# Asistencia híbrida con horarios exactos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Terminar e integrar la rama remota que separa el horario de actividad/Meet del intervalo presencial de asistencia técnica, usando ese intervalo completo para horas y pagos.

**Architecture:** Mantener la configuración base en `SolicitudSala` y los overrides efectivos en `InstanciaSala`. Los servicios de reuniones, asistencia, Calendar, dashboards, APIs móviles y liquidaciones consumirán una única resolución de modalidad/horarios efectivos; Calendar podrá mostrar segmentos técnicos relacionados sin crear otra reunión ni entidad de dominio.

**Tech Stack:** Next.js 16, TypeScript, Prisma, PostgreSQL, Google Calendar/Meet, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-01-asistencia-hibrida-horarios-design.md`

## Global Constraints

- Para una asistencia presencial o híbrida, las horas trabajadas y el pago se calculan siempre con el intervalo técnico completo: desde la hora en que el asistente debe presentarse hasta la hora en que debe retirarse.
- El horario de la actividad/Meet se muestra y se reporta por separado; no recorta ni sustituye el intervalo usado para liquidar.
- Los overrides se guardan solo en el encuentro puntual y pueden restablecerse a los valores de la serie.
- Los encuentros históricos siguen siendo válidos; la migración no modifica datos fuera de los campos nuevos.
- No se crean entidades paralelas para preparación/cierre.

## Review Focus

- Híbrida con asistencia 09:00–14:00 y Meet 11:00–13:30: liquidar 5 h, mostrar Meet separado y no 2 h 30 min.
- Override puntual virtual dentro de una serie híbrida: no crear ni conservar segmentos técnicos.
- Override puntual híbrido sin intervalo técnico completo: rechazarlo antes de asignar o liquidar.
- Re-sincronización después de cambiar/restablecer horario: eliminar segmentos obsoletos sin duplicar el Meet.
- Encuentro histórico sin horarios técnicos: conservar el comportamiento anterior y no romper APIs ni reportes.

---

### Task 1: Integrar y auditar la rama remota funcional

**Files:**

- Modify: `main` by fast-forwarding to `origin/feature/asistencia-hibrida-horarios` after review
- Inspect: all files changed by the remote branch
- Test: existing project test suite and schema validation

**Interfaces:**

- Consumes: `origin/main`, `origin/feature/asistencia-hibrida-horarios`
- Produces: local branch containing the remote implementation and a bounded list of remaining defects

- [ ] **Step 1: Fetch and verify ancestry**

Run `git fetch --all --prune`, verify the feature branch contains `origin/main`, and preserve unrelated remote branches.

- [ ] **Step 2: Run the branch baseline checks**

Run `npm ci`, `npm run validate:schema`, `npm run check`, and focused hybrid-assistance tests on an isolated branch/worktree. Record failures before changing code.

- [ ] **Step 3: Review the effective-hour and payment paths**

Trace `src/modules/reuniones`, `src/modules/asistencia`, `src/modules/liquidaciones`, dashboards, and APIs to identify any path still using the Meet interval instead of the full technical interval.

- [ ] **Step 4: Commit only bounded audit fixes**

Do not rewrite or merge unrelated remote branches; keep the change limited to this specification.

### Task 2: Enforce effective schedule and full technical-hour calculation

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `prisma/sql/add-asistencia-hibrida-horarios.sql`
- Modify: `src/modules/reuniones/encuentros.domain.ts`
- Modify: `src/modules/reuniones/reuniones.domain.ts`
- Modify: `src/modules/asistencia/domain/asistencia.types.ts`
- Modify: `src/modules/asistencia/domain/asignacion-sugerencias.domain.ts`
- Modify: `src/modules/asistencia/asistencia.service.ts`
- Modify: `src/modules/asistencia/reserva-asistencia.service.ts`
- Modify: `src/modules/liquidaciones/infrastructure/prisma/prisma-liquidaciones-repository.adapter.ts`
- Test: `test/encuentros-domain.test.ts`, `test/reuniones-domain.test.ts`, `test/asignacion-sugerencias-domain.test.ts`

**Interfaces:**

- Consumes: `modalidadOverride`, `inicioAsistenciaTecnicaAt`, `finAsistenciaTecnicaAt`
- Produces: effective schedule values and payment records whose duration is `finAsistencia - inicioAsistencia` for presencial/híbrida coverage

- [ ] **Step 1: Add failing domain/payment cases**

Pin the 09:00–14:00 technical interval versus the 11:00–13:30 activity interval, plus virtual, missing interval, and reset cases.

- [ ] **Step 2: Implement the minimal effective-schedule resolution**

Use encounter overrides when present; otherwise use series values. Require a complete valid technical interval wherever presencial/híbrida assistance is assigned or liquidated.

- [ ] **Step 3: Make liquidations use the technical interval**

Ensure summaries, tariffs, monthly reports, and exported payment plans use the full presentation-to-departure interval and never derive paid hours from Meet duration.

- [ ] **Step 4: Run focused tests**

Run the domain, assistance, and liquidation tests and verify the 5-hour example passes.

### Task 3: Keep Calendar segments related and idempotent

**Files:**

- Modify: `src/modules/asistencia/application/sincronizar-calendario-instancia.use-case.ts`
- Modify: `src/modules/asistencia/infrastructure/google/google-assistant-calendar-provider.adapter.ts`
- Modify: `src/modules/asistencia/infrastructure/prisma/prisma-assistant-calendar-repository.adapter.ts`
- Modify: `src/modules/asistencia/domain/calendario-asistente.domain.ts`
- Modify: `src/modules/asistencia/ports/assistant-calendar-provider.port.ts`
- Test: `test/calendario-asistente-application.test.ts`, `test/calendario-asistente-domain.test.ts`, `test/calendario-asistente-infrastructure.test.ts`

**Interfaces:**

- Consumes: effective activity interval and effective technical interval from Task 2
- Produces: stable preparation/coverage/closure event identifiers, cleanup of obsolete segments, and one Meet event without duplication

- [ ] **Step 1: Add failing synchronization cases**

Cover technical time before and after Meet, technical time equal to Meet, virtual override, schedule changes, reset, and repeated synchronization.

- [ ] **Step 2: Implement segment generation and cleanup**

Create only the technical segments required by the interval difference, retain the Meet separately, and remove stale technical segments when the assignment or interval changes.

- [ ] **Step 3: Run Calendar-focused tests**

Verify idempotency, stable IDs, and no duplicated Meet event.

### Task 4: Finish Admin controls and effective-hour presentation

**Files:**

- Modify: `src/modules/reuniones/gestionar-encuentros.service.ts`
- Modify: `src/modules/reuniones/presentation/components/meeting-detail-manager.tsx`
- Modify: `src/modules/reuniones/presentation/components/meeting-form-v2.tsx`
- Modify: `src/bootstrap/ui/reuniones/reunion-detail-page.server.tsx`
- Modify: `app/(gestion)/reuniones/page.tsx`
- Test: `test/encuentros-domain.test.ts`, relevant meeting-management tests or new focused test

**Interfaces:**

- Consumes: effective schedule and synchronization operations from Tasks 2–3
- Produces: explicit puntual actions for modality, assistance interval, reset, and labels showing personalized configuration

- [ ] **Step 1: Add failing action/authorization cases**

Cover save-only-this-encounter, reset-to-series, virtual without technical schedule, hybrid requiring exact arrival/departure, and permission rejection.

- [ ] **Step 2: Implement or correct server actions**

Validate exact local times, persist only the selected `InstanciaSala`, trigger reconciliation, and preserve the existing authorization boundary.

- [ ] **Step 3: Implement or correct the admin controls**

Keep the labels explicit, show the activity/Meet interval separately from the technical interval, and mark personalized encounters.

- [ ] **Step 4: Run focused UI/service tests and inspect the rendered flow locally**

Verify creation, editing, reset, and the 09:00–14:00 / 11:00–13:30 presentation.

### Task 5: Update dependent contracts and publish

**Files:**

- Modify: `src/bootstrap/ui/asistencia/agenda-abierta-page.server.tsx`
- Modify: `src/bootstrap/ui/asistencia/asistencia-tecnica-page.server.tsx`
- Modify: `src/bootstrap/ui/asistencia/mi-agenda-page.server.tsx`
- Modify: `src/modules/asistencia/dashboard-asistente.adapter.ts`
- Modify: `src/modules/dashboard/admin-dashboard.adapter.ts`
- Modify: `src/modules/dashboard/assistant-dashboard.adapter.ts`
- Modify: `src/modules/dashboard/teacher-dashboard.adapter.ts`
- Modify: `src/modules/mobile-admin/contracts.ts`
- Modify: `src/modules/mobile-admin/queries.adapter.ts`
- Modify: `app/api/v1/mobile/agenda-abierta/route.ts`
- Modify: `app/api/v1/mobile/reuniones/route.ts`
- Test: full `test/` suite and CI-equivalent local checks

**Interfaces:**

- Consumes: effective schedule contract from Tasks 2–4
- Produces: consistent activity and technical intervals across web, mobile, dashboards, availability, and payment reporting

- [ ] **Step 1: Add or update contract assertions**

Assert that consumers expose both activity/Meet and technical intervals and that financial consumers use technical duration.

- [ ] **Step 2: Run complete validation**

Run `npm ci`, `npm run validate:schema`, `npm run check`, `npm test`, and `npm run build`.

- [ ] **Step 3: Review the final diff and commit**

Create a descriptive commit containing only this feature and the approved specification/plan if they are part of the publication scope.

- [ ] **Step 4: Fast-forward `main` and push**

Advance local `main` to the validated feature commit with fast-forward only, push `origin/main`, and verify exact SHA and clean status.

- [ ] **Step 5: Report publication separately from CI/deployment**

Inspect the final CI result. Do not claim production deployment or live health unless the deployment workflow and service checks provide evidence.

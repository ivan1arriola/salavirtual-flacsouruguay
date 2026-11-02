# Zoom Primary Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all new meetings in Zoom and convert future Meet encounters to Zoom, except encounters explicitly marked to remain in Meet.

**Architecture:** Keep provider events as historical records and add an explicit active provider to each encounter. A read-only preview computes eligibility and Zoom host capacity; an idempotent worker creates Zoom, updates the existing Calendar invitation, then switches the active provider and sends deduplicated notices.

**Tech Stack:** Next.js 16, TypeScript, Prisma/PostgreSQL, Zoom Server-to-Server OAuth, Google Calendar API, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-zoom-primary-migration-design.md`

## Global Constraints

- No new Google Meet creation through UI or API.
- Existing past meetings and Meet attendance/recording records remain readable.
- `sala01` through `sala09@flacso.edu.uy` are the intended licensed Zoom hosts.
- Bulk migration must support preview, per-encounter exceptions, idempotent retries, and a one-encounter pilot.
- Do not publish `start_url` or any OAuth credential to attendees.

## Review Focus

- A client sending `GOOGLE_MEET` directly to the create API receives validation failure.
- An encounter starting during preview cannot be migrated when apply runs later.
- An exception sharing its Meet code with a migrated encounter keeps its Meet access.
- A Zoom creation timeout followed by retry does not create a second Zoom meeting.
- A Calendar update failure leaves Meet as the active link and reports a retryable error.

---

### Task 1: Reliable Zoom creation and Zoom-only new meetings

**Files:** `src/modules/reuniones/reuniones.domain.ts`, `src/modules/reuniones/crear-reuniones.service.ts`, `src/modules/reuniones/presentation/components/meeting-form-v2.tsx`, `src/modules/conferencias/application/provisionar-conferencias.use-case.ts`, `src/integrations/zoom/zoom-client.ts`, `app/api/v1/reuniones/route.ts`, focused tests.

- [ ] Test server rejection of new Meet requests and successful Zoom creation without a Google account for the docente.
- [ ] Remove the Meet choice from the creation form and its stale Meet-specific copy.
- [ ] Use Zoom host capacity, real recording setting and real `join_url`; select the Zoom event for creation notices.
- [ ] Run focused tests and `npm run check`.

### Task 2: Configure the nine Zoom hosts

**Files:** `src/components/meet-hosts-config.tsx`, `app/api/v1/configuracion/salas-meet/route.ts`, focused tests.

- [ ] Test Zoom host creation without a password while Meet still requires one.
- [ ] Label the Zoom host email correctly and save the host without a per-user secret.
- [ ] Run focused tests and `npm run check`.
- [ ] After deployment, register the nine licensed hosts and verify each through Zoom `GET /users/{email}` before enabling batch conversion.

### Task 3: Active provider and exception flag

**Files:** `prisma/schema.prisma`, new `prisma/migrations/.../migration.sql`, `src/modules/reuniones/` shared provider selector, agenda/detail/mobile/notices/recorders that currently hardcode `GOOGLE_MEET`, focused tests.

- [ ] Test that a legacy Meet encounter remains active Meet, a newly created Zoom encounter is active Zoom, and an encounter holding both events returns the explicit active event.
- [ ] Add `proveedorActivoTipo` and `conservarGoogleMeet` to `InstanciaSala`, backfill existing rows, and create a single selector for the active event.
- [ ] Replace user-facing Meet-only event selection with the selector; keep Meet-specific historical artifact queries explicit.
- [ ] Run selector and presentation tests, `npm run check`, and `npm run build`.

### Task 4: Exception marking and read-only preview

**Files:** admin encounter list/detail UI, new admin route(s) under `app/api/v1/reuniones/`, preview service under `src/modules/reuniones/`, focused tests.

- [ ] Test exception editing only for future programmed encounters with active Meet.
- [ ] Add the `Conservar en Google Meet` control and reason field, with audit entry.
- [ ] Test a deterministic preview covering exceptions, existing Zoom meetings, near/live meetings, missing hosts, and simultaneous host collisions.
- [ ] Display counts and per-encounter proposed Zoom host, link change, and recipients; perform no writes in preview.

### Task 5: Idempotent conversion and Calendar switch

**Files:** migration service and admin apply route, Google Calendar client/provider, Zoom provisioning adapter, new audit/migration persistence if needed, focused tests.

- [ ] Test that repeated application never creates duplicate Zoom meetings and that a Calendar failure leaves Meet active.
- [ ] Revalidate every selected encounter under a database lock; create or resume its Zoom event; verify Zoom details.
- [ ] Patch the existing Calendar event with `conferenceDataVersion=1`, remove Meet conference data, insert Zoom joining details, and verify by GET.
- [ ] Switch the active provider only after Calendar verification; retain the Meet event record and do not revoke a shared Meet space.
- [ ] Add one-encounter pilot and bounded batch execution with per-encounter results and retry.

### Task 6: Announcements and production rollout

**Files:** invitation/notification and reminder services, UI results page, deployment notes, focused tests.

- [ ] Test that invitation and reminder links use the active provider and migration notices are deduplicated.
- [ ] Send Calendar updates and Sala Virtual notices to affected recipients once after a successful switch.
- [ ] Verify all focused tests, `npm run check`, `npm run build`, and one controlled end-to-end Zoom meeting.
- [ ] Deploy, configure nine hosts, review preview and exceptions, run a one-encounter pilot, then apply bounded batches and inspect failures.

# Amazon SES Email Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Configure Amazon SES from the admin email settings UI and use it consistently for invitation, notification, and test emails.

**Architecture:** Persist only non-secret SES settings (region, verified sender, optional Reply-To, enabled state) in a singleton Prisma model. An SES v2 adapter uses the AWS SDK default credential provider chain and joins the existing email transport composition; SES errors never trigger provider fallback after a send attempt.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, AWS SDK for JavaScript v3 (`@aws-sdk/client-sesv2`), Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-amazon-ses-config-design.md`

## Global Constraints

- Do not store AWS access keys or other AWS secrets in the database or UI.
- Keep current Gmail/SMTP behavior when SES is disabled.
- Never fall back after SES has attempted to send.
- Preserve API paths, notification preferences, roles, and message content.
- Restrict settings mutation and test-email sending to active administrators.
- Keep AWS runtime permissions limited to sending from the selected SES identity.

## Review Focus

- SES active but config incomplete: reject activation and keep prior configuration.
- SES disabled: preserve Gmail-first/SMTP-if-Gmail-unconfigured behavior.
- SES accepted request followed by timeout/error: never send through another provider.
- Sandbox, unverified sender, missing IAM permission, or wrong region: surface safe actionable test error.
- Non-admin or inactive admin: cannot read/update config or invoke the test endpoint.

---

### Task 1: Persist SES configuration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_configuracion_correo_ses/migration.sql`
- Create: `src/modules/configuracion/correo-ses.domain.ts`
- Create: `src/modules/configuracion/correo-ses.service.ts`
- Test: `test/configuracion-correo-ses.test.ts`
- Modify: `package.json` only if a migration helper script is needed.

**Interfaces:**

- Produces a typed configuration DTO with region, sender, nullable reply-to, active state, updated-by id, and update timestamp.
- Produces read and update services that re-check active administrator status on the server.

- [x] Write failing tests for defaults, valid/invalid input, and non-admin rejection.
- [x] Run the focused test and verify expected failures.
- [x] Add the singleton model and migration without secret columns.
- [x] Implement authorized read/upsert and re-check the acting user inside the transaction.
- [x] Run focused service tests and schema validation.
- [ ] Commit the isolated persistence unit.

### Task 2: Implement and compose the SES transport

**Files:**

- Modify: `package.json`, lock file.
- Create: `src/modules/notificaciones/infrastructure/email/sesv2-email-transport.adapter.ts`
- Modify: `src/modules/notificaciones/infrastructure/email/composite-email-transport.adapter.ts`
- Modify: `src/modules/notificaciones/domain/notificaciones.types.ts`
- Modify: `src/bootstrap/notificaciones.server.ts`
- Modify: `src/modules/configuracion/correo.service.ts`
- Test: `test/notificaciones-infrastructure.test.ts`

**Interfaces:**

- Consumes the typed SES config resolver from Task 1.
- Produces `EmailTransportPort` and provider result `AMAZON_SES`.

- [x] Add failing adapter tests for SendEmailCommand parameters, region, sender, CC, text/HTML, MessageId, and errors.
- [x] Add failing composition tests for SES priority, disabled fallback, and no fallback after SES errors.
- [x] Install the SDK v3 SES v2 client package.
- [x] Implement the adapter using default provider-chain credentials and configured region.
- [x] Update all production compositions to share the same provider precedence.
- [x] Run focused transport tests and architecture boundary tests.
- [ ] Commit the provider unit.

### Task 3: Add admin configuration and unified test-send UX

**Files:**

- Create: `src/components/ses-email-settings-form.tsx`
- Modify: `app/(gestion)/configuracion/page.tsx`
- Modify: `app/(gestion)/configuracion/actions.ts`
- Modify: `app/api/v1/configuracion/correo/test/route.ts`
- Modify: `src/components/email-test-form.tsx`
- Modify: `app/(gestion)/settings.css` or a narrowly scoped email-settings CSS module.
- Test: relevant settings and route tests under `test/`.

**Interfaces:**

- Form submits only non-secret SES settings to a server action.
- Existing POST route and request body remain compatible; response provider can now be SES.

- [x] Add failing tests for authorization and audited config save.
- [x] Implement the SES section in Configuración > Correo with keyboard-accessible fields and explicit enabled state.
- [x] Keep the existing test recipient flow and show which provider accepted the test.
- [x] Add field-level status/help for verified identity, region, IAM role, and SES sandbox constraints.
- [x] Run focused UI-contract and API route tests (focused configuration and transport tests; API test endpoint exercised via existing contract/build checks).
- [ ] Commit the configuration UI unit.

### Task 4: Document deployment prerequisites and validate

**Files:**

- Create: `docs/configuracion-amazon-ses.md`
- Modify: `docs/despliegue-ec2.md`
- Modify: `.env.example` only if needed to clarify that no SES AWS keys are required.

- [x] Document the instance profile requirement, least-privilege `ses:SendEmail` policy scoped to the verified identity, SES region identity verification, and sandbox production-access prerequisite.
- [x] Run `npm run check`, `npm test`, `npm run build`, schema validation, and `git diff --check`.
- [x] Review the final diff for accidental API, permission, or message-content changes.
- [ ] Open a small PR and wait for all required checks before merging.

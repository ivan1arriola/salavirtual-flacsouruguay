# F4 Ficha de reuniones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize meeting details into clear, directly reachable work sections while reusing existing data and actions.

**Architecture:** Keep the existing server loader and client managers as the source of truth. Add accessible in-page navigation and section landmarks for General, Encuentros, Personas, Archivos, and Actividad; aggregate existing file links from the already-loaded encounter view data. Activity will contain only existing integration issues and participant-attendance tools; no new audit history or persistence is implied.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules/page CSS, Vitest.

**Spec:** User-provided “Rediseño UI/UX de Sala Virtual FLACSO”, sections 6–9 and 11–13.

## Global Constraints

- Preserve authorization checks, routes, API contracts, persisted field names, Google integrations, and business rules.
- Keep existing activity labels distinct: participant attendance is not Monitoreo.
- Keep encounter-level actions attached to encounters and series actions clearly scoped to the series.
- Use semantic landmarks, keyboard accessible links, visible focus, and responsive layout.
- Do not delete styles until their consumers have been checked.

## Review Focus

- All five section links resolve to unique landmarks and remain keyboard reachable.
- Empty file and integration states explain what is unavailable without hiding sections.
- Artifact links retain their original destinations and open safely.
- The meeting detail page stays usable on narrow screens and at increased text size.
- No change touches role authorization, APIs, persistence, or meeting scheduling rules.

---

### Task 1: Structure the meeting detail work sections

**Files:**
- Modify: `src/bootstrap/ui/reuniones/reunion-detail-page.server.tsx`
- Modify: `src/modules/reuniones/presentation/components/meeting-detail-manager.tsx`
- Modify: `app/(gestion)/meeting-detail-v2.css`
- Test: `test/meeting-detail-sections.test.ts`
- Document: `docs/ui/reuniones.md`

**Interfaces:**
- Consumes: existing `meetingViews`, `SeriesManagement`, `MeetingIntegrationProblems`, and `MeetAttendanceEmails` props.
- Produces: unique section landmarks `general`, `encuentros`, `personas`, `archivos`, and `actividad`; no new API or data interfaces.

- [x] Write a failing contract test asserting the accessible section navigation, unique section IDs, existing artifact URLs, and activity tool labels.
- [x] Run `npx vitest run test/meeting-detail-sections.test.ts` and confirm it fails for the missing structure.
- [x] Add section navigation and landmarks around existing components; create an aggregate files section using already mapped artifact URLs.
- [x] Keep integration issues under Actividad and participant-attendance files under Archivos; explain that activity reports current integration state rather than a complete history.
- [x] Add scoped responsive and focus styles in the existing meeting detail stylesheet.
- [x] Document the section mapping and the absence of persisted historical activity.
- [x] Run focused test, `npm run check`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Review scope and commit as `feat(ui): organize meeting detail sections`.

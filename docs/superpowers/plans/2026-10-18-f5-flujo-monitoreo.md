# F5 Flujo de Monitoreo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prioritize assigned monitoring work ahead of open opportunities and hour summaries on the assistant dashboard.

**Architecture:** Reorder the existing dashboard sections without changing the adapter, queries, APIs, permissions, or monitoring rules. Keep the existing reusable components and their data.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest.

**Spec:** User-provided UI/UX redesign, sections 4, 5, 7, and 11–13.

## Global Constraints

- Keep internal role identifiers and persisted fields unchanged.
- Do not change authorization, routes, API contracts, or monitoring and hour rules.
- Keep academic meeting times visually distinct from monitoring times.
- Preserve responsive layout and keyboard accessible controls.

## Review Focus

- The next assigned monitoring and its actions appear before open opportunities.
- Open opportunities appear before secondary hour summaries.
- Empty and populated states still render without hiding available work.
- No source query, rule, permission, route, or persisted data changes.

---

### Task 1: Prioritize assigned monitoring on the assistant dashboard

**Files:**

- Modify: `src/modules/asistencia/presentation/components/assistant-dashboard.tsx`
- Test: `test/assistant-dashboard-priorities.test.ts`
- Document: `docs/ui/monitoreo.md`

**Interfaces:**

- Consumes and produces: existing `AssistantDashboardData`, `LiveMeetingHero`, `AssistantOpenOpportunities`, and `AssistantHoursSummary`; no interface changes.

- [x] Add a failing source contract test asserting the section order: live/next assigned monitoring, upcoming assigned coverages, open opportunities, hour summary.
- [x] Run the focused test and verify it fails on the current order.
- [x] Move the existing upcoming coverage section before opportunities and hour summary, and rename its heading to “Próximos monitoreos asignados”.
- [x] Document the dashboard hierarchy and note where schedule times remain available.
- [x] Run focused test, `npm run check`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Review scope and commit as `feat(ui): prioritize assistant monitoring work`.

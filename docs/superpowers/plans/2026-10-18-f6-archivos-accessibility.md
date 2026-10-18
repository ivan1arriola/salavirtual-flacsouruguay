# F6 Archivos accesibles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recordings library search and filters expose semantics that match their native keyboard behavior.

**Architecture:** Keep the existing URL-based filters and search state. Treat the filter buttons as a pressed-state control group rather than ARIA tabs, and use the native search input type.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest.

**Spec:** User-provided UI/UX redesign, sections 3, 8, 9, and 11–13.

## Global Constraints

- Keep the existing query parameters, navigation behavior, routes, and API contracts.
- Preserve all file types, counts, filtering, permissions, and data.
- Use semantic keyboard native controls and keep visible focus styles.

## Review Focus

- Filter buttons announce their active state with `aria-pressed` and remain usable with native keyboard controls.
- Search continues to submit on Enter and retains its current query behavior.
- Responsive styles and focus indicators remain attached to existing classes.
- No changes reach file access authorization or recording persistence.

---

### Task 1: Align recordings filters with native controls

**Files:**
- Modify: `src/components/recordings-library.tsx`
- Test: `test/recordings-library-accessibility.test.ts`
- Document: `docs/ui/archivos.md`

**Interfaces:**
- Consumes and produces: existing `RecordingsLibraryProps`, URL filter behavior, and CSS classes; no interface changes.

- [x] Write a failing source contract test checking the filter group, pressed states, search input type, and absence of tab roles.
- [x] Run the focused test and verify it fails because the current controls claim tabs semantics.
- [x] Change the filter wrapper to a labeled group and buttons to `aria-pressed`; set the search input to `type="search"`.
- [x] Document the accessibility and query behavior.
- [x] Run focused test, `npm run check`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Review scope and commit as `feat(ui): improve recordings filter accessibility`.

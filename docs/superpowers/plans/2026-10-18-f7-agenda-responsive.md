# F7 Agenda responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent agenda filters from forcing horizontal page overflow when the persistent desktop sidebar reduces the available content width.

**Architecture:** Adjust only the existing CSS breakpoint for collapsing the agenda toolbar into a single column. Preserve the agenda markup, search controls, filters, cards, and narrow-screen layout.

**Tech Stack:** Next.js App Router, CSS, Vitest.

**Spec:** User-provided UI/UX redesign, sections 3, 8, 9, and 11–13.

## Global Constraints

- Do not change routes, search parameters, business rules, permissions, or API behavior.
- Preserve filter controls, keyboard access, and mobile compact patterns.
- Avoid global overflow clipping that could hide page content.

## Review Focus

- Desktop viewport with persistent sidebar no longer keeps two competing toolbar columns when content is narrower than the viewport suggests.
- Filter inputs retain readable widths after the toolbar stacks.
- Narrow mobile layout remains governed by the existing compact stylesheet.
- No page-level overflow hiding masks remaining content.

---

### Task 1: Stack the agenda toolbar at the shell-aware breakpoint

**Files:**

- Modify: `app/(gestion)/agenda-v2.css`
- Test: `test/agenda-responsive-layout.test.ts`
- Document: `docs/ui/validacion-responsive.md`

**Interfaces:**

- Consumes and produces: existing `.agenda-toolbar` and `.agenda-filter-panel` CSS; no runtime or API interfaces.

- [x] Write a failing stylesheet contract test for a 1400px toolbar stacking breakpoint.
- [x] Run the focused test and verify it fails with the current 1280px breakpoint.
- [x] Raise the existing toolbar stacking breakpoint to 1400px; preserve existing form layout declarations.
- [x] Document the production screenshot finding and the desktop/mobile validation coverage.
- [x] Run focused test, `npm run check`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Review scope and commit as `fix(ui): prevent agenda overflow beside sidebar`.

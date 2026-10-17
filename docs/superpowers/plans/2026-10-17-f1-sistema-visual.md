# F1 Sistema visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a documented, tested token foundation for Sala Virtual FLACSO without repeating PR #121 or changing operational behavior.

**Architecture:** Keep `app/brand.css` as the existing brand layer and add semantic aliases plus shared type, spacing, radius, border, and focus tokens there. Document the token contract and protect it with a focused Vitest contract test; leave page styles and API behavior untouched.

**Tech Stack:** Next.js App Router, CSS custom properties, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-f1-diseno-sistema-visual.md`

## Global Constraints

- Keep `#2c4777` as the primary institutional color.
- Do not change permissions, API response shapes, routes, business rules, database schema, or Google integrations.
- Keep the existing page styles until their consumers are verified.
- Do not add corrective global CSS or visual dependencies.
- Keep the change in a small reviewable PR.
- Do not repeat the Monitoreo copy and route work already merged in PR #121.

## Review Focus

- **Brand identity drift:** tests pin `--brand` to `#2c4777`.
- **Legacy state consumers:** tests pin semantic aliases to existing `--ok`, `--warning`, `--danger`, and `--brand` values.
- **Weak keyboard focus visibility:** the parsed CSS contract checks a solid institutional focus color and a 3px visible outline rule.
- **Token scale gaps:** tests pin the named type, spacing, radius, and border tokens and their agreed values.
- **Scope leakage:** review the diff to confirm only the design token stylesheet, token documentation, and token contract test change; no route, API, auth, persistence, or Google integration files change.

---

### Task 1: Establish and document the token contract

**Files:**
- Modify: `app/brand.css`
- Create: `docs/ui/sistema-visual.md`
- Test: `test/design-tokens.test.ts`

**Interfaces:**
- Consumes: existing CSS custom properties in `app/brand.css`.
- Produces: documented CSS tokens for later UI phases; no component or API interface changes.

- [ ] **Step 1: Write the failing token contract test**

Create `test/design-tokens.test.ts`. Parse `app/brand.css` with the PostCSS parser already used by the Next.js CSS toolchain. Assert the observable stylesheet contract:

  - Resolve state aliases to `#24745b`, `#a96f00`, `#a94242`, and `#2c4777`, and preserve `--brand` at `#2c4777`.
  - Verify `body` consumes `--font-sans` and that it resolves to the existing Inter system font stack.
  - Verify the type scale from `--text-xs: 0.75rem` through `--text-3xl: 1.875rem`.
  - Verify spacing from `--space-1: 0.25rem` through `--space-8: 2rem`.
  - Verify radii `4px`, `6px`, `8px`, and `9999px`, plus `--border-width: 1px`.
  - Verify interactive `:focus-visible` selectors use a 3px solid outline with `--focus-ring-color: #2c4777` and 2px offset.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run test/design-tokens.test.ts`
Expected: FAIL because the agreed token aliases and scales are not yet defined.

- [ ] **Step 3: Add the tokens and make global focus color explicit**

Add the exact custom properties above inside the existing `:root` block in `app/brand.css`. Move the existing font stack into `--font-sans` and make `body` consume it. Replace the translucent literal in the existing `:focus-visible` outline with `var(--focus-ring-color)`, preserving its 3px width and 2px offset. Leave `app/globals.css` and all page styles untouched because their broader cascade has not been changed by this task.

- [ ] **Step 4: Document token purpose and migration rules**

Create `docs/ui/sistema-visual.md` with a table grouped by color, typography (font family and sizes), spacing, radius/border, elevation, and focus. Explain that `--ok`, `--warning`, `--danger`, and `--brand` remain supported for existing selectors; new or modified UI should use their `--state-*` semantic aliases. State that page styles are migrated only when that page is otherwise modified and its consumers are checked.

- [ ] **Step 5: Run focused and project verification**

Run: `npx vitest run test/design-tokens.test.ts`
Expected: PASS.

Run: `npm run check`
Expected: PASS with no TypeScript errors.

Run: `npm run build`
Expected: PASS with a production build.

Run: `npm test`
Expected: all existing Vitest tests pass.

- [ ] **Step 6: Review the final diff and commit**

Run: `git diff --check` and inspect `git diff -- app/brand.css docs/ui/sistema-visual.md test/design-tokens.test.ts`.
Expected: no whitespace errors and only the three planned files changed. Confirm no route/API/schema/auth/Google files changed, then commit as `feat(ui): establish shared design tokens`.

# Configuración Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/configuracion` as an adaptive administration center with a useful landing summary, clear section navigation, progressive disclosure, and focused editors.

**Architecture:** Keep `page.tsx` as the authenticated Server Component and move section normalization plus metadata into a pure domain module. Compose the server-rendered frame from focused components, keeping interaction inside small Client Components. Add one prefixed global stylesheet after the existing settings styles so current form contracts remain intact while the new route receives a coherent layout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Lucide, CSS, Vitest, Prisma 6

**Spec:** `docs/superpowers/specs/2026-09-11-configuracion-experience-design.md`

## Global Constraints

- Preserve current authorization, APIs, Server Actions, destructive confirmations, and database data.
- Do not add a Prisma migration or run a production write.
- Keep all existing `?seccion=` deep links working.
- Use the existing Sala Virtual FLACSO design tokens and Spanish domain language.
- Verify visual and responsive behavior only at `http://localhost:8000/configuracion`.
- Do not trigger email, Google synchronization, deletion, or configuration writes during browser validation.

---

### Task 1: Section domain and navigation contract

**Files:**

- Create: `src/modules/configuracion/settings-navigation.domain.ts`
- Create: `test/settings-navigation-domain.test.ts`

**Interfaces:**

- Produces: `SettingsSection`, `SETTINGS_SECTIONS`, `resolveSettingsSection(value)` and `settingsHref(section)`.
- Consumes: no application state.

- [ ] **Step 1: Write the failing domain test**

```ts
import { describe, expect, it } from "vitest";
import {
  resolveSettingsSection,
  settingsHref,
} from "../src/modules/configuracion/settings-navigation.domain";

describe("navegacion de configuracion", () => {
  it("abre el resumen ante una seccion ausente o desconocida", () => {
    expect(resolveSettingsSection()).toBe("resumen");
    expect(resolveSettingsSection("otra")).toBe("resumen");
  });

  it("conserva las secciones publicas y sus enlaces", () => {
    expect(resolveSettingsSection("workspace")).toBe("workspace");
    expect(settingsHref("resumen")).toBe("/configuracion");
    expect(settingsHref("programas")).toBe("/configuracion?seccion=programas");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/settings-navigation-domain.test.ts`

Expected: FAIL because `settings-navigation.domain.ts` does not exist.

- [ ] **Step 3: Implement the typed contract**

```ts
export const SETTINGS_SECTION_IDS = [
  "resumen",
  "workspace",
  "salas",
  "programas",
  "asistencia",
  "correo",
  "historico",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTION_IDS)[number];

export function resolveSettingsSection(value?: string): SettingsSection {
  return SETTINGS_SECTION_IDS.includes(value as SettingsSection)
    ? (value as SettingsSection)
    : "resumen";
}

export function settingsHref(section: SettingsSection) {
  return section === "resumen" ? "/configuracion" : `/configuracion?seccion=${section}`;
}
```

Add the section labels, descriptions and icon keys to `SETTINGS_SECTIONS` so the page and navigation share one source of truth.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run test/settings-navigation-domain.test.ts`

Expected: PASS.

### Task 2: Administration frame and summary landing page

**Files:**

- Create: `src/components/settings-center-shell.tsx`
- Create: `src/components/settings-overview.tsx`
- Modify: `app/(gestion)/configuracion/page.tsx`
- Create: `app/(gestion)/configuracion-redesign.css`
- Modify: `app/(gestion)/layout.tsx`

**Interfaces:**

- Consumes: `SettingsSection`, `SETTINGS_SECTIONS`, counts and integration state from the page.
- Produces: desktop section rail, mobile section disclosure, section header, and summary cards.

- [ ] **Step 1: Extend the domain test with navigation metadata expectations**

```ts
it("expone todas las secciones en el orden de trabajo", () => {
  expect(SETTINGS_SECTIONS.map(({ id }) => id)).toEqual([
    "resumen",
    "workspace",
    "salas",
    "programas",
    "asistencia",
    "correo",
    "historico",
  ]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/settings-navigation-domain.test.ts`

Expected: FAIL until `SETTINGS_SECTIONS` contains the complete ordered metadata.

- [ ] **Step 3: Build the server-rendered shell and summary**

Use `SettingsCenterShell` around the active section. Render navigation links in a desktop `<aside>` and a mobile `<details>` with the same metadata. Keep `Link` for client-side navigation and apply `aria-current="page"` to the active link.

Render `SettingsOverview` with a typed value:

```ts
type SettingsOverviewData = Readonly<{
  workspaceReady: boolean;
  integrationActive: boolean;
  availableHosts: number;
  totalHosts: number;
  activePrograms: number;
  totalPrograms: number;
  pendingOperations: number;
}>;
```

Change the route default to `resumen`, add active program count to the existing parallel query, and preserve lazy full-list queries for programs and history.

- [ ] **Step 4: Add the base adaptive layout**

Create prefixed rules for `.settings-center`, `.settings-center__rail`, `.settings-center__content`, `.settings-mobile-nav`, `.settings-overview-grid`, and `.settings-section-hero`. Import this file after `settings.css` in the management layout.

- [ ] **Step 5: Run focused and type checks**

Run: `npx vitest run test/settings-navigation-domain.test.ts && npm run check`

Expected: PASS.

### Task 3: Progressive Google Workspace hierarchy

**Files:**

- Modify: `src/components/workspace-config-form.tsx`
- Modify: `app/(gestion)/configuracion/page.tsx`
- Modify: `app/(gestion)/configuracion-redesign.css`

**Interfaces:**

- Consumes: current `WorkspaceConfigVisible` and existing form components.
- Produces: health-first groups with closed historical and advanced panels.

- [ ] **Step 1: Add a failing readiness test**

Create `workspaceReadiness(initial)` in the navigation domain and test a complete and incomplete configuration:

```ts
expect(
  workspaceReadiness({
    serviceAccountEmail: "service@example.com",
    privateKeyConfigurada: true,
    serviceAccountSubject: "sala@example.com",
    driveDestinationId: "folder",
    activa: true,
  }).readyCount,
).toBe(4);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/settings-navigation-domain.test.ts`

Expected: FAIL because `workspaceReadiness` is missing.

- [ ] **Step 3: Implement readiness and recompose Workspace**

Keep the existing child forms and network calls. Group them under semantic sections for health, principal credential, delegation and Drive, existing meetings, historical compatibility, and advanced configuration. Use native `<details>` for the two low-frequency groups and open a group when its state requires attention.

- [ ] **Step 4: Run test and type check**

Run: `npx vitest run test/settings-navigation-domain.test.ts && npm run check`

Expected: PASS.

### Task 4: Focused room list and editor

**Files:**

- Modify: `src/components/meet-hosts-config.tsx`
- Modify: `app/(gestion)/configuracion-redesign.css`

**Interfaces:**

- Consumes: current `hosts` props and `/api/v1/configuracion/salas-meet` contract.
- Produces: searchable summary rows, one open editor, separate create panel, unchanged update and delete payloads.

- [ ] **Step 1: Add and verify a failing pure-filter test**

Export `filterMeetHosts(hosts, query)` from a new `src/components/meet-hosts-config.domain.ts` and cover name plus email matching in `test/meet-hosts-config-domain.test.ts` before implementation.

Run: `npx vitest run test/meet-hosts-config-domain.test.ts`

Expected: FAIL because the filter module does not exist.

- [ ] **Step 2: Implement the filter and verify GREEN**

Normalize query, name and email with `trim().toLocaleLowerCase("es")`. Return all hosts for an empty query.

Run: `npx vitest run test/meet-hosts-config-domain.test.ts`

Expected: PASS.

- [ ] **Step 3: Rebuild the component interaction**

Add client state for `query`, `editingHostId`, and create-panel visibility. Render compact host rows first. Show only the selected edit form. Preserve `payloadFromForm`, the password notification checkbox, safe delete confirmation, busy states, and response messages.

- [ ] **Step 4: Run focused tests and type check**

Run: `npx vitest run test/meet-hosts-config-domain.test.ts && npm run check`

Expected: PASS.

### Task 5: Searchable program administration and responsive members

**Files:**

- Create: `src/components/program-members-config.domain.ts`
- Create: `test/program-members-config-domain.test.ts`
- Modify: `src/components/program-members-config.tsx`
- Modify: `app/(gestion)/configuracion-redesign.css`

**Interfaces:**

- Consumes: existing programs, academic units, teachers and Server Action props.
- Produces: search, active-state filter, summary counters, one expanded program and stacked mobile member rows.

- [ ] **Step 1: Write and verify failing filter tests**

```ts
expect(filterPrograms(programs, { query: "educacion", state: "todos" })).toHaveLength(1);
expect(filterPrograms(programs, { query: "", state: "inactivos" })[0]?.activo).toBe(false);
```

Run: `npx vitest run test/program-members-config-domain.test.ts`

Expected: FAIL because the filter module does not exist.

- [ ] **Step 2: Implement filter and verify GREEN**

Match query against name, code and academic unit. Apply `todos`, `activos`, or `inactivos` after text matching.

Run: `npx vitest run test/program-members-config-domain.test.ts`

Expected: PASS.

- [ ] **Step 3: Add the focused list UI**

Mark the component as client-side, retain the supplied Server Actions, and add search plus status controls. Keep one program open at a time through the existing `programa` query contract. Preserve both member flows and the `ELIMINAR` confirmation.

- [ ] **Step 4: Add mobile member labels and run checks**

Use `data-label` on member cells and CSS below 640 px to render each row as a readable block without horizontal overflow.

Run: `npx vitest run test/program-members-config-domain.test.ts && npm run check`

Expected: PASS.

### Task 6: Secondary sections, historical search and complete validation

**Files:**

- Create: `src/components/historical-meetings-table.tsx`
- Modify: `src/components/assistant-report-config-form.tsx`
- Modify: `src/components/email-test-form.tsx`
- Modify: `app/(gestion)/configuracion/page.tsx`
- Modify: `app/(gestion)/configuracion-redesign.css`
- Create: `.frontend-design/configuracion/2026-09-11-configuracion.html`

**Interfaces:**

- Consumes: the existing historical meeting view model and current assistance/email actions.
- Produces: consistent section presentation, client-side historical search, responsive history rows, and an interactive design review artifact.

- [ ] **Step 1: Add consistent section copy and safe interaction cues**

Explain that the email test sends a real message before the submit button. Separate automatic administrators from additional report recipients. Add busy labels where current client state exists, without changing request payloads.

- [ ] **Step 2: Build historical search**

Create a small Client Component that filters the supplied 100 read-only records by meeting, program or account. Render desktop columns and add `data-label` values for the mobile stacked layout.

- [ ] **Step 3: Complete responsive and accessibility styles**

Cover 1440, 768 and 390 px. Add visible focus, 44 px mobile targets, long-identifier wrapping, `prefers-reduced-motion`, empty results, local status placement and risk-zone styling.

- [ ] **Step 4: Verify automated checks**

Run:

```bash
npm test
npm run check
npm run validate:schema
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Build and verify the frontend-design review artifact**

Read `frontend-design/assets/preview-template.html` only after the real UI exists. Generate the self-contained preview from the real route structure and tokens, then verify inline assets, a decision control, direct text editing, a comment and export.

- [ ] **Step 6: Review only on localhost:8000**

Reload `http://localhost:8000/configuracion` after changes. Inspect `resumen`, `workspace`, `salas`, `programas`, `asistencia`, `correo` and `historico` at 1440, 768 and 390 px. Exercise navigation, searches and panel opening without submitting forms or triggering external operations. Confirm no console errors and no horizontal overflow.

- [ ] **Step 7: Review the final diff and commit**

Run `git diff --check`, inspect every changed file, exclude `.agents/`, and commit the coherent implementation with:

```bash
git commit -m "feat(configuracion): rediseñar centro de administración"
```

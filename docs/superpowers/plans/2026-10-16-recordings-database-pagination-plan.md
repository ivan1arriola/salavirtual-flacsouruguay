# Recordings Database Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/grabaciones` search, filter, order, count, and paginate every authorized encounter from the database in pages of 12.

**Architecture:** Add a typed query/result to the existing `archivos` application and repository ports. Query page-level encounter groups with Prisma using the actor's existing scope; read URL parameters in the Next.js server page and navigate with the current filter state in the URL.

**Tech Stack:** Node.js 24, TypeScript 5.9, Next.js 16 App Router, React 19, Prisma 6, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-16-asistencia-meet-produccion-design.md`

## Global Constraints

- Return 12 encounters per page, keeping every artifact for an encounter together.
- Apply search, artifact filter, chronological order, and role scope before selecting the page.
- Do not query a fixed first batch of 300 files or paginate client-side.
- Keep separate visual labels and direct links for recordings, transcripts, notes, and attendance Sheets.
- Do not expose encounters outside the actor's existing role scope.

## Review Focus

- More than 300 encounters must remain reachable; pin in Task 1 with `query de página alcanza encuentros posteriores a los primeros 300`.
- A meeting with multiple artifact types must appear as one group under its matching filter; pin in Task 1 with `filtra grupos sin dividir artefactos entre páginas`.
- Ties on scheduled time must remain stable across pages; pin in Task 1 with `ordena por fecha y desempata por ID`.
- Out-of-range or malformed page/filter parameters must recover to a valid first/last page without a server error; pin in Task 1 with `normaliza parámetros inválidos de grabaciones`.
- Search and filters must respect role scope even when a result has matching text; pin in Task 1 with `aplica alcance de actor antes de búsqueda y conteos`.

---

### Task 1: Typed encounter query and Prisma pagination

**Files:**

- Create: `src/modules/archivos/domain/grabaciones-query.domain.ts`
- Modify: `src/modules/archivos/ports/archivos-repository.port.ts`
- Modify: `src/modules/archivos/application/consultar-grabaciones.use-case.ts`
- Modify: `src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter.ts`
- Test: `test/grabaciones-filtro-domain.test.ts`
- Test: `test/archivos-infrastructure.test.ts`
- Test: `test/archivos-application.test.ts`

**Interfaces:**

- Produces `ListarEncuentrosConArchivosInput = { actor: SessionActor; pagina: number; porPagina: 12; busqueda: string; filtro: TipoFiltroArtefacto }`.
- Produces `normalizarParametrosGrabaciones(params: Readonly<{ pagina?: string | string[]; busqueda?: string | string[]; filtro?: string | string[] }>): { pagina: number; busqueda: string; filtro: TipoFiltroArtefacto }`, defaulting malformed values to page 1, empty search, and `TODOS`.
- Produces `crearHrefGrabaciones(actual: { pagina: number; busqueda: string; filtro: TipoFiltroArtefacto }, cambios: Partial<{ pagina: number; busqueda: string; filtro: TipoFiltroArtefacto }>): string`, preserving safe search/filter values and omitting default query values.
- Produces `EncuentroConArchivosModel = { instanciaId: string; titulo: string; programa: string; docente: string; inicioProgramadoAt: Date; finProgramadoAt: Date; folderId: string | null; requiereGrabacion: boolean; archivosSincronizadosAt: Date | null; archivos: readonly { id: string; tipo: TipoArtefactoMeet; nombre: string; webViewUrl: string | null; tamanoBytes: bigint | null; mimeType: string | null }[] }` and `EncuentrosConArchivosPage = { grupos: readonly EncuentroConArchivosModel[]; pagina: number; porPagina: 12; totalEncuentros: number; totalPaginas: number; conteos: { todos: number; grabaciones: number; asistencias: number; notas: number } }`.
- `conteos` are computed across all groups matching the actor and search, independent of the active artifact tab; `totalEncuentros` and `totalPaginas` apply the active tab.
- Replace `listarArchivosVisibles(actor)` with `listarEncuentrosConArchivos(input): Promise<EncuentrosConArchivosPage>` through the application and repository layers. The page maps result models to `GrupoEncuentroConArchivos` after database pagination.

- [ ] **Step 1: Write failing tests** named `query de página alcanza encuentros posteriores a los primeros 300`, `filtra grupos sin dividir artefactos entre páginas`, `ordena por fecha y desempata por ID`, `aplica alcance de actor antes de búsqueda y conteos`, and `normaliza parámetros inválidos de grabaciones`. Assert a query beyond item 300 is returned; all files stay under the same instance group; identical dates order by descending ID; an unauthorized program never appears in results or counts; and invalid page/filter values become `{ pagina: 1, busqueda: "", filtro: "TODOS" }`.
- [ ] **Step 2: Run** `npm test -- test/grabaciones-filtro-domain.test.ts test/archivos-infrastructure.test.ts test/archivos-application.test.ts --reporter=dot`; confirm the new assertions fail.
- [ ] **Step 3: Implement** Prisma queries from `InstanciaSala`, filtering with relation existence by artifact type, applying `alcanceInstancias(actor)`, search over title/program/teacher, stable `inicioProgramadoAt desc, id desc`, and page-level `skip/take` of 12. Count the same filtered encounter set and tab categories.
- [ ] **Step 4: Re-run** all targeted tests, including a fixture set with at least 301 encounters and multiple files on one encounter.
- [ ] **Step 5: Commit** as `feat: paginate recordings by encounter in database`.

### Task 2: Server page parameters and URL navigation

**Files:**

- Modify: `app/(gestion)/grabaciones/page.tsx`
- Modify: `src/components/recordings-library.tsx`
- Modify: `src/bootstrap/archivos.server.ts`
- Test: `test/grabaciones-filtro-domain.test.ts`

**Interfaces:**

- The page accepts Next.js 16 `searchParams: Promise<{ pagina?: string; busqueda?: string; filtro?: string }>` and passes normalized values plus the authenticated `SessionActor` to `listarEncuentrosConArchivos`.
- The client receives `EncuentrosConArchivosPage` and updates the safe `/grabaciones` query string for search, filter, previous/next, and reset actions. Query changes reset `pagina` to 1; the page component performs no local catalog filtering or pagination.
- Consumes Task 1 `crearHrefGrabaciones(actual, cambios)` for link generation.

- [ ] **Step 1: Write failing tests** named `conserva búsqueda y filtro al navegar` and `reinicia página al cambiar búsqueda o filtro`. Assert page links retain `busqueda` and `filtro`, and changing either value sets `pagina=1` while retaining the other.
- [ ] **Step 2: Run** the targeted test and confirm the page/query behavior is missing.
- [ ] **Step 3: Implement** server-side parameter parsing and URL-driven client controls using Next.js 16 App Router `searchParams`, `useRouter`, and `useSearchParams` rules documented in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` and `04-functions/use-router.md`.
- [ ] **Step 4: Re-run** pagination tests and inspect the rendered UI for labels, counts, empty states, and direct Sheets links.
- [ ] **Step 5: Commit** as `feat: drive recordings navigation from database pages`.

### Task 3: Full access, category, and regression verification

**Files:**

- Modify: `test/archivos-infrastructure.test.ts`
- Modify: `test/grabaciones-filtro-domain.test.ts`
- Modify: `test/functional-architecture.test.ts` only if page and repository layering checks require an update justified by the new server query.

- [ ] **Step 1: Add regression tests** for page counts after search, all four artifact categories, stable chronological navigation, unauthorized-role isolation, and direct Google Sheets links.
- [ ] **Step 2: Run** the targeted test files and confirm expected counts and group order.
- [ ] **Step 3: Re-run** current `functional-architecture` failures and fix only proven issues in this scope.
- [ ] **Step 4: Run** `npm run check`, `npm test -- --reporter=dot`, and `npm run build`; compare against the documented baseline and resolve failures in touched code.
- [ ] **Step 5: Commit** as `test: cover recordings pagination and access scope`.

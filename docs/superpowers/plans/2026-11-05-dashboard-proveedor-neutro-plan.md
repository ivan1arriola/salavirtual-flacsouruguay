# Portada independiente del proveedor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que la agenda principal de Administración refleje el proveedor activo y no muestre estados de Google Meet para encuentros Zoom.

**Architecture:** El adaptador ya selecciona el evento de proveedor activo; expondrá su tipo al DTO de la agenda. La línea de tiempo consumirá ese tipo para resolver etiquetas, acciones y la visibilidad de cohosts, sin modificar integraciones, datos ni rutas técnicas.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma, Vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-05-dashboard-proveedor-neutro-design.md`

## Global Constraints

- No modificar provisión, sincronización, base de datos ni integraciones de Zoom o Google Meet.
- No inferir el proveedor desde la URL; usar el proveedor activo resuelto por el adaptador.
- Cohosts y su confirmación se muestran únicamente para Google Meet.
- La búsqueda reversa de Meet conserva su ruta en el Centro de operaciones.
- No incorporar dependencias nuevas.

## Review Focus

- Evento activo Zoom con eventos Meet históricos: debe abrir Zoom y ocultar cohosts.
- Evento activo Google Meet: debe conservar el estado de cohosts y sus avisos actuales.
- Sin evento activo: debe mantener una acción de operación y comunicar enlace pendiente sin asumir Meet.
- La copia de enlace debe ser válida para ambos proveedores y no anunciar Meet.
- El acceso rápido de Inicio no debe dirigir a la búsqueda reversa exclusiva de Meet.

---

### Task 1: Exponer el proveedor activo en la agenda administrativa

**Files:**
- Modify: `src/modules/dashboard/admin-dashboard.adapter.ts`
- Test: `test/admin-dashboard.adapter.test.ts` (o el test existente equivalente del adaptador)

**Interfaces:**
- Produces: `AdminTodayMeetingDTO.proveedorTipo: string | null`.
- Consumes: `seleccionarEventoProveedorActivo(instancia)`.

- [ ] **Step 1: Write the failing test**

Crear casos con proveedor activo `ZOOM`, `GOOGLE_MEET` y sin evento activo; comprobar el valor de `proveedorTipo` del DTO y que Zoom sea elegido aun si existen datos históricos de Meet.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/admin-dashboard.adapter.test.ts --reporter=dot`

Expected: FAIL porque el DTO no incluye `proveedorTipo`.

- [ ] **Step 3: Implement `proveedorTipo: meet?.proveedor.tipo ?? null`**

Añadir el campo al contrato `AdminTodayMeetingDTO` y al mapper de `todayTimeline`, reutilizando el evento ya elegido por `seleccionarEventoProveedorActivo`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/admin-dashboard.adapter.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/dashboard/admin-dashboard.adapter.ts test/admin-dashboard.adapter.test.ts
git commit -m "feat: expose active provider in admin dashboard"
```

### Task 2: Hacer neutrales las acciones de enlace

**Files:**
- Modify: `src/components/copy-meet-link-button.tsx`
- Modify: `src/components/dashboard/admin/admin-today-timeline.tsx`
- Test: `test/dashboard-views.test.ts`

**Interfaces:**
- Consumes: `AdminTodayMeetingDTO.proveedorTipo`.
- Produces: una acción de entrada rotulada `Zoom` o `Google Meet` y una copia sin referencia fija a Meet.

- [ ] **Step 1: Write the failing test**

Añadir aserciones de fuente/render que exijan etiquetas `Zoom`, `Google Meet`, `Copiar enlace de la reunión` y que el componente de copia admita una etiqueta opcional.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/dashboard-views.test.ts --reporter=dot`

Expected: FAIL porque la pantalla usa `Meet` fijo y el botón anuncia Google Meet.

- [ ] **Step 3: Implement provider-aware link labels**

Definir un helper local de presentación en `admin-today-timeline.tsx` que traduzca `ZOOM` a `Zoom`, `GOOGLE_MEET` a `Google Meet` y cualquier otro valor a `plataforma de videollamada`. Pasar esa etiqueta a la acción de entrada y al botón de copia. Renombrar internamente el componente de copia o mantener un alias compatible, pero usar textos neutros por defecto.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/dashboard-views.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/copy-meet-link-button.tsx src/components/dashboard/admin/admin-today-timeline.tsx test/dashboard-views.test.ts
git commit -m "feat: label dashboard links by meeting provider"
```

### Task 3: Ocultar estados exclusivos de Meet para Zoom y generalizar el acceso rápido

**Files:**
- Modify: `src/components/dashboard/admin/admin-today-timeline.tsx`
- Modify: `src/components/dashboard/admin/admin-dashboard.tsx`
- Modify: `docs/ui/dashboards.md`
- Test: `test/dashboard-views.test.ts`

**Interfaces:**
- Consumes: `proveedorTipo` desde Task 1.
- Produces: cohosts solo en Google Meet y el acceso `Buscar reunión` a `/reuniones`.

- [ ] **Step 1: Write the failing test**

Añadir aserciones que garanticen un guard de `GOOGLE_MEET` para cohosts, la etiqueta `Buscar reunión`, la ruta `/reuniones` y la ausencia de `/reuniones/buscar-meet` en el dashboard administrativo.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/dashboard-views.test.ts --reporter=dot`

Expected: FAIL porque Inicio aún ofrece «Buscar Meet» y muestra cohosts sin comprobar proveedor.

- [ ] **Step 3: Implement conditional provider-only UI**

Renderizar el bloque de cohosts solo cuando `meeting.proveedorTipo === "GOOGLE_MEET"`. Cambiar la acción del encabezado por «Buscar reunión» a `/reuniones`. Actualizar la documentación del dashboard para explicitar que el estado de proveedor se presenta de forma contextual.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/dashboard-views.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/admin/admin-today-timeline.tsx src/components/dashboard/admin/admin-dashboard.tsx docs/ui/dashboards.md test/dashboard-views.test.ts
git commit -m "fix: keep Meet-only status off Zoom meetings"
```

### Task 4: Verify the completed dashboard change

**Files:**
- Modify: no product files expected.

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Run focused tests**

Run: `npm test -- test/dashboard-views.test.ts test/admin-dashboard.adapter.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 2: Run static verification**

Run: `npm run check && npm test -- --reporter=dot`

Expected: PASS.

- [ ] **Step 3: Inspect final diff**

Run: `git diff main...HEAD -- src/components/dashboard src/modules/dashboard test/dashboard-views.test.ts docs/ui/dashboards.md`

Expected: only presentation, adapter-contract, test and documentation changes; no Prisma, API or provisioning changes.

- [ ] **Step 4: Commit verification artifacts only if needed**

No commit is expected unless a correction is required by verification.

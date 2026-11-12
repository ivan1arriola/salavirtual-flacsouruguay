# Desvinculación de asistente e historial UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el flujo administrativo para quitar una asignación de asistencia técnica sin motivo obligatorio, sincronizar los efectos externos y mostrar el historial operativo del asistente.

**Architecture:** Reutilizar el servicio transaccional ya creado para cancelar la asignación y auditarla. Exponerlo mediante `POST /api/v1/asistencia/asignaciones/desvincular`, ejecutar después las sincronizaciones de Google Meet y Google Calendar sin revertir el cambio local si Google falla, y conectar una acción cliente desde la tabla del detalle del asistente. El historial se obtiene desde `Auditoria`, se renderiza en la misma pantalla y las asignaciones canceladas dejan de participar en el resumen mensual porque el adaptador actual solo incluye estados activos.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6, Vitest, Google Meet/Calendar adapters existentes.

**Spec:** conversación de implementación y PR #63.

## Global Constraints

- No pedir ni almacenar motivo de desvinculación.
- Conservar trazabilidad de actor, fecha, reunión y asistente mediante `Auditoria`.
- No borrar asignaciones históricas; usar estado `CANCELADO`.
- No permitir desvincular una asignación ya incluida en una liquidación.
- Los fallos de sincronización con Google no deben revertir la desvinculación local; deben devolverse como advertencia.
- El resumen mensual debe recalcularse al refrescar la página y excluir la asignación cancelada.
- Mantener el flujo restringido a Administración.

---

### Task 1: Contrato de API y UI

**Files:**

- Create: `test/asistencia-desvinculacion-ui.test.ts`
- Test: `test/asistencia-desvinculacion-ui.test.ts`

**Interfaces:**

- Consumes: `POST /api/v1/asistencia/asignaciones/desvincular`, `AssistantMeetingsTable`, detalle `/asistentes/[usuarioId]`.
- Produces: contrato verificable de endpoint, acción “Quitar asignación” e historial visible.

- [ ] **Step 1: Write the failing test**

Crear una prueba de contrato que lea los archivos fuente y exija: export `POST` en la ruta dedicada, llamada al servicio `desvincularAsistenteAsignado`, sincronización posterior de cohosts/calendario, un componente cliente con texto `Quitar asignación`, y el detalle del asistente usando `obtenerHistorialAsistenteEnRango`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/asistencia-desvinculacion-ui.test.ts`
Expected: FAIL porque la ruta y la UI todavía no implementan el contrato.

### Task 2: Endpoint de desvinculación con sincronizaciones externas

**Files:**

- Create: `app/api/v1/asistencia/asignaciones/desvincular/route.ts`
- Test: `test/asistencia-desvinculacion-ui.test.ts`

**Interfaces:**

- Consumes: `desvincularAsistenteAsignado(db, actor, { asignacionId })`.
- Produces: `POST` con respuesta `{ assignment, warning, calendarioAsistente }`.

- [ ] **Step 1: Implement minimal POST handler**

Autenticar y resolver actor igual que el endpoint de asignación. Ejecutar `desvincularAsistenteAsignado`, luego `sincronizarCohostsDeInstancia` y `sincronizarCalendarioAsistenteInstancia`. Acumular advertencias sin revertir la cancelación.

- [ ] **Step 2: Run focused tests**

Run: `npx vitest run test/asistencia-desvinculacion-service.test.ts test/asistencia-desvinculacion-ui.test.ts`
Expected: el contrato de endpoint pasa; la parte de UI continúa fallando hasta Task 3.

### Task 3: Acción administrativa e historial visible

**Files:**

- Create: `src/components/assistant-unassign-button.tsx`
- Create: `src/components/assistant-history.tsx`
- Modify: `src/components/assistant-meetings-table.tsx`
- Modify: `app/(gestion)/asistentes/[usuarioId]/page.tsx`
- Modify: `app/(gestion)/admin-assistants.css`
- Test: `test/asistencia-desvinculacion-ui.test.ts`

**Interfaces:**

- Consumes: assignment `id`, `titulo`, endpoint dedicado, `RegistroHistorialAsistenciaPersonal[]`.
- Produces: botón de desvinculación por fila, refresco del servidor al completar y panel de historial cronológico.

- [ ] **Step 1: Add client unassign action**

Crear un botón cliente que pida confirmación simple, envíe `POST` con `{ asignacionId }`, muestre error/advertencia y ejecute `router.refresh()` al completar.

- [ ] **Step 2: Integrate action in table**

Añadir columna `Acciones` y renderizar `AssistantUnassignButton` para cada asignación activa mostrada.

- [ ] **Step 3: Render history in assistant detail**

Cargar `obtenerHistorialAsistenteEnRango` en paralelo con las reuniones del período y mostrar un panel `Historial de asignaciones` con acción, reunión, fecha del encuentro, momento del cambio y actor. Si no hay eventos, mostrar estado vacío.

- [ ] **Step 4: Add responsive styles**

Mantener la tabla utilizable y el historial legible en móvil; la acción destructiva debe ser visualmente secundaria, no competir con las acciones principales.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run test/asistencia-desvinculacion-domain.test.ts test/asistencia-desvinculacion-service.test.ts test/historial-asistente-adapter.test.ts test/asistencia-desvinculacion-ui.test.ts`
Expected: PASS.

### Task 4: Limpieza y verificación final

**Files:**

- Delete: `docs/test-write.txt`
- Review: todos los archivos modificados del PR.

**Interfaces:**

- Produces: rama lista para integrar.

- [ ] **Step 1: Remove probe file**

Eliminar `docs/test-write.txt` creado únicamente para verificar escritura del conector.

- [ ] **Step 2: Run full CI-equivalent verification**

Run: `npm run validate:schema && npx prisma validate && npm run check && npx vitest run --coverage && npm audit --omit=dev --audit-level=critical && npm run build`
Expected: PASS para todos los controles exigidos por el workflow.

- [ ] **Step 3: Review PR diff and CI**

Confirmar que no hay cambios ajenos al alcance, que PR #63 está mergeable y que el último workflow concluye `success` antes de integrar.

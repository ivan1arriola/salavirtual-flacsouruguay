# Etapa 9 Presentación Delgada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar los componentes de reuniones y asistencia dentro de la capa `presentation` de sus módulos y hacer que los puntos de entrada de `app/` consuman esas APIs públicas sin romper imports existentes.

**Architecture:** Los componentes específicos viven en `src/modules/<modulo>/presentation/components`. Los consumidores cliente usan entradas directas por componente para no arrastrar código de servidor desde barrels amplios. `src/components` conserva fachadas temporales y las rutas de `app/` delegan su composición a `src/bootstrap/ui/*.server.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md`

## Global Constraints

- No cambiar URLs, payloads HTTP, texto visible ni comportamiento de los componentes.
- No introducir acceso Prisma, Google o variables de entorno en `presentation`.
- Mantener fachadas en `src/components` para consumidores externos y pruebas legacy.
- Mantener Server Components por defecto y los límites `"use client"` existentes.
- Ejecutar `npm run check`, `npm test`, `npm run validate:schema` y `npm run build` antes del commit.

## Review Focus

- Los barrels de presentación no deben arrastrar código de servidor al grafo cliente.
- Las fachadas deben conservar exportaciones nombradas y tipos.
- Los imports relativos entre componentes movidos deben seguir resolviendo.
- `app/` no debe volver a consumir los paths legacy migrados.
- La mudanza no debe cambiar el HTML ni el comportamiento interactivo.

---

### Task 1: Contrato arquitectónico de presentación

**Files:**

- Create: `test/presentation-layer-boundaries.test.ts`

- [x] Escribir una prueba que exija las ubicaciones modulares y prohíba imports legacy desde `app/`.
- [x] Ejecutarla y comprobar que falla porque los componentes siguen en `src/components`.
- [x] Incluir la prueba junto con la migración funcional de la etapa.

### Task 2: Presentación de asistencia

**Files:**

- Create: `src/modules/asistencia/presentation/components/*.tsx`
- Modify: `src/modules/asistencia/presentation.ts`
- Modify: `src/components/assistant-*.tsx`, `src/components/coverage-assistance-actions.tsx`
- Modify: consumidores bajo `app/(gestion)` y componentes compartidos.

- [x] Mover los componentes sin cambiar su contenido funcional.
- [x] Crear fachadas de reexportación en los paths anteriores.
- [x] Migrar consumidores de la aplicación a entradas públicas específicas de `presentation/components`.
- [x] Ejecutar pruebas de UI de asistencia y TypeScript.

### Task 3: Presentación de reuniones

**Files:**

- Create: `src/modules/reuniones/presentation/components/*.tsx`
- Create: `src/modules/reuniones/presentation.ts`
- Modify: `src/components/meeting-*.tsx`, `src/components/series-management.tsx`
- Modify: páginas de reuniones bajo `app/(gestion)/reuniones`.

- [x] Mover los componentes sin cambiar su contenido funcional.
- [x] Crear fachadas de reexportación en los paths anteriores.
- [x] Migrar consumidores de `app/` a entradas públicas específicas de presentación.
- [x] Ejecutar pruebas de reuniones y TypeScript.

### Task 4: Controladores delgados y bootstrap de UI

**Files:**

- Create: `src/bootstrap/ui/asistencia/*.server.tsx`
- Create: `src/bootstrap/ui/reuniones/*.server.tsx`
- Modify: rutas de asistencia y reuniones bajo `app/(gestion)`.

- [x] Trasladar la composición con Prisma y autenticación a raíces `.server.tsx` de bootstrap.
- [x] Reducir las rutas de `app/` a delegación explícita, sin cambiar contratos de params o searchParams.
- [x] Probar automáticamente el límite de tamaño y la delegación de las rutas.

### Task 5: Verificación integral y cierre

- [x] Ejecutar `npx vitest run test/presentation-layer-boundaries.test.ts test/architecture-boundaries.test.ts test/functional-architecture.test.ts`.
- [x] Ejecutar `npm run check`.
- [x] Ejecutar `npm test`.
- [x] Ejecutar `npm run validate:schema`.
- [x] Ejecutar `npm run build`.
- [x] Revisar `git diff --check` y crear un commit atómico de Etapa 9.

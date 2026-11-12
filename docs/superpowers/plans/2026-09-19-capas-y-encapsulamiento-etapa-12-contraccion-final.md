# Etapa 12 Contracción y Cierre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar fachadas temporales sin consumidores, ampliar los controles arquitectónicos a los módulos migrados y dejar el programa de capas documentado y verificable en CI.

**Architecture:** Primero se caracteriza cada fachada y se migran sus últimos consumidores a `api.ts`, `presentation.ts` o bootstrap. Solo después se elimina. Las pruebas de arquitectura pasan de permitir compatibilidad temporal a rechazarla explícitamente.

**Tech Stack:** TypeScript, Vitest, Next.js 16, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md`

## Global Constraints

- No eliminar una fachada con consumidores.
- No cambiar URLs, payloads, esquema ni comportamiento observable.
- Los componentes cliente no importan archivos `.server.ts`.
- La CI conserva `check`, `test`, `validate:schema` y `build`.

## Review Focus

- Las búsquedas de imports no dejan referencias internas legacy.
- El acceso entre módulos se hace por APIs públicas.
- Presentation no alcanza Prisma ni infraestructura por imports directos.
- Los jobs y rutas siguen pudiendo construirse desde bootstrap.
- La documentación identifica validación local, publicación, CI, despliegue y rollback como estados distintos.

### Task 1: Inventario y eliminación segura de fachadas

**Files:**

- Modify: fachadas bajo `src/components/assistant-*.tsx`, `src/components/meeting-*.tsx`, `src/components/series-management.tsx`
- Modify: consumidores restantes identificados por `rg`
- Test: `test/presentation-layer-boundaries.test.ts`

- [x] Escribir una prueba que falle mientras exista una fachada de presentación migrada sin consumidores.
- [x] Ejecutar RED y verificar que no quedan consumidores productivos.
- [x] Eliminar únicamente fachadas con cero referencias, incluyendo la prueba GREEN.

### Task 2: Reglas finales de arquitectura

**Files:**

- Modify: `test/architecture-boundaries.test.ts`
- Modify: `test/functional-architecture.test.ts`
- Modify: `docs/arquitectura.md`

- [x] Mantener las pruebas de bootstrap, rutas delgadas y accesos cross-module privados ya introducidas en las etapas previas.
- [x] Ejecutar GREEN sin excepciones nuevas.

### Task 3: Cierre verificable y commit

- [x] Ejecutar `npm run check`, `npm test`, `npm run validate:schema` y `npm run build`.
- [x] Ejecutar `git diff --check`.
- [x] Crear el commit `refactor(architecture): contraer fachadas y cerrar capas (etapa 12)`.

# Etapa 10 Scripts y Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que los jobs operativos de reportes mensuales y sincronización de archivos deleguen en bootstrap y casos de uso, preservando autorización, ventanas de procesamiento y resultados HTTP.

**Architecture:** Los Route Handlers autentican y traducen HTTP. `src/bootstrap/*.server.ts` compone dependencias. La selección de eventos y ejecución de sincronización vive en `archivos/application`; el envío mensual usa la API pública de liquidaciones ya compuesta por bootstrap. Los scripts de migración histórica, reparación manual y despliegue quedan fuera de esta etapa: no son jobs periódicos operativos.

**Tech Stack:** Next.js 16 Route Handlers, TypeScript, Prisma 6, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md`

## Global Constraints

- No modificar tablas, URLs, payloads ni permisos.
- Conservar `CRON_SECRET`, `runtime = "nodejs"` y `maxDuration = 300`.
- Mantener una única ejecución por request y el límite de 25 eventos de sincronización.
- No ejecutar jobs, scripts `--apply` ni escrituras contra la base configurada durante las pruebas.

## Review Focus

- Un cron sin secreto devuelve 401 antes de construir dependencias.
- La ruta manual de archivos mantiene el permiso actual por rol.
- La selección conserva las ventanas caliente, intermedia y de cierre sin duplicar IDs.
- Un resultado incompleto de reportes conserva HTTP 500 y el payload original.
- Ningún Route Handler importa Prisma ni servicios internos legacy.

### Task 1: Caso de uso de lote de artefactos

**Files:**
- Create: `src/modules/archivos/application/sincronizar-lote-operativo.ts`
- Modify: `src/modules/archivos/ports/archivos-repository.port.ts`
- Modify: `src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter.ts`
- Test: `test/archivos-operational-batch.test.ts`

- [x] Escribir pruebas que pidan hasta 25 eventos y prioricen las tres ventanas sin repetir IDs.
- [x] Ejecutar `npx vitest run test/archivos-operational-batch.test.ts` y comprobar RED.
- [x] Definir `seleccionarEventosOperativosUseCase(repository, ahora, limit)` y el puerto de lectura en lenguaje de negocio.
- [x] Implementar el adaptador Prisma y comprobar GREEN.

### Task 2: Bootstrap y rutas cron delgadas

**Files:**
- Modify: `src/bootstrap/archivos.server.ts`
- Modify: `src/bootstrap/liquidaciones.server.ts`
- Modify: `app/api/v1/reuniones/sincronizar-archivos/route.ts`
- Modify: `app/api/v1/asistencia/reportes-mensuales/route.ts`
- Test: `test/operational-jobs-boundaries.test.ts`

- [x] Caracterizar el lote operativo desde application y conservar el contrato de respuesta de la ruta.
- [x] Exponer `sincronizarArtefactosOperativos(ahora?: Date)` y reutilizar `enviarReportesMensuales` desde bootstrap.
- [x] Reducir las rutas a guardas HTTP, autorización y serialización de resultados.
- [x] Ejecutar las pruebas focalizadas y comprobar GREEN.

### Task 3: Verificación y commit de etapa

- [x] Ejecutar `npm run check`, `npm test`, `npm run validate:schema` y `npm run build`.
- [x] Ejecutar `git diff --check`.
- [x] Crear el commit `refactor(jobs): delegar cron operativos a application (etapa 10)`.

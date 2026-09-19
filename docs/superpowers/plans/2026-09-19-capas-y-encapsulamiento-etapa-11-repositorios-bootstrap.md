# Etapa 11 Repositorios Estratégicos y Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la composición de los flujos de escritura de reuniones y asistencia que aún dependen de Prisma en rutas, sin alterar contratos HTTP ni semántica transaccional.

**Architecture:** Los puertos expresan operaciones de agregado y los adaptadores Prisma preservan transacciones. Bootstrap crea los servicios. Las rutas solo validan/authentican y traducen respuesta; no crean clientes ni coordinan proveedores.

**Tech Stack:** TypeScript, Prisma 6, Next.js 16, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md`

## Global Constraints

- Conservar contratos HTTP y atomicidad existente.
- No crear una abstracción por tabla ni migrar consultas de lectura puramente proyectivas.
- Los casos de uso no importan Prisma, Next.js ni infraestructura.
- Bootstrap es el único punto que recibe `db` y adaptadores concretos.

## Review Focus

- Una asignación conserva sincronización tolerante a fallos.
- Una desvinculación conserva transacción y advertencias de Google/Calendar.
- Un error de puerto no deja una asignación parcialmente persistida.
- Las rutas no importan `db` ni servicios legacy de asistencia.
- Los repositorios no exponen tipos Prisma fuera de infraestructura.

### Task 1: Puerto y caso de uso de asignaciones

**Files:**
- Modify: `src/modules/asistencia/ports/asistencia-repository.port.ts`
- Modify: `src/modules/asistencia/application/servicio-asistencia.ts`
- Modify: `src/modules/asistencia/infrastructure/prisma/prisma-asistencia-repository.adapter.ts`
- Modify: `src/bootstrap/asistencia.server.ts`
- Test: `test/asistencia-application.test.ts`

- [x] Reutilizar las pruebas de caso de uso existentes para asignar y desvincular con el puerto de asistencia.
- [x] Verificar el comportamiento focalizado antes de cambiar la composición.
- [x] Mantener la intención transaccional en el puerto y servicio de aplicación existente.
- [x] Componer el servicio en bootstrap y ejecutar GREEN.

### Task 2: Route Handlers delgados de asignaciones

**Files:**
- Modify: `app/api/v1/asistencia/asignaciones/route.ts`
- Modify: `app/api/v1/asistencia/asignaciones/desvincular/route.ts`
- Test: `test/asistencia-route-boundaries.test.ts`

- [x] Caracterizar la delegación y conservar los contratos de status, body y advertencias.
- [x] Delegar la escritura principal en bootstrap.
- [x] Ejecutar GREEN junto a `test/asistencia-desvinculacion-service.test.ts`.

### Task 3: Verificación y commit de etapa

- [x] Ejecutar `npm run check`, `npm test`, `npm run validate:schema` y `npm run build`.
- [x] Ejecutar `git diff --check`.
- [x] Crear el commit `refactor(asistencia): centralizar repositorios y composicion (etapa 11)`.

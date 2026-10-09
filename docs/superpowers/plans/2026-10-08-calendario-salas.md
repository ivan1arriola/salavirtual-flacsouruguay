# Calendario de salas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer una agenda semanal de todos los calendarios de salas Meet y vincular cada evento con su reunión administrable en Sala Virtual.

**Architecture:** El servidor lista los eventos de Google Calendar impersonando cada cuenta de sala activa y los reconcilia con `EventoProveedor.externalEventId`. La página presenta los eventos conocidos y externos, y enlaza a la ficha de la reunión para editar un encuentro o su serie.

**Tech Stack:** Next.js, Prisma, Google Calendar API, TypeScript, Vitest.

**Spec:** Diseño conversado el 8 de octubre de 2026.

## Global Constraints

- Consultar los calendarios con la cuenta de sala como sujeto de delegación.
- No editar eventos externos desde el calendario.
- Mostrar fechas y horas en America/Montevideo.

## Review Focus

- Un evento de Google sin correspondencia local se identifica como externo.
- Cada evento administrado conserva un enlace a su reunión y serie.
- Un fallo de una sala no impide ver las demás.

### Task 1: Reconciliación de eventos

**Files:** `src/modules/reuniones/calendario-salas.domain.ts`, `test/calendario-salas-domain.test.ts`

- [ ] Escribir pruebas de unión por `externalEventId` y detección de eventos externos.
- [ ] Implementar la reconciliación pura y verificarla.

### Task 2: Consulta Google y vista

**Files:** `src/modules/meet/google-calendar.adapter.ts`, `app/(gestion)/calendario-salas/page.tsx`, `src/components/app-shell.tsx`

- [ ] Listar los eventos de cada cuenta activa en el intervalo de una semana.
- [ ] Mostrar agenda, origen, conflictos de sincronización y enlaces de edición.
- [ ] Agregar el acceso de administración y verificar TypeScript y pruebas.

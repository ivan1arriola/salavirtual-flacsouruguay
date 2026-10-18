# Navegación Administrativa F2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear las secciones administrativas con el trabajo diario, Monitoreo, Recursos y Sistema, sin cambiar rutas ni autorización.

**Architecture:** Reubicar el enlace existente de asistentes dentro del grupo de Monitoreo. Mantener los cuatro destinos móviles actuales y sus URLs.

**Tech Stack:** TypeScript, React, Next.js, Vitest.

**Spec:** Arquitectura de navegación aprobada en el brief de rediseño.

## Global Constraints

- No cambiar contratos de ruta ni autorización del servidor.
- Mantener navegación móvil con los cuatro destinos principales y el menú Más.
- Conservar todos los enlaces existentes.

## Review Focus

- Recursos contiene solo Grabaciones y archivos y Personas y programas.
- Monitoreo contiene Monitoreo y Asistentes de monitoreo.
- Los grupos docente y asistente quedan intactos.
- Los cuatro destinos móviles administrativos mantienen sus rutas.

## Tasks

- [x] Añadir expectativas de agrupación administrativa y comprobar que fallen.
- [x] Reubicar el enlace y mantener las cuatro rutas móviles.
- [x] Ejecutar pruebas focalizadas, typecheck y diff check.
- [ ] Documentar, crear PR y fusionar tras verificar validaciones locales/remotas.

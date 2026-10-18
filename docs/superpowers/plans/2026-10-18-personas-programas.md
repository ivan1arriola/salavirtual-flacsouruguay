# Personas y Programas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar la gestión de personas y programas en `/usuarios` con dos vistas, y retirar “Unidad académica” de la interfaz sin eliminar datos persistidos.

**Architecture:** Reutilizar `ProgramMembersConfig` en la vista Programas. Las acciones siguen protegidas por `requireAdmin`; incorporan un destino de retorno validado para conservar los formularios desde Configuración y Usuarios. La ruta histórica de Configuración se redirige a la nueva vista.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, Vitest.

**Spec:** Aprobación explícita del usuario en la conversación del 2026-10-18; conservar datos y rutas internas existentes.

## Global Constraints

- Mantener autorización actual de administración y contratos/API existentes.
- Mantener campos y asociaciones `unidadAcademicaId` persistidos.
- No introducir cambios en reglas de negocio ni migraciones.
- Mantener navegación accesible por teclado y responsive.

## Review Focus

- Las acciones deben aceptar solo destinos de retorno conocidos.
- Editar un programa sin enviar `unidadAcademicaId` no debe borrar la asociación almacenada.
- Invitaciones y asociaciones deben seguir usando las acciones existentes.
- El query de Configuración para programas debe seguir abriendo la gestión centralizada.
- Ningún texto ni control de “Unidad académica” debe quedar en la interfaz de programas.

## Files and Responsibilities

- `app/(gestion)/usuarios/page.tsx`: selector Personas/Programas y carga condicional.
- `src/components/program-members-config.tsx`: editor reutilizable sin campo de unidad; contexto de retorno.
- `app/(gestion)/configuracion/page.tsx`: conservar alias histórico y eliminar duplicación de la pantalla de programas.
- `app/(gestion)/configuracion/actions.ts`: retorno seguro según contexto y entrada opcional para asociación heredada.
- `src/modules/programas/programas-admin.domain.ts` y `.service.ts`: preservar asociación omitida en actualizaciones.
- `src/modules/configuracion/settings-navigation.domain.ts`: eliminar Programas del menú de configuración sin romper links antiguos.
- tests de dominio, acciones/navegación y render contracts para los casos anteriores.
- `README.md`: documentar las decisiones de UX y compatibilidad.

## Tasks

- [x] Add failing tests for tab URL resolution, legacy route resolution, and preservation of omitted academic-unit association.
- [x] Implement shared program view and safe action return context.
- [x] Remove academic-unit controls/data from the UI while retaining persisted data.
- [x] Add a regression test for the prior program route and verify existing server authorization remains in place.
- [x] Run focused tests, typecheck, full suite, production build, and diff checks.
- [ ] Document the change, commit, open a small PR, and merge only after required checks pass.

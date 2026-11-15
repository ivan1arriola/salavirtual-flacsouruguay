# Reorganización de /configuracion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar el menú de configuración y mover el contenido para que Zoom, lo operativo y el correo queden donde corresponde.

**Architecture:** Solo cambian metadatos de navegación, el shell y la composición de `configuracion/page.tsx`. Los ids de sección, URLs, APIs y permisos no cambian.

**Tech Stack:** Next.js (leer `node_modules/next/dist/docs/` si se toca algo de routing; este plan no lo requiere), React server components, Vitest, CSS plano en `app/(gestion)/configuration-center.css`.

**Spec:** `docs/superpowers/specs/2026-11-15-configuracion-reorganizacion-design.md`

## Global Constraints

- No cambiar ids de sección: `resumen, workspace, zoom, salas, programas, asistencia, correo, historico`.
- No cambiar `settingsHref` ni `legacySettingsRedirect`.
- Textos en español rioplatense, como el resto de la UI.
- Menú: grupos "Integraciones" (workspace, zoom), "Operación" (salas, asistencia), "Comunicación" (correo), "Datos" (historico); `resumen` sin grupo.
- Salas, descripción: "Cuentas de Zoom y Meet que alojan reuniones".
- Sin cambios de Prisma ni de formularios.

## Review Focus

- Enlace viejo `?seccion=salas` sigue mostrando las cuentas (sin el bloque del grupo Zoom).
- Resumen con 0 operaciones pendientes no debe mostrar un bloque vacío roto.
- Sección Zoom sin `configuracionZoom` (primera vez): `zoomGrupo` es `null` y `ZoomGrupoConfig` recibe nulos sin romper.
- Menú móvil y lateral muestran los mismos grupos.
- Enlace "operaciones pendientes" del aviso del Resumen apunta al bloque de la misma página.

---

### Task 1: Menú agrupado

**Files:**
- Modify: `src/modules/configuracion/settings-navigation.domain.ts`
- Modify: `src/components/settings-center-shell.tsx`
- Modify: `app/(gestion)/configuration-center.css`
- Test: `test/settings-navigation-domain.test.ts`, `test/settings-center-shell.test.tsx`

**Interfaces:**
- Produces: `SettingsSectionMetadata` con campo opcional `group?: "Integraciones" | "Operación" | "Comunicación" | "Datos"`.

- [ ] **Step 1: Escribir tests que fallan**
  - En `settings-navigation-domain.test.ts`: `SETTINGS_SECTIONS.map(({ id, group }) => [id, group])` es igual a `[["resumen", undefined], ["workspace","Integraciones"], ["zoom","Integraciones"], ["salas","Operación"], ["asistencia","Operación"], ["correo","Comunicación"], ["historico","Datos"]]`.
  - En `settings-center-shell.test.tsx`: renderizar con `activeSection="salas"`; cada título de grupo aparece 2 veces (rail y móvil): `html.match(/Integraciones/g)` tiene longitud 2, igual para "Operación", "Comunicación" y "Datos".
- [ ] **Step 2: Ejecutar `npx vitest run test/settings-navigation-domain.test.ts test/settings-center-shell.test.tsx`; deben fallar.**
- [ ] **Step 3: Agregar `group` a cada entrada de `SETTINGS_SECTIONS` según la tabla de Global Constraints.**
- [ ] **Step 4: En el shell, extraer `function SettingsNavList({ activeSection, navigationDetails })`** que mapea `SETTINGS_SECTIONS` y antes de un ítem cuyo `group` difiere del anterior renderiza `<p className="settings-nav-group">{group}</p>`. Usarlo en el `<nav>` del rail y en el del menú móvil (elimina el mapeo duplicado). Agregar `.settings-nav-group` al CSS (misma tipografía que `.settings-center__rail-label`, sin borde, margen superior 8px).
- [ ] **Step 5: Ejecutar los mismos tests; deben pasar.**
- [ ] **Step 6: Commit** `feat(configuracion): menú agrupado por tipo de tarea`.

### Task 2: Todo Zoom en la sección Zoom

**Files:**
- Modify: `src/modules/configuracion/configuracion-page.service.ts` (condición de `zoomGrupo`)
- Modify: `app/(gestion)/configuracion/page.tsx`
- Modify: `src/modules/configuracion/settings-navigation.domain.ts` (descripción de salas)
- Test: `test/configuracion-page-salas.test.ts`

**Interfaces:**
- Consumes: Task 1 (metadatos).
- Produces: `obtenerDatosPaginaConfiguracion(db, "zoom")` devuelve `zoomGrupo` poblado; con `"salas"` devuelve `zoomGrupo: null`.

- [ ] **Step 1: Test que falla** en `configuracion-page-salas.test.ts`: con `"zoom"`, `datos.zoomGrupo` es el objeto del mock (`grupoId: "g-1"`); con `"salas"`, `datos.zoomGrupo` es `null` y `contarReunionesFuturasZoom` (groupBy) sigue llamándose. Ajustar las aserciones existentes que esperaban `zoomGrupo` en salas.
- [ ] **Step 2: Ejecutar; debe fallar.**
- [ ] **Step 3: En el servicio**, cambiar la condición de `zoomGrupo` de `section === "salas"` a `section === "zoom"`; `contarReunionesFuturasZoom` queda en `"salas"`.
- [ ] **Step 4: En `page.tsx`**, mover `<ZoomGrupoConfig .../>` del bloque `salas` al bloque `zoom` (después de `ZoomWebhookConfig`). Cambiar la descripción del encabezado de Zoom a "Credenciales, webhook y grupo de cuentas de Zoom." y la de Salas a la de Global Constraints (en el encabezado y en `SETTINGS_SECTIONS`).
- [ ] **Step 5: Ejecutar `npx vitest run test/configuracion-page-salas.test.ts`; debe pasar.**
- [ ] **Step 6: Commit** `refactor(configuracion): el grupo de Zoom vive en la sección Zoom`.

### Task 3: Operaciones pendientes en el Resumen

**Files:**
- Modify: `app/(gestion)/configuracion/page.tsx`
- Modify: `src/components/settings-overview.tsx` (enlace del aviso)
- Test: `test/settings-center-shell.test.tsx`

**Interfaces:**
- Consumes: `workspaceReadiness` de `settings-navigation.domain.ts`.

- [ ] **Step 1: Test que falla**: en el test del aviso, el enlace de operaciones pendientes tiene `href="#operaciones-pendientes"` y ya no `?seccion=workspace` para ese texto.
- [ ] **Step 2: Ejecutar; debe fallar.**
- [ ] **Step 3: En `settings-overview.tsx`**, el `<Link>` de "operaciones pendientes" apunta a `#operaciones-pendientes`.
- [ ] **Step 4: En `page.tsx`**:
  - Debajo de `<SettingsOverview/>` en el Resumen, renderizar `<section id="operaciones-pendientes" className="content-section settings-workspace-health"><PendingMeetOperationsManager items={pendingOperationItems} /></section>` solo si `pendingOperationItems.length > 0`.
  - Quitar ese bloque de la sección workspace.
  - Encabezado de Workspace: `status` pasa a `workspaceReadiness({...})` con los campos de `configuration` (`privateKeyConfigurada` = `Boolean(privateKeyCifrada || privateKey)`): texto `"{readyCount} de {totalCount} requisitos"`, clase `is-ok` si `ready`, si no `is-warning`.
  - `navigationDetails.workspace` pasa a ser siempre `"Integración y permisos"`.
- [ ] **Step 5: Ejecutar tests de shell; deben pasar. Verificar a mano en `npm run dev` que Resumen con y sin pendientes renderiza.**
- [ ] **Step 6: Commit** `feat(configuracion): operaciones pendientes de Meet en el Resumen`.

### Task 4: Correo — ajustes separados de pruebas

**Files:**
- Modify: `app/(gestion)/configuracion/page.tsx` (bloque `correo`)
- Modify: `app/(gestion)/configuration-center.css` (si el subtítulo necesita estilo)

- [ ] **Step 1: En el bloque `correo`**, dejar `SesEmailSettingsForm` y su aviso de estado arriba; luego `<h3 className="settings-subsection-title">Pruebas y diagnóstico</h3>` seguido de `EmailTestForm` y `MailDeliveryDiagnostics`. Estilo mínimo para `.settings-subsection-title` (margen superior, tamaño de h3 existente).
- [ ] **Step 2: Verificar en `npm run dev`** que `/configuracion?seccion=correo` muestra el subtítulo y que guardar SES sigue redirigiendo con el aviso.
- [ ] **Step 3: Ejecutar `npx vitest run` y `npx tsc --noEmit`; deben pasar.**
- [ ] **Step 4: Commit** `refactor(configuracion): pruebas de correo bajo su propio subtítulo`.

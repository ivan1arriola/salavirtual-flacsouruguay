# Configuración por áreas, sin Meet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `/configuracion?seccion=…` por rutas por área (`/configuracion/{zoom,google,salas,correo,notificaciones,historico}`) con un Inicio de estado, sin ningún rastro de Google Meet.

**Architecture:** La lista de secciones y las redirecciones viven en `settings-navigation.domain.ts` (puro, testeable). Cada área es una `page.tsx` que se protege a sí misma, carga solo sus datos y se envuelve en el `SettingsCenterShell` existente. Los bloques con "Editar" son un componente `<details>` que envuelve los formularios actuales, sin reescribirlos.

**Tech Stack:** Next.js (versión con cambios de ruptura: ver Task 0), React server components, Prisma, vitest, eslint.

**Spec:** `docs/superpowers/specs/2026-11-17-configuracion-rutas-por-area-design.md`

## Global Constraints

- Solo rol `ADMINISTRACION` accede; sin cambios en endpoints `/api/v1/configuracion/*`, modelo de datos, cifrado.
- No borrar código de Meet (servicios, adaptadores, APIs): solo dejar de referenciarlo desde la configuración.
- Textos en español rioplatense ("Revisá", "Editá"), como el resto de la UI.
- Los enlaces `?seccion=` antiguos deben seguir redirigiendo.
- Desvío del spec: **no hay `layout.tsx` con el guard de rol**. Un layout de Next no se vuelve a ejecutar al navegar entre páginas hijas, así que cada `page.tsx` llama a `requireAdminPage()`.

## Review Focus

- `?seccion=` desconocido o vacío → Inicio, sin error.
- `?seccion=historico&busqueda=x&pagina=2` → llega a `/configuracion/historico` conservando `busqueda` y `pagina`.
- Entrar directo a `/configuracion/zoom` (o cualquier subruta) sin ser ADMINISTRACION → redirige a `/`.
- Zoom sin credenciales / Google sin configuración guardada / cero cuentas Zoom → cada pantalla muestra su estado vacío, no rompe.
- Cuentas Meet existentes en la base no aparecen en Salas ni cuentan en el Inicio.

---

### Task 0: Preparación

- [ ] **Step 1:** Crear rama desde `main` o la actual: `git switch -c feat/configuracion-por-areas`.
- [ ] **Step 2:** Leer en `node_modules/next/dist/docs/` las guías de páginas/layouts, `redirect` y `revalidatePath` (AGENTS.md avisa de cambios de ruptura). Confirmar que `searchParams` sigue siendo `Promise` y la firma de `revalidatePath(path, "layout")`.
- [ ] **Step 3:** Línea base: `npx vitest run test/settings-navigation-domain.test.ts test/settings-center-shell.test.tsx test/configuracion-page-salas.test.ts test/settings-overview-zoom.test.tsx` → PASS.

### Task 1: Navegación y redirecciones (dominio)

**Files:**
- Modify: `src/modules/configuracion/settings-navigation.domain.ts`
- Test: `test/settings-navigation-domain.test.ts`

**Interfaces:**
- Produces:
  - `SETTINGS_SECTION_IDS = ["resumen","zoom","google","salas","correo","notificaciones","historico"]`
  - `SettingsSectionMetadata` gana `hidden?: true` (no aparece en el menú). `historico` lleva `hidden: true`.
  - Grupos: Zoom y Google → "Integraciones"; Salas → "Operación"; Correo y Notificaciones → "Comunicación". `resumen` e `historico` sin grupo. Etiquetas: "Resumen", "Zoom", "Google", "Salas", "Correo", "Notificaciones", "Registros Zoom importados". Se retira el grupo "Datos".
  - `settingsHref(section): string` → `/configuracion` para `resumen`, si no `/configuracion/${section}`.
  - `legacySettingsRedirect(section?: string, params?: Readonly<{ busqueda?: string; pagina?: string }>): string | null` con el mapa: `workspace→/configuracion/google`, `asistencia→/configuracion/notificaciones`, `zoom|salas|correo→/configuracion/<id>`, `historico→/configuracion/historico` (añade `?busqueda=…&pagina=…` solo si vienen), `programas→/usuarios?vista=programas`; cualquier otro valor o ausencia → `null`.
  - `resolveSettingsSection`, `settingsNeedsAttention`, `workspaceReadiness` se conservan (workspaceReadiness sigue con 4 comprobaciones).

- [ ] **Step 1: Reescribir los tests** de `settings-navigation-domain.test.ts` para las ids, grupos y etiquetas nuevos; `settingsHref("google")` = `/configuracion/google`; `settingsHref("resumen")` = `/configuracion`; `legacySettingsRedirect` para cada clave del mapa (incluido `historico` con y sin `busqueda`/`pagina`), `legacySettingsRedirect("otra")` y `legacySettingsRedirect()` = `null`; el menú (secciones sin `hidden`) no contiene `historico`.
- [ ] **Step 2:** `npx vitest run test/settings-navigation-domain.test.ts` → FAIL.
- [ ] **Step 3:** Implementar en `settings-navigation.domain.ts` según Interfaces (el campo `icon` se conserva; `google` usa `"workspace"`, `notificaciones` usa `"assistance"`).
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5:** Commit `feat(configuracion): rutas por área en la navegación`.

### Task 2: Datos de la página sin Meet

**Files:**
- Modify: `src/modules/configuracion/configuracion-page.service.ts`
- Test: `test/configuracion-page-salas.test.ts`

**Interfaces:**
- Consumes: nombres de sección de Task 1 (`"zoom" | "salas" | "notificaciones" | …`).
- Produces: `obtenerDatosPaginaConfiguracion(db, section: string, ahora?: Date)` devuelve `{ configuration, assistantConfiguration, hosts, programCount, activeProgramCount, adminReportRecipients, availableHosts, zoomAvailableHosts, zoomGrupo }`. Desaparecen `pendingMeetOperations`, `pendingOperationItems`, `programs`, `teachers`, `academicUnits` y el tipo `OperacionPendienteItem` solo si ningún otro archivo lo importa (`grep` antes de borrar; si alguien lo usa, déjalo).

- [ ] **Step 1: Ajustar el test** existente: la consulta de `cuentaProveedor.findMany` debe tener `where.proveedor.tipo` igual a `"ZOOM"` (ya no `in`), y `hosts` no incluye `meet-1` aunque el mock lo devuelva… el mock devuelve lo que se le pide, así que el test valida el `where`, y que `eventoProveedor.findMany` **no** se llama. `adminReportRecipients` se consulta solo con `section === "notificaciones"` (test con ambas secciones). Mantener los asserts de `groupBy` y `zoomGrupo`.
- [ ] **Step 2:** `npx vitest run test/configuracion-page-salas.test.ts` → FAIL.
- [ ] **Step 3:** Implementar: filtro ZOOM, quitar consulta de operaciones pendientes y la rama `programas`, renombrar la condición `"asistencia"` → `"notificaciones"`.
- [ ] **Step 4:** PASS. Luego `npx tsc --noEmit`; los errores restantes serán los consumidores de campos eliminados (se arreglan en Task 4); anótalos.
- [ ] **Step 5:** Commit `refactor(configuracion): datos de página solo con cuentas Zoom`.

### Task 3: Componentes: bloque con Editar, avisos, Inicio y shell

**Files:**
- Create: `src/components/settings-block.tsx`
- Modify: `src/components/settings-center-shell.tsx`, `src/components/settings-overview.tsx`
- Test: `test/settings-center-shell.test.tsx`, `test/settings-overview-zoom.test.tsx`, create `test/settings-block.test.tsx`

**Interfaces:**
- Produces:
  - `SettingsBlock({ title, summary, status?, children, defaultOpen? }): JSX` — `<section>` con `<h2>{title}</h2>`, el `summary` (ReactNode) siempre visible, y los `children` dentro de `<details>` cuyo `<summary>` dice "Editar" (con `open` si `defaultOpen`). `status?: { tone: "ok" | "warning" | "neutral"; label: string }` se dibuja con la clase existente `settings-section-status is-<tone>`.
  - `SettingsNotices({ estado, error, mensajes }: { estado?: string; error?: string; mensajes: Readonly<Record<string,string>> })` — `<p className="form-notice" role="status">` si `mensajes[estado]` existe; `<p className="form-notice form-notice-error" role="alert">` si hay `error`.
  - `SettingsCenterShell` no cambia de firma; la lista del menú filtra `hidden`; si `activeSection` es `historico` usa su metadata para el selector móvil.
  - `SettingsOverviewData` pierde `pendingOperations` y `totalHosts` pasa a significar cuentas Zoom.

- [ ] **Step 1: Tests.** `settings-block.test.tsx`: renderiza título, resumen visible y "Editar" con los hijos dentro de `<details>`; con `defaultOpen` el `<details>` lleva `open`. `settings-center-shell.test.tsx`: los grupos esperados son `Integraciones`, `Operación`, `Comunicación` (sin "Datos"); borrar los tests de operaciones pendientes; el test de íconos queda con **1** aviso (el de Google sin config) y comprueba aviso == ícono; el menú no contiene "Registros Zoom importados". `settings-overview-zoom.test.tsx`: ajustar al nuevo `SettingsOverviewData` y exigir que ningún HTML contenga "Meet". Nuevo caso: `SettingsNotices` con `estado` conocido, desconocido y `error`.
- [ ] **Step 2:** `npx vitest run test/settings-block.test.tsx test/settings-center-shell.test.tsx test/settings-overview-zoom.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar. En el Inicio: tarjetas Zoom, Google, Salas (`"N cuentas Zoom"`), Correo, Notificaciones, Programas (enlace a `/usuarios?vista=programas`) y Registros Zoom importados (`/configuracion/historico`); todos los `href` salen de `settingsHref`. Eliminar `GoogleAttention` de operaciones pendientes; el aviso de Google solo cubre "completar" y "activar". El shell reutiliza las clases CSS actuales; si `SettingsBlock` necesita estilo, añadirlo a `app/(gestion)/settings.css` reutilizando variables existentes.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(configuracion): bloque con Editar, avisos e Inicio sin Meet`.

### Task 4: Rutas por área y retiro del monolito

**Files:**
- Create: `app/(gestion)/configuracion/require-admin-page.ts`, `zoom/page.tsx`, `google/page.tsx`, `salas/page.tsx`, `correo/page.tsx`, `notificaciones/page.tsx`, `historico/page.tsx`, `src/components/zoom-agenda-block.tsx`
- Modify: `app/(gestion)/configuracion/page.tsx` (queda como Inicio), `app/(gestion)/configuracion/actions.ts`, `app/(gestion)/historico/page.tsx`, `app/(gestion)/centro-operaciones/page.tsx:33`, `src/components/acceso-registros-zoom.tsx:9`, `src/components/historical-meetings-table.tsx:53`
- Test: `test/configuracion-redirecciones.test.ts` (nuevo)

**Interfaces:**
- Produces: `requireAdminPage(): Promise<Session>` — llama `auth()`, y si `session?.user.role !== "ADMINISTRACION"` hace `redirect("/")`; devuelve la sesión.
- `zoom-agenda-block.tsx` exporta `ZoomAgendaBlock()` con el texto de agenda y `SincronizarAgendaZoomBoton` que hoy está escrito dentro de `page.tsx`.
- `actions.ts`: `actualizarReportesAsistenciaAdmin` redirige a `/configuracion/notificaciones?estado=reportes-asistencia-actualizados` (o `?error=`); `actualizarCorreoSesAdmin` a `/configuracion/correo?estado=correo-ses-actualizado` (o `?error=`); todas las `revalidatePath("/configuracion")` pasan a `revalidatePath("/configuracion", "layout")`. Las acciones de programas siguen yendo a `/usuarios?vista=programas`; su rama `seccion=programas` de `/configuracion` se elimina.

Contenido por pantalla (cada una: `requireAdminPage()`, `obtenerDatosPaginaConfiguracion(db, "<id>")`, `SettingsCenterShell`, `SettingsSectionHeader`, `SettingsNotices`):
- **Inicio** (`page.tsx`): si `legacySettingsRedirect(seccion, {busqueda, pagina})` devuelve ruta → `redirect`. Si no, `SettingsOverview` con datos reales.
- **zoom**: cuatro `SettingsBlock`: Conexión OAuth (`ZoomConfigForm`), Grupo de cuentas (`ZoomGrupoConfig`), Notificaciones de Zoom (`ZoomWebhookConfig`), Agenda (`ZoomAgendaBlock`). Resúmenes con estado actual (credenciales disponibles/ausentes, grupo y última sincronización, webhook configurado sí/no). Sin credenciales, el bloque de conexión abre con `defaultOpen`.
- **google**: `WorkspaceConfigForm` en bloques cuenta de servicio/delegación y Drive; encabezado con `workspaceReadiness`. Estado vacío cuando no hay configuración guardada.
- **salas**: `MeetHostsConfig` con las cuentas Zoom. Encabezado con "N de M cuentas habilitadas".
- **correo**: `SesEmailSettingsForm` en `SettingsBlock`; debajo "Pruebas y diagnóstico" (`EmailTestForm`, `MailDeliveryDiagnostics`) con la misma consulta de auditoría actual movida aquí.
- **notificaciones**: `AssistantReportConfigForm`.
- **historico**: el contenido actual de `HistoricalMeetingsTable`; `busqueda`/`pagina` de sus `searchParams`; los enlaces internos apuntan a `/configuracion/historico`.

- [ ] **Step 1: Test** `configuracion-redirecciones.test.ts` sobre `legacySettingsRedirect` ya hecho en Task 1; aquí probar `requireAdminPage` con `vi.mock("@/auth")` y `vi.mock("next/navigation")`: sin sesión y con rol `DOCENTE` llama `redirect("/")`; con `ADMINISTRACION` devuelve la sesión.
- [ ] **Step 2:** `npx vitest run test/configuracion-redirecciones.test.ts` → FAIL.
- [ ] **Step 3:** Crear `require-admin-page.ts`, las páginas y `zoom-agenda-block.tsx`; reducir `page.tsx` a Inicio; mover consultas de cada sección a su página; actualizar `actions.ts` y los enlaces entrantes listados en Files (los de `?seccion=historico` pasan a `/configuracion/historico`; `centro-operaciones` línea 33 a `/configuracion/google`; `historico/page.tsx` redirige a `/configuracion/historico`).
- [ ] **Step 4:** `npx vitest run` completo, `npx tsc --noEmit`, `npm run lint` → todo verde.
- [ ] **Step 5:** Commit `feat(configuracion): una ruta por área y Inicio de estado`.

### Task 5: Ocultar Meet en los componentes

**Files:**
- Modify: `src/components/workspace-config-form.tsx` (líneas 7-8 y 73-74), `src/components/meet-hosts-config.tsx`
- Test: `test/meet-hosts-config-zoom.test.tsx` (nuevo)

**Interfaces:**
- `WorkspaceConfigForm` deja de renderizar `WorkspaceCohostsGlobalVerification` y `WorkspaceCohostResync` (los archivos quedan, sin importarse).
- `MeetHostsConfig`: sin el botón/formulario "Agregar sala" (`HostFields` crea cuentas Meet) ni opciones de Meet; la etiqueta de proveedor de la fila deja de mostrar "Meet".

- [ ] **Step 1: Test:** renderizar `MeetHostsConfig` con una cuenta Zoom y comprobar que el HTML no contiene "Meet", ni "Agregar sala", ni `GOOGLE_MEET`; y `WorkspaceConfigForm` con `initial = null` no contiene "co-host" ni "cohost" (sin distinguir mayúsculas).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implementar con la menor edición posible.
- [ ] **Step 4:** PASS + `npx vitest run` completo.
- [ ] **Step 5:** Commit `refactor(configuracion): ocultar Meet de Salas y Google`.

### Task 6: Verificación en el navegador

- [ ] **Step 1:** `npm run dev`; entrar como ADMINISTRACION y recorrer Inicio, Zoom, Google, Salas, Correo, Notificaciones, Registros Zoom en escritorio y a ~390 px de ancho. Comprobar: menú agrupado sin "Datos", ningún texto "Meet", "Editar" abre y guarda en Zoom, Correo y Notificaciones con su aviso, y `/configuracion?seccion=workspace`, `?seccion=asistencia`, `?seccion=historico&busqueda=a` redirigen bien.
- [ ] **Step 2:** `npm run lint` y `npx vitest run` → verde. Si algo visual falla, corregir CSS en `settings.css`.
- [ ] **Step 3:** Informar qué se verificó y qué no (no hay prueba contra el Zoom real).

# Creación y vista de reuniones Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear reuniones desde un formulario Zoom y verlas en una lista y un detalle Zoom, con pocas opciones; las pantallas de Meet quedan en el repo sin ruta.

**Architecture:** Pantallas Zoom nuevas en archivos propios; las rutas de `app/(gestion)/reuniones` apuntan a ellas. El backend ya aprovisiona Zoom; solo se corrige la cancelación, que hoy ignora eventos Zoom. Las pantallas de Meet no se modifican (la lista, que vive inline en `page.tsx`, se mueve tal cual a un archivo `*-meet-*`).

**Tech Stack:** Next.js 16 (leer `node_modules/next/dist/docs/` antes de tocar páginas o rutas), TypeScript, Prisma, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-zoom-reuniones-ui-design.md`

## Global Constraints

- Fuera de alcance: asistencia, invitaciones, cohost, archivos/grabaciones como archivos, `/reuniones/migracion-zoom`.
- Los archivos de Meet no se editan ni se borran. Único movimiento permitido: el cuerpo de `app/(gestion)/reuniones/page.tsx` a `src/bootstrap/ui/reuniones/reuniones-lista-meet-page.server.tsx`, sin cambios de contenido (`git mv` + export default).
- La API sigue rechazando `GOOGLE_MEET` al crear.
- `start_url` (`EventoProveedor.hostUrl`) solo para administración y para el docente de la reunión; nunca en componentes de estudiante ni en correos.
- Todos los textos de las pantallas nuevas hablan de Zoom; ninguno menciona Google ni Meet.
- Horarios en `America/Montevideo`; el formulario envía `plataforma: "ZOOM"`, `cohostEmailsManual: []` y no envía `invitadosEmails`.
- Respetar `test/architecture-boundaries.test.ts`.
- Antes de cada commit: `npm run check` y los tests enfocados.

## Review Focus

- Cancelar una serie cuya reunión es Zoom debe encolar la eliminación en Zoom; hoy solo encola eventos `GOOGLE_MEET`.
- Docente sin cuenta Google puede crear una reunión sin recibir error en cliente ni servidor.
- Una reunión con evento Zoom y evento Meet histórico muestra el enlace Zoom, no el de Meet.
- Reunión con enlace pendiente o con error: sin botón "Unirse", con estado visible y, para admin, "Reintentar".
- Estudiante o docente ajeno a la reunión no recibe `start_url` en el HTML del servidor.
- Reprogramar un encuentro ya comenzado o cancelado muestra el error del servicio, no un éxito falso.

---

### Task 1: Cancelación y mensajes Zoom en el backend

**Files:**
- Modify: `src/modules/reuniones/cancelar-solicitudes-atomicas.service.ts:67`, `app/api/v1/reuniones/cancelar-serie/route.ts`
- Test: `test/cancelar-solicitudes-zoom.test.ts`, ampliar `test/crear-reuniones-service.test.ts`

**Interfaces:**
- Produces: `cancelarSolicitudesAtomicas(db, actor, solicitudIds)` devuelve en `eventoProveedorIds` los eventos `GOOGLE_MEET` **y** `ZOOM`; el mensaje de `POST /cancelar-serie` pasa a "La cancelación quedó registrada. Los enlaces se actualizarán en segundo plano."; el `GET` de progreso incluye eventos de ambos proveedores.

- [ ] **Step 1: Failing tests:** (a) una solicitud con un evento Zoom activo devuelve su id en `eventoProveedorIds` y marca `operacionPendiente = CANCELAR`; (b) una con evento Meet sigue igual; (c) en `crear-reuniones-service.test.ts`, crear una reunión Zoom para un docente cuyo `Usuario` tiene `emailPrincipal` y ninguna `CuentaGoogleFlacso` termina sin error.
- [ ] **Step 2:** `npx vitest run test/cancelar-solicitudes-zoom.test.ts test/crear-reuniones-service.test.ts` → FAIL.
- [ ] **Step 3:** Cambiar el filtro de proveedor para incluir `"ZOOM"`; ajustar mensaje y filtro del `GET`.
- [ ] **Step 4:** Mismos tests → PASS. **Step 5: Commit** `fix: cancelar-serie incluye eventos Zoom`.

### Task 2: Formulario de nueva reunión Zoom

**Files:**
- Create: `src/modules/reuniones/presentation/components/meeting-form-zoom.tsx`
- Test: `test/meeting-form-zoom-contract.test.ts` (estilo de `test/meeting-form-ui-contract.test.ts`)

**Interfaces:**
- Produces: `MeetingFormZoom({ programs: readonly { id: string; label: string; teacher: string }[]; assistants: readonly { id: string; label: string }[]; canAssignAssistant: boolean })`.
- Cambios respecto de `meeting-form-v2.tsx` (que no se toca): sin `teacherEmail` ni bloqueo por cuenta Google; sin `EmailListEditor`, `extraCohostEmails` ni `guestEmails`; la sección "Accesos" se llama "Opciones" e incluye grabación y asistente técnico; `modalidad` solo se muestra si `requiresAssistance`, si no se envía `"VIRTUAL"`; mensajes finales: "La reunión y sus enlaces de Zoom quedaron creados correctamente." y, ante fallo de aprovisionamiento, "La reunión quedó guardada. El enlace de Zoom continúa pendiente."

- [ ] **Step 1: Failing tests** leyendo el fuente: no contiene `Google`, `cohost`, `guestEmails` ni `EmailListEditor`; contiene `plataforma: "ZOOM"`; el botón de envío conserva `disabled={!isReady || status === "saving" || status === "done"}`, `aria-busy` y `role="alert"`; `academicReady` no depende de un correo del docente.
- [ ] **Step 2:** FAIL. **Step 3:** Crear el componente reutilizando `recurrencia.domain`, `horarios-asistencia.domain` y los subcomponentes locales (`FormSection`, `Field`, etc.) copiados del original; mantener `Idempotency-Key`. **Step 4:** PASS + `npm run check`. **Step 5: Commit** `feat: formulario de nueva reunión para Zoom`.

### Task 3: Página y ruta de nueva reunión

**Files:**
- Create: `src/bootstrap/ui/reuniones/nueva-reunion-zoom-page.server.tsx`
- Modify: `app/(gestion)/reuniones/nueva/page.tsx`
- Test: `test/reuniones-rutas-zoom.test.ts`

**Interfaces:**
- Consumes: `MeetingFormZoom` (Task 2).
- Produces: `export default async function NuevaReunionZoomPage()` con la misma autorización y carga de programas/asistentes que `nueva-reunion-page.server.tsx`, pero sin incluir `cuentasGoogle` y sin `teacherEmail`; `page.tsx` re-exporta esta página. `nueva-reunion-page.server.tsx` queda intacto y sin ruta.

- [ ] **Step 1: Failing test** (`reuniones-rutas-zoom.test.ts`): el fuente de `nueva/page.tsx` apunta a `nueva-reunion-zoom-page.server`; el de la página Zoom no contiene `cuentasGoogle`; el archivo `nueva-reunion-page.server.tsx` sigue existiendo.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + `npm run check`. **Step 5: Commit** `feat: ruta de nueva reunión usa el formulario Zoom`.

### Task 4: Lista de reuniones Zoom

**Files:**
- Move: `app/(gestion)/reuniones/page.tsx` → `src/bootstrap/ui/reuniones/reuniones-lista-meet-page.server.tsx` (sin cambios de contenido)
- Create: `src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx`, `src/components/zoom-join-actions.tsx`, `src/components/zoom-link-status.tsx`
- Modify: `app/(gestion)/reuniones/page.tsx` (queda como `export { default } from "@/src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server";`)
- Test: ampliar `test/reuniones-rutas-zoom.test.ts`, `test/reuniones-lista-zoom.test.ts`

**Interfaces:**
- Consumes: `obtenerDatosPaginaReuniones(db, actor, params)`, `seleccionarEventoProveedorActivo`, `PeriodoAgenda`.
- Produces:
  - `estadoEnlaceZoom(evento: { joinUrl: string | null; estadoIntegracion: string; errorIntegracion: string | null } | null): "LISTO" | "PENDIENTE" | "ERROR"` en `src/modules/reuniones/estado-enlace-zoom.domain.ts`.
  - `ZoomJoinActions({ url })` (abrir en pestaña nueva y copiar con confirmación accesible).
  - `ZoomLinkStatus({ estado, esAdmin })`; para `ERROR` o `PENDIENTE` y `esAdmin`, botón "Reintentar" que hace `POST /api/v1/reuniones/provisionar-pendientes` como lo hace `AdminRetryMeetAction`.
- La página: pestañas próximas/pasadas (`PeriodoAgenda`), búsqueda `q`, filtro `programa`, paginación, sin las vistas de Meet (búsqueda por código, duplicados, cohosts).

- [ ] **Step 1: Failing tests:** `estadoEnlaceZoom` devuelve `LISTO` con `joinUrl`, `ERROR` con `errorIntegracion` y sin `joinUrl`, `PENDIENTE` en el resto, y `PENDIENTE` con evento `null`; el fuente de la lista Zoom no contiene `Google`, `Meet` ni `cohost`; `page.tsx` apunta a la lista Zoom y `reuniones-lista-meet-page.server.tsx` existe con `export default async function ReunionesPage`; una reunión con eventos Zoom (activo) y Meet usa el `joinUrl` del Zoom.
- [ ] **Step 2:** FAIL. **Step 3:** Mover con `git mv`, crear dominio, componentes y página, actualizar la ruta. **Step 4:** PASS + `npm run check`. **Step 5: Commit** `feat: lista de reuniones Zoom`.

### Task 5: Detalle de reunión Zoom

**Files:**
- Create: `src/bootstrap/ui/reuniones/reunion-zoom-detail-page.server.tsx`, `src/modules/reuniones/enlace-anfitrion.domain.ts`, `src/modules/reuniones/presentation/components/reunion-zoom-encuentros.tsx`
- Modify: `app/(gestion)/reuniones/[solicitudId]/page.tsx`
- Test: `test/enlace-anfitrion-domain.test.ts`, `test/reunion-zoom-detail.test.ts`, ampliar `test/reuniones-rutas-zoom.test.ts`

**Interfaces:**
- Produces:
  - `puedeVerEnlaceAnfitrion(actor: { id: string; rol: string }, docenteUsuarioId: string): boolean` — verdadero para `ADMINISTRACION` o cuando `actor.id === docenteUsuarioId`.
  - `ReunionZoomEncuentros({ solicitudId: string; esAdmin: boolean; encuentros: readonly { id: string; inicioIso: string; finIso: string; descripcion: string | null; estado: string; joinUrl: string | null; hostUrl: string | null; estadoEnlace: "LISTO" | "PENDIENTE" | "ERROR" }[] })`, con "Unirse", "Copiar enlace", "Iniciar como anfitrión" solo si `hostUrl` no es `null`, edición de fecha/hora (`PATCH /api/v1/reuniones/{solicitudId}/encuentros/{instanciaId}`, usando el cuerpo que valida esa ruta), cancelar encuentro (`DELETE` de la misma ruta) y cancelar toda la serie (`POST /api/v1/reuniones/cancelar-serie`).
- La página carga la solicitud con la misma autorización (`puedeGestionarPrograma`) que `reunion-detail-page.server.tsx`, pasa `hostUrl` solo si `puedeVerEnlaceAnfitrion` es verdadero y no importa componentes de cohost, invitados, asistencia ni archivos.

- [ ] **Step 1: Failing tests:** `puedeVerEnlaceAnfitrion` (admin sí, docente dueño sí, otro docente no, asistente técnico no, estudiante no); el fuente de la página Zoom no contiene `Google`, `Meet`, `cohost` ni `LISTA_ASISTENCIA`; la página pasa `hostUrl: null` cuando el actor no puede verlo; el componente no renderiza "Iniciar como anfitrión" con `hostUrl: null`; muestra el mensaje de error devuelto por la API ante un `PATCH` fallido.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar y apuntar la ruta. **Step 4:** PASS + `npm run check`. **Step 5: Commit** `feat: detalle de reunión Zoom`.

### Task 6: Verificación

- [ ] **Step 1:** `npm run check`, `npm test` y `npm run build` limpios.
- [ ] **Step 2:** Con `npm run dev`: crear una reunión con un docente sin cuenta Google; ver el estado del enlace en la lista; abrir el detalle como admin y como docente ajeno (este no ve `start_url`); reprogramar un encuentro y cancelar la serie; confirmar en Zoom que la reunión se actualizó y se eliminó.
- [ ] **Step 3:** Si las nueve cuentas Zoom no están registradas, la reunión queda con enlace pendiente: anotarlo en el resultado y no declarar la creación verificada.

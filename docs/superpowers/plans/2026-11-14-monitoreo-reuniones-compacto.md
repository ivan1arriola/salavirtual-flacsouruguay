# Monitoreo > Reuniones compacto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las tarjetas altas de `/monitoreo` por filas compactas agrupadas por día, con resumen en una línea, menú "Notificar ▾" y énfasis en las reuniones pendientes.

**Architecture:** Dos componentes de presentación puros (`MonitoringSummary`, `MonitoringMeetingRow`) reciben datos ya formateados desde la página server; la página sigue haciendo la consulta y el agrupado (`agruparPorDia`) sin cambios. `BulkMonitoringNotificationActions` conserva su lógica y solo cambia el contenedor a un menú `<details>`. Estilos nuevos en `operations.css`, reutilizando la paleta `monitoring-account-card[data-cuenta]`.

**Tech Stack:** Next.js (App Router, server components), React, Vitest (`renderToStaticMarkup`), CSS plano.

**Spec:** `docs/superpowers/specs/2026-11-14-monitoreo-reuniones-compacto-design.md`

## Global Constraints

- Antes de escribir código de Next, consultar `node_modules/next/dist/docs/` (AGENTS.md: esta versión tiene cambios incompatibles). Este plan no usa APIs nuevas de Next.
- Textos en español rioplatense, tal como están hoy ("Gestionar monitoreo" pasa a "Gestionar"; se agrega "Asignar").
- Una reunión = una fila; el detalle expandible usa `<details>` nativo (sin JS extra).
- Se mantiene `data-cuenta` / `--account-strong` para el color por cuenta de Zoom.
- No se pierde ninguna acción: Abrir Zoom/Meet, Copiar link, Ver detalle, Gestionar, enlace `/monitoreo/gestionar/${meeting.id}` (el test `test/asistencia-desvinculacion-ui.test.ts` lo exige en el source de la página, y exige que NO aparezca `coverage-management-disclosure`).
- El repo tiene cambios sin commitear ajenos a esta tarea: commitear solo los archivos listados en cada tarea (`git add <paths>`).
- Fuera de alcance: calendario, pestaña Gestión, consultas, lógica de asignación/notificación.

## Review Focus

- Cero pendientes: el resumen muestra "0 pendientes" sin enlace y ninguna fila dice "Asignar".
- Una sola reunión en total/por día: singular ("1 reunión", "1 pendiente").
- Reunión sin enlace (`joinUrl` null): muestra "Enlace pendiente", sin romper la fila.
- Reunión sin cuenta host, sin número de reunión o de Meet (no Zoom): el detalle omite o rotula correctamente, sin "undefined".
- Reunión híbrida: el detalle muestra el horario de reunión distinto del de asistencia.
- Con búsqueda `q` activa: el enlace de pendientes conserva `q` en la URL.

---

### Task 1: Resumen en una línea

**Files:**

- Create: `src/modules/asistencia/presentation/components/monitoring-summary.tsx`
- Test: `test/monitoring-summary.test.tsx`

**Interfaces:**

- Produces: `MonitoringSummary(props: Readonly<{ total: number; covered: number; pending: number; q?: string }>): JSX.Element` (server-safe, sin hooks).

- [ ] **Step 1: Escribir el test que falla** (`renderToStaticMarkup`, mismo estilo que `test/zoom-eventos-panel.test.tsx`):
  - `total=10, covered=9, pending=1` → contiene `10 reuniones`, `9 cubiertas`, `1 pendiente` y un `<a` con `href="/monitoreo?estado=pendientes"`.
  - `pending=0` → contiene `0 pendientes` y NO contiene `estado=pendientes`.
  - `total=1, covered=0, pending=1` → contiene `1 reunión` y no `1 reuniones`.
  - `q="china"` con pending>0 → href igual a `/monitoreo?estado=pendientes&q=china` (usar `URLSearchParams`).
  - Test `Review Focus`: `pending=0` además no contiene la clase `is-alert`.
- [ ] **Step 2: Correr y ver que falla** — `npx vitest run test/monitoring-summary.test.tsx` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar `MonitoringSummary`** en el archivo indicado. Markup: `<p className="monitoring-summary">`; el pendiente es `<Link className="monitoring-summary-pending is-alert" …>` solo si `pending > 0` (si no, `<span>`). Pluralizar con una función local.
- [ ] **Step 4: Correr y ver que pasa** — mismo comando → PASS.
- [ ] **Step 5: Commit** — `git add src/modules/asistencia/presentation/components/monitoring-summary.tsx test/monitoring-summary.test.tsx` · `feat(monitoreo): resumen de cobertura en una línea`.

### Task 2: Fila compacta de reunión

**Files:**

- Create: `src/modules/asistencia/presentation/components/monitoring-meeting-row.tsx`
- Test: `test/monitoring-meeting-row.test.tsx`

**Interfaces:**

- Produces:
  ```ts
  export type MonitoringMeetingRowData = {
    id: string; // instancia
    detalleHref: string; // /reuniones/{solicitudId}
    gestionarHref: string; // /monitoreo/gestionar/{id}
    titulo: string;
    programa: string;
    docente: string;
    horaAsistencia: string; // "08:30–11:30 h"
    covered: boolean;
    assistantName: string | null;
    plataforma: "ZOOM" | "GOOGLE_MEET" | null;
    joinUrl: string | null;
    hostLabel: string | null; // ya formateado; null = sin cuenta host
    codigoReunion: string | null; // solo Zoom
    modalidad: "HIBRIDA" | "VIRTUAL";
    horarioReunion: string | null; // solo si HIBRIDA
    applicantsCount: number;
    cuenta: string; // valor de data-cuenta ("sin" si no hay)
  };
  export function MonitoringMeetingRow(props: Readonly<{ data: MonitoringMeetingRowData }>): JSX.Element;
  ```
- Consumes: `MeetLinkActions` de `@/src/components/copy-meet-link-button` (props `url`, `provider`).

- [ ] **Step 1: Escribir tests que fallan** con un `base: MonitoringMeetingRowData` y variaciones:
  - Pendiente: contiene `is-pending`, `Sin asignar`, enlace `Asignar` a `gestionarHref`, y no contiene `Gestionar`.
  - Cubierta: contiene `is-covered`, `assistantName`, enlace `Gestionar`, y no contiene `Asignar`.
  - Contiene `<details` y dentro `Host`, `N.º de reunión` con el código, y `postulada` (`0 personas postuladas`, `1 persona postulada`).
  - `joinUrl: null` → contiene `Enlace pendiente`; con `joinUrl` → contiene `Abrir Zoom` y `Ver detalle`.
  - `hostLabel: null` → `Sin cuenta host asignada`; `codigoReunion: null` y plataforma `GOOGLE_MEET` → no contiene `N.º de reunión` ni `undefined`/`null`.
  - `modalidad: "HIBRIDA"` con `horarioReunion` → contiene `Horario de reunión` y el valor; `VIRTUAL` → no lo contiene.
  - Contiene `data-cuenta="3"` cuando `cuenta: "3"`.
- [ ] **Step 2: Correr y ver que falla** — `npx vitest run test/monitoring-meeting-row.test.tsx` → FAIL.
- [ ] **Step 3: Implementar `MonitoringMeetingRow`.** `<article className="monitoring-row monitoring-account-card is-covered|is-pending" data-cuenta>`. Línea principal en grid: hora · (chip de plataforma + título como `Link` a `detalleHref`, programa/docente en segunda línea tenue) · estado (`assistantName` o "Sin asignar") · botón (`primary-action` "Asignar" si pendiente, `secondary-action` "Gestionar" si cubierta). Debajo, `<details className="monitoring-row-details"><summary>Detalles</summary>` con: Host, N.º de reunión (solo Zoom con código), Modalidad (+ Horario de reunión si híbrida), postulados, y los enlaces (`MeetLinkActions` o "Enlace pendiente", más "Ver detalle"). Reutilizar clases `monitoring-platform is-zoom|is-meet` para el chip. Singular/plural de postulados igual que hoy.
- [ ] **Step 4: Correr y ver que pasa** → PASS.
- [ ] **Step 5: Commit** — `git add` ambos archivos · `feat(monitoreo): fila compacta de reunión con detalle expandible`.

### Task 3: Menú "Notificar ▾"

**Files:**

- Modify: `src/modules/asistencia/presentation/components/bulk-monitoring-notification-actions.tsx:97-129`
- Test: `test/monitoring-notify-menu.test.ts`

**Interfaces:**

- Consumes/Produces: firma sin cambios `BulkMonitoringNotificationActions({ pendingCount, coveredCount })`; la lógica de `notifyUnassigned`/`notifyAssigned` no se toca.

- [ ] **Step 1: Escribir test que falla** leyendo el source con `readFileSync` (el componente usa `useRouter`, no se puede renderizar fuera del app router): contiene `<details className="coverage-notify-menu"`, `<summary`, `Notificar`, `Renotificar sin asignar (${pendingCount})` y `Notificar reuniones asignadas (${coveredCount})`, y sigue conteniendo `"/api/v1/asistencia/notificaciones"`.
- [ ] **Step 2: Correr y ver que falla** — `npx vitest run test/monitoring-notify-menu.test.ts` → FAIL.
- [ ] **Step 3: Envolver los dos botones** existentes en `<details className="coverage-notify-menu"><summary className="secondary-action">Notificar ▾</summary><div className="coverage-notify-menu-items">…</div></details>`. El bloque de `feedback` queda fuera del `<details>`, para que el mensaje siga visible con el menú cerrado.
- [ ] **Step 4: Correr y ver que pasa** → PASS.
- [ ] **Step 5: Commit** — `git add` ambos archivos · `feat(monitoreo): agrupar notificaciones masivas en un menú`.

### Task 4: Integrar en la página y estilos

**Files:**

- Modify: `src/bootstrap/ui/asistencia/asistencia-tecnica-page.server.tsx:121-308` (cabecera de resumen, barra de acciones, lista)
- Modify: `app/(gestion)/operations.css` (agregar al final)
- Test: `test/asistencia-desvinculacion-ui.test.ts` (ajustar solo si falla) y `test/monitoring-page-compact.test.ts`

**Interfaces:**

- Consumes: `MonitoringSummary`, `MonitoringMeetingRow`, `MonitoringMeetingRowData`, `BulkMonitoringNotificationActions`.

- [ ] **Step 1: Escribir test que falla** (`readFileSync` del source de la página): contiene `MonitoringSummary` y `MonitoringMeetingRow`; ya no contiene `coverage-card monitoring-account-card`, `metric-grid coverage-stats` ni `coverage-card-footer`; sigue conteniendo `/monitoreo/gestionar/${meeting.id}`; el CSS contiene `.monitoring-row`, `.monitoring-row.is-pending`, `.coverage-notify-menu`, `.monitoring-summary`.
- [ ] **Step 2: Correr y ver que falla** — `npx vitest run test/monitoring-page-compact.test.ts` → FAIL.
- [ ] **Step 3: Cambiar la página.** Reemplazar la sección `metric-grid` por `<MonitoringSummary total covered pending q />`; mover `BulkMonitoringNotificationActions` a la misma barra que el buscador (`coverage-toolbar`). En el `map` de cada día, armar `MonitoringMeetingRowData` con la lógica ya existente en las líneas 190-207 (assistantName, modalidad, hostLabel con `nombreCuentaZoom`, `formatTime`) y renderizar `<MonitoringMeetingRow data=… />`; `gestionarHref` se arma en la página con `` `/monitoreo/gestionar/${meeting.id}` ``. Eliminar imports sin uso (`CalendarClock`, `ArrowRight`, `UsersRound`, `MeetLinkActions`).
- [ ] **Step 4: CSS.** Agregar `.monitoring-summary` (una línea, número pendiente en color advertencia), `.coverage-toolbar` (flex, buscador a la izquierda, menú a la derecha), `.coverage-notify-menu` (`details` posicionado con items absolutos), `.monitoring-row` (grid `72px 1fr auto auto`, altura ~56px, borde izquierdo del color de cuenta), `.monitoring-row.is-pending` (fondo tenue ámbar), `.monitoring-row.is-covered` (más discreto), `.monitoring-row-details`. En `@media (max-width: 680px)` la fila pasa a dos líneas (hora+estado arriba, título+botón abajo). Quitar los `coverage-card-*` solo si ya nadie más los usa (`Grep` en `app/` y `src/`); si se usan en otras páginas, dejarlos.
- [ ] **Step 5: Verificar** — `npx vitest run` y `npm run check` → todo PASS sin errores de tipos.
- [ ] **Step 6: Verificación visual** — levantar la app (`npm run dev:next`), abrir `/monitoreo` como Administración y comprobar: ~12 filas por pantalla en escritorio, pendiente resaltada, enlace "1 pendiente" filtra, menú Notificar abre/cierra, vista móvil sin scroll horizontal. Reportar con capturas o describir lo observado.
- [ ] **Step 7: Commit** — `git add` página, `operations.css` y tests · `feat(monitoreo): lista compacta por día con resumen y menú de notificaciones`.

---

## Self-review

- Cobertura del spec: filas compactas (T2, T4), resumen enlazado (T1), menú Notificar (T3), énfasis pendientes/botón Asignar (T2, T4 CSS), detalle expandible (T2), responsive (T4 CSS), sin pérdida de acciones (T2 tests). Pestaña Gestión y lógica intactas.
- Tipos: `MonitoringMeetingRowData` definido en T2 y consumido en T4; `MonitoringSummary` props idénticas en T1 y T4.
- Review Focus: cada línea tiene test (T1: cero pendientes, singular, `q`; T2: sin enlace, sin host/código/Meet, híbrida).

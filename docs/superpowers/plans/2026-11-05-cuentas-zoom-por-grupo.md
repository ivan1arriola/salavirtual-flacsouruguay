# Cuentas anfitrionas de Zoom por grupo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cuentas anfitrionas de Zoom sean los miembros de un grupo de Zoom elegido en Configuración, sincronizados con un botón y de forma periódica, sin carga manual de cuentas Zoom.

**Architecture:** El grupo elegido vive en `ConfiguracionZoom`. Un servicio de sincronización lee los miembros por la API de Zoom y, con una función pura de planificación, crea/actualiza/adopta/desactiva filas de `CuentaProveedor` (a las que ya apuntan las reuniones). Las cuentas fuera del grupo con reuniones futuras siguen activas pero se excluyen de toda asignación nueva.

**Tech Stack:** Next.js (App Router, ver `node_modules/next/dist/docs/` antes de escribir código de Next), Prisma + PostgreSQL, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-04-cuentas-zoom-por-grupo-design.md`

## Global Constraints

- Un merge a `main` despliega a producción automáticamente: trabajar en rama y abrir PR; no empujar a `main`.
- Cada cuenta Zoom admite una sola reunión simultánea: `limiteConcurrente = 1`.
- `tieneLicencia = true` solo si Zoom informa el usuario como licenciado (`type === 2`); si no, `false`. Las asignaciones ya exigen `tieneLicencia: true`.
- Textos de interfaz en español rioplatense (voseo), sin tecnicismos en pantalla.
- La app de Zoom necesita los permisos `group:read:list_groups:admin` y `group_member:read:list_members:admin` (nombres granulares de Zoom; no se usa `user:read:admin`); el mensaje de error debe nombrarlos si faltan.
- Commits con el trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Endpoints periódicos usan `Authorization: Bearer ${CRON_SECRET}`, como `app/api/v1/reuniones/reconciliar-pendientes/route.ts`.

## Review Focus

- Grupo vacío (Zoom devuelve cero miembros): no se desactiva ninguna cuenta; se rechaza con aviso.
- Zoom responde 401/403 (faltan permisos) o 404 (grupo borrado): ninguna cuenta cambia; el error queda guardado y visible.
- Dos sincronizaciones a la vez (botón + cron): la segunda se rechaza sin tocar datos.
- Correo del miembro con distinta capitalización que el de una cuenta existente: se adopta, no se duplica.
- Cuenta de Meet con el mismo correo que un miembro del grupo: la sincronización no la toca (solo opera sobre cuentas del proveedor ZOOM).

## File Structure

- `prisma/schema.prisma` + nueva migración: columnas nuevas.
- `src/modules/configuracion/zoom-grupo-sincronizacion.domain.ts` (nuevo): función pura `planificarSincronizacionGrupoZoom`.
- `src/integrations/zoom/zoom-grupos-client.ts` (nuevo): `listarGruposZoomHttp`, `listarMiembrosGrupoZoomHttp`.
- `src/modules/configuracion/zoom-grupo-sincronizacion.service.ts` (nuevo): `sincronizarCuentasZoomConGrupo`, `listarGruposZoom`, `elegirGrupoZoom`.
- `src/modules/reuniones/cuenta-asignable.domain.ts` (nuevo): `CUENTA_ZOOM_ASIGNABLE` (filtro compartido).
- `app/api/v1/configuracion/zoom/grupo/route.ts` (nuevo): GET lista de grupos, PUT elige grupo, POST sincroniza.
- `app/api/v1/configuracion/zoom/grupo/sincronizar/route.ts` (nuevo): GET periódico con `CRON_SECRET`.
- `app/api/v1/configuracion/salas-meet/route.ts`: rechazar alta y baja de cuentas Zoom.
- `src/components/meet-hosts-config.tsx`, `src/components/zoom-grupo-config.tsx` (nuevo), `app/(gestion)/configuracion/page.tsx`, `src/modules/configuracion/configuracion-page.service.ts`: interfaz.

---

### Task 1: Esquema y migración

**Files:**

- Modify: `prisma/schema.prisma` (`ConfiguracionZoom` ~línea 103, `CuentaProveedor` ~línea 239)
- Create: `prisma/migrations/20261105120000_cuentas_zoom_por_grupo/migration.sql`
- Test: `test/cuentas-zoom-grupo-schema.test.ts`

**Interfaces:**

- Produces: campos `ConfiguracionZoom.grupoId: string | null`, `grupoNombre: string | null`, `ultimaSincronizacionAt: Date | null`, `ultimaSincronizacionResultado: string | null`, `sincronizandoDesdeAt: Date | null` (candado); `CuentaProveedor.origenGrupoZoom: boolean`, `fueraDelGrupoAt: Date | null`.

- [ ] **Step 1: Write the failing test** `test/cuentas-zoom-grupo-schema.test.ts` que lee `prisma/schema.prisma` y espera que el modelo `ConfiguracionZoom` contenga `grupoId`, `grupoNombre`, `ultimaSincronizacionAt`, `ultimaSincronizacionResultado`, `sincronizandoDesdeAt` y que `CuentaProveedor` contenga `origenGrupoZoom Boolean @default(false)` y `fueraDelGrupoAt DateTime?`.
- [ ] **Step 2: Run** `npx vitest run test/cuentas-zoom-grupo-schema.test.ts` — Expected: FAIL.
- [ ] **Step 3: Add the fields** al esquema y escribir la migración SQL con `ALTER TABLE ... ADD COLUMN` (todas nulas o con `DEFAULT false`, sin reescribir datos). Correr `npx prisma generate`.
- [ ] **Step 4: Run** el test y `npx tsc --noEmit` — Expected: PASS y sin errores.
- [ ] **Step 5: Commit** `feat: columnas para sincronizar cuentas Zoom con un grupo`.

### Task 2: Planificador puro de la sincronización

**Files:**

- Create: `src/modules/configuracion/zoom-grupo-sincronizacion.domain.ts`
- Test: `test/zoom-grupo-sincronizacion-domain.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export type MiembroGrupoZoom = Readonly<{ id: string; email: string; nombre: string; licenciado: boolean }>;
  export type CuentaZoomActual = Readonly<{
    id: string;
    emailOrganizador: string | null;
    activa: boolean;
    fueraDelGrupoAt: Date | null;
    prioridad: number;
  }>;
  export type PlanSincronizacionZoom = Readonly<{
    crear: readonly Readonly<{ miembro: MiembroGrupoZoom; prioridad: number }>[];
    actualizar: readonly Readonly<{ cuentaId: string; miembro: MiembroGrupoZoom; reactivar: boolean }>[]; // incluye adopción
    desactivar: readonly string[]; // salió, sin reuniones futuras
    marcarFuera: readonly Readonly<{ cuentaId: string; reunionesFuturas: number }>[]; // salió, con reuniones futuras
    resumen: string;
  }>;
  export function planificarSincronizacionGrupoZoom(
    miembros: readonly MiembroGrupoZoom[],
    cuentas: readonly CuentaZoomActual[],
    reunionesFuturasPorCuenta: Readonly<Record<string, number>>
  ): PlanSincronizacionZoom;
  export class GrupoZoomVacioError extends Error {}
  ```
- Behavior: compara correos en minúscula; `prioridad` de las nuevas = máxima prioridad existente + 1, +2, … en orden de aparición (100 si no hay cuentas); lanza `GrupoZoomVacioError` si `miembros` está vacío.

- [ ] **Step 1: Write the failing tests** (nombre y assertions): `crea miembros nuevos con prioridad correlativa`, `adopta una cuenta existente por correo sin distinguir mayúsculas`, `reactiva una cuenta que vuelve al grupo`, `desactiva la que salió sin reuniones futuras`, `marca fuera del grupo la que salió con reuniones futuras y no la desactiva`, `lanza GrupoZoomVacioError con grupo vacío`, `el resumen cuenta nuevas, desactivadas y fuera del grupo`.
- [ ] **Step 2: Run** `npx vitest run test/zoom-grupo-sincronizacion-domain.test.ts` — Expected: FAIL ("no es una función").
- [ ] **Step 3: Implement** `planificarSincronizacionGrupoZoom` y `GrupoZoomVacioError` según la interfaz; el resumen es una frase en español como «2 nuevas, 1 desactivada, 1 fuera del grupo con reuniones».
- [ ] **Step 4: Run** el test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: planificador de la sincronización de cuentas Zoom con el grupo`.

### Task 3: Cliente de grupos de Zoom

**Files:**

- Create: `src/integrations/zoom/zoom-grupos-client.ts`
- Test: `test/zoom-grupos-client.test.ts`

**Interfaces:**

- Consumes: `obtenerZoomAccessToken(creds: ZoomCredentials): Promise<string>` de `src/integrations/zoom/zoom-client.ts`.
- Produces:
  ```ts
  export type GrupoZoom = Readonly<{ id: string; nombre: string; totalMiembros: number }>;
  export class ZoomPermisosError extends Error {}
  export async function listarGruposZoomHttp(token: string): Promise<readonly GrupoZoom[]>; // GET https://api.zoom.us/v2/groups
  export async function listarMiembrosGrupoZoomHttp(
    token: string,
    grupoId: string
  ): Promise<readonly MiembroGrupoZoom[]>; // GET /v2/groups/{id}/members?page_size=300, sigue next_page_token
  ```
- `MiembroGrupoZoom.licenciado = (type === 2)`; `nombre` = `first_name last_name` recortado o el correo. 401/403 → `ZoomPermisosError` con el mensaje «Falta permiso en la app de Zoom: group:read:list_groups:admin y group_member:read:list_members:admin.»; 404 → `Error("El grupo de Zoom ya no existe.")`.

- [ ] **Step 1: Write the failing tests** con `fetch` simulado: `lista los grupos`, `pagina los miembros siguiendo next_page_token`, `marca licenciado solo con type 2`, `403 lanza ZoomPermisosError`, `404 informa que el grupo ya no existe`.
- [ ] **Step 2: Run** `npx vitest run test/zoom-grupos-client.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** las dos funciones y `ZoomPermisosError` con el patrón de `crearReunionZoomHttp` (cabecera `Bearer`).
- [ ] **Step 4: Run** el test — Expected: PASS.
- [ ] **Step 5: Commit** `feat: cliente de grupos y miembros de Zoom`.

### Task 4: Servicio de sincronización

**Files:**

- Create: `src/modules/configuracion/zoom-grupo-sincronizacion.service.ts`
- Modify: `src/modules/configuracion/api.ts` (reexportar)
- Test: `test/zoom-grupo-sincronizacion-service.test.ts`

**Interfaces:**

- Consumes: Task 2 (`planificarSincronizacionGrupoZoom`, `GrupoZoomVacioError`), Task 3 (`listarGruposZoomHttp`, `listarMiembrosGrupoZoomHttp`, `ZoomPermisosError`), `obtenerCredencialesZoom(db, descifrar)` de `zoom-config.service.ts`, `obtenerZoomAccessToken`.
- Produces:
  ```ts
  export async function listarGruposZoom(
    db: PrismaClient,
    descifrar: (c: string) => string
  ): Promise<readonly GrupoZoom[]>;
  export async function elegirGrupoZoom(
    db: PrismaClient,
    input: { grupoId: string; grupoNombre: string; actorId: string }
  ): Promise<void>; // guarda en ConfiguracionZoom id "principal"
  export async function sincronizarCuentasZoomConGrupo(
    db: PrismaClient,
    descifrar: (c: string) => string,
    ahora: Date
  ): Promise<{ ok: boolean; resumen: string }>;
  ```
- Behavior: sin grupo elegido → `{ ok:false, resumen:"Elegí un grupo de Zoom para obtener las cuentas anfitrionas." }`; candado con `sincronizandoDesdeAt` (se toma con `updateMany` condicionado a `null` o más viejo que 10 minutos; si no se toma → `{ ok:false, resumen:"Ya hay una sincronización en curso." }`); «reuniones futuras» = `instanciaReunion` con `estado: "PROGRAMADA"`, `finProgramadoAt > ahora`, cuyo evento Zoom activo tiene esa `cuentaProveedorId`; aplica el plan en `db.$transaction` (solo cuentas del proveedor `ZOOM`; crea con `origenGrupoZoom: true`, `limiteConcurrente: 1`, `externalAccountId` = id de usuario de Zoom, `tieneLicencia` = `licenciado`; actualiza/adopta marcando `origenGrupoZoom: true`, `fueraDelGrupoAt: null`; desactiva con `activa:false, fueraDelGrupoAt: ahora`; marca fuera con `fueraDelGrupoAt: ahora`); en cualquier error guarda `ultimaSincronizacionResultado` con el mensaje, libera el candado y no cambia cuentas; escribe un registro en `auditoria` con acción `CUENTAS_ZOOM_SINCRONIZADAS`.

- [ ] **Step 1: Write the failing tests** con una base simulada: `crea y desactiva según el plan y guarda el resumen`, `un error de Zoom no cambia ninguna cuenta y guarda el error`, `grupo vacío no desactiva nada`, `sin grupo elegido avisa`, `una segunda sincronización simultánea se rechaza`, `no toca cuentas de Meet con el mismo correo`.
- [ ] **Step 2: Run** `npx vitest run test/zoom-grupo-sincronizacion-service.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** las tres funciones con las firmas de arriba; reexportarlas desde `api.ts`.
- [ ] **Step 4: Run** el test y `npx tsc --noEmit` — Expected: PASS y sin errores.
- [ ] **Step 5: Commit** `feat: servicio que sincroniza las cuentas de Zoom con el grupo elegido`.

### Task 5: Las cuentas fuera del grupo no reciben reuniones nuevas

**Files:**

- Create: `src/modules/reuniones/cuenta-asignable.domain.ts` con `export const CUENTA_ZOOM_ASIGNABLE = { activa: true, tieneLicencia: true, fueraDelGrupoAt: null } as const;`
- Modify (reemplazar `activa: true, tieneLicencia: true` por `...CUENTA_ZOOM_ASIGNABLE` en el `where` de `cuentaProveedor.findMany`): `src/modules/reuniones/crear-reuniones.service.ts:153`, `src/modules/reuniones/gestionar-encuentros.service.ts:98`, `src/modules/reuniones/corregir-serie-enlaces.service.ts:230`, `src/modules/reuniones/migracion-zoom-aplicar.service.ts:184`, `src/modules/reuniones/migracion-zoom-serie-aplicar.service.ts:156`, `src/modules/reuniones/migracion-zoom.service.ts:167`, `app/api/v1/reuniones/migracion-zoom/series-enlaces/route.ts:73`
- Test: `test/cuenta-asignable-zoom.test.ts`

**Interfaces:**

- Produces: `CUENTA_ZOOM_ASIGNABLE`, usado por los siete sitios.

- [ ] **Step 1: Write the failing test** que lee cada uno de los siete archivos y espera que contengan `CUENTA_ZOOM_ASIGNABLE` y que ninguno conserve el literal `activa: true, tieneLicencia: true` en una consulta de `cuentaProveedor`.
- [ ] **Step 2: Run** `npx vitest run test/cuenta-asignable-zoom.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** el cambio en los siete sitios (en `crear-reuniones` y `gestionar-encuentros` el `where` conserva además `proveedorId: …`).
- [ ] **Step 4: Run** el test nuevo, `npx vitest run test/asignacion-salas-domain.test.ts test/migracion-zoom` y `npx tsc --noEmit` — Expected: todo PASS.
- [ ] **Step 5: Commit** `feat: las cuentas Zoom fuera del grupo no reciben reuniones nuevas`.

### Task 6: Rutas de grupo y sincronización

**Files:**

- Create: `app/api/v1/configuracion/zoom/grupo/route.ts` (GET lista grupos, PUT elige grupo con `{ grupoId, grupoNombre }`, POST sincroniza; los tres solo administración, mismo `requireAdmin` que `salas-meet/route.ts`)
- Create: `app/api/v1/configuracion/zoom/grupo/sincronizar/route.ts` (GET con `Authorization: Bearer ${CRON_SECRET}`, responde 200 con `{ resumen }` o 502 si `ok:false`)
- Modify: `app/api/v1/configuracion/salas-meet/route.ts` — en `POST` y `DELETE`, si el proveedor de la cuenta es Zoom responder 409 con «Las cuentas de Zoom vienen del grupo elegido en Configuración.»; `PUT` de una cuenta Zoom solo cambia `prioridad` y `activa`; `nombre`, `email` y `tieneLicencia` los fija la sincronización, y `limiteConcurrente` sigue en 1.
- Test: `test/zoom-grupo-routes.test.ts`, ampliar `test/salas-meet-route.test.ts`

**Interfaces:**

- Consumes: Task 4 (`listarGruposZoom`, `elegirGrupoZoom`, `sincronizarCuentasZoomConGrupo`), `descifrarConfiguracion` de `@/src/lib/config/encryption`.

- [ ] **Step 1: Write the failing tests** (mismo estilo de mocks que `test/salas-meet-route.test.ts`): `no administradores reciben 403`, `PUT guarda el grupo elegido`, `POST devuelve el resumen`, `el GET periódico sin secreto devuelve 401`, `el GET periódico con secreto sincroniza`, `crear una cuenta Zoom responde 409`, `borrar una cuenta Zoom responde 409`, `crear y borrar cuentas Meet sigue funcionando`.
- [ ] **Step 2: Run** `npx vitest run test/zoom-grupo-routes.test.ts test/salas-meet-route.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** las rutas y los rechazos descritos.
- [ ] **Step 4: Run** los tests y `npx tsc --noEmit` — Expected: PASS.
- [ ] **Step 5: Commit** `feat: rutas para elegir el grupo de Zoom y sincronizar sus cuentas`.

### Task 7: Interfaz de Configuración › Salas

**Files:**

- Create: `src/components/zoom-grupo-config.tsx` (selector de grupo cargado desde `GET .../zoom/grupo`, botón «Sincronizar con el grupo», fecha y resultado de la última sincronización; aviso «Elegí un grupo de Zoom para obtener las cuentas anfitrionas» si no hay grupo)
- Modify: `src/components/meet-hosts-config.tsx` (la plataforma del formulario «Agregar sala» ofrece solo Google Meet; las filas Zoom no muestran borrar y muestran «Fuera del grupo (N reuniones futuras)» cuando `fueraDelGrupoAt` no es nulo), `src/modules/configuracion/configuracion-page.service.ts:39` (seleccionar `fueraDelGrupoAt`, `origenGrupoZoom`, conteo de reuniones futuras por cuenta, y los campos de grupo de `ConfiguracionZoom`), `app/(gestion)/configuracion/page.tsx:208` (renderizar `ZoomGrupoConfig` en la sección `salas`), `src/components/zoom-config-form.tsx:231` (la ayuda de scopes lista los permisos granulares: meeting:write:meeting:admin, meeting:read:meeting:admin, meeting:update:meeting:admin, meeting:delete:meeting:admin, meeting:read:list_meetings:admin, group:read:list_groups:admin, group_member:read:list_members:admin)
- Test: `test/meet-hosts-config-domain.test.ts` (ampliar), `test/zoom-grupo-config-ui.test.ts`

**Interfaces:**

- Consumes: Task 6 (rutas), Task 1 (campos). Produces: `MeetHostVisible` con `fueraDelGrupoAt?: string | null` y `reunionesFuturas?: number`.

- [ ] **Step 1: Write the failing tests**: `el formulario Agregar sala solo ofrece Google Meet`, `una fila Zoom no ofrece borrar`, `una cuenta fuera del grupo muestra el aviso con la cantidad de reuniones futuras`, `sin grupo elegido se muestra el aviso para elegirlo` (renderizado a HTML estático, como `test/zoom-copy-id-button.test.ts`).
- [ ] **Step 2: Run** `npx vitest run test/zoom-grupo-config-ui.test.ts test/meet-hosts-config-domain.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** los cambios de interfaz descritos con las clases CSS existentes de Configuración.
- [ ] **Step 4: Run** los tests, `npx tsc --noEmit` y `npx vitest run` completo — Expected: todo PASS.
- [ ] **Step 5: Commit** `feat: pantalla de Salas con el grupo de Zoom y sincronización`.

### Task 8: Puesta en producción

**Files:**

- Modify: `docs/configuracion-zoom.md` si existe (si no, crear `docs/configuracion-zoom-grupo.md`): permisos de la app de Zoom, URL del endpoint periódico y el secreto, y el paso de revisar el grupo antes de sincronizar.

- [ ] **Step 1:** Abrir el PR desde la rama de trabajo; esperar CI en verde (`gh pr checks`).
- [ ] **Step 2:** Antes de mergear, confirmar con la persona usuaria que la app de Zoom tiene `group:read:list_groups:admin` y `group_member:read:list_members:admin` y que ya se revisó el grupo en Zoom.
- [ ] **Step 3:** Mergear (despliega) y esperar «Deploy · EC2» con éxito (`gh run list --branch main --limit 3`).
- [ ] **Step 4:** Con la persona usuaria, elegir el grupo en Configuración y correr una sincronización **manual**; revisar el resumen antes de programar el endpoint periódico.
- [ ] **Step 5:** Programar `GET /api/v1/configuracion/zoom/grupo/sincronizar` con el `CRON_SECRET` en el mecanismo periódico que ya usa el servidor para los otros endpoints; confirmar con la persona usuaria cómo se programa, porque no está en este repositorio.

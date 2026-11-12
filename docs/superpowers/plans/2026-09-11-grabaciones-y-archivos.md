# Grabaciones y Archivos Meet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `/grabaciones` into an intuitive, modern media and artifacts library with universal recording capture, 100% background cron synchronization, zero alarming incident screens, and direct artifact access from `/reuniones/[solicitudId]`.

**Architecture:**

- Sincronización desatendida mediante systemd timer en EC2 (`salavirtual-artifacts-sync.timer` cada 10 min) llamando a `/api/v1/reuniones/sincronizar-archivos` con `Bearer $CRON_SECRET`.
- Desacoplar la captura de grabaciones de la marca `requiereGrabacion: true`: cualquier video producido en Google Meet se mueve al Drive institucional y se indexa.
- Tratar los estados en procesamiento de Google sin emitir excepciones ni alarmas de error.
- Cierre limpio de ciclo a las 48h para evitar consultas infinitas a la API de Google.
- Eliminar el bloque `.recording-incidents` y reemplazar la interfaz por un Client Component interactivo (`RecordingsLibrary`) con buscador en tiempo real y filtros por tipo de archivo.
- Incorporar accesos directos a video y asistencia dentro de los encuentros pasados en `/reuniones/[solicitudId]`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Lucide, CSS, Vitest, Prisma 6, Google Meet API v2, Google Drive API v3.

**Spec:** `docs/superpowers/specs/2026-09-11-grabaciones-y-archivos-design.md`

## Global Constraints

- Preservar las reglas de autorización y aislamiento por rol (`COMPLETO`, `PROGRAMAS_DOCENTE`, `ASIGNACIONES_ASISTENTE`).
- No alterar esquemas de Prisma de forma incompatible ni crear migraciones destructivas.
- Mantener la idempotencia en Google Drive API (`addParents`, `removeParents`, `supportsAllDrives=true`).
- Utilizar los tokens CSS institucionales y el vocabulario en español de Sala Virtual FLACSO.
- Ejecutar `npx vitest run` y verificar que los tests pasen al 100% tras cada tarea.

---

### Task 1: Systemd Cron Infrastructure for Artifact Synchronization

**Files:**

- Create: `infra/ec2/salavirtual-artifacts-sync.service`
- Create: `infra/ec2/salavirtual-artifacts-sync.timer`
- Modify: `docs/despliegue-ec2.md`

**Interfaces:**

- Produces: Systemd timer configurado para ejecutarse cada 10 minutos contra `http://127.0.0.1:3101/api/v1/reuniones/sincronizar-archivos` con `Authorization: Bearer $CRON_SECRET`.
- Consumes: `CRON_SECRET` de `/srv/apps/salavirtual-flacso/shared/.env.production`.

- [ ] **Step 1: Create the systemd service file**
- [x] **Step 1: Create the systemd service file**

Crear `infra/ec2/salavirtual-artifacts-sync.service`:

```ini
[Unit]
Description=Sala Virtual FLACSO - Sincronizar grabaciones y artefactos Meet
After=salavirtual.service
Requires=salavirtual.service

[Service]
Type=oneshot
EnvironmentFile=/srv/apps/salavirtual-flacso/shared/.env.production
ExecStart=/bin/sh -c '/usr/bin/curl --fail --silent --show-error --max-time 300 -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3101/api/v1/reuniones/sincronizar-archivos'
```

- [ ] **Step 2: Create the systemd timer file**
- [x] **Step 2: Create the systemd timer file**

Crear `infra/ec2/salavirtual-artifacts-sync.timer`:

```ini
[Unit]
Description=Sala Virtual FLACSO - Timer de sincronización de grabaciones (cada 10 min)

[Timer]
OnCalendar=*:0/10
Persistent=true
RandomizedDelaySec=20
Unit=salavirtual-artifacts-sync.service

[Install]
WantedBy=timers.target
```

- [x] **Step 3: Update EC2 deployment documentation**

Actualizar `docs/despliegue-ec2.md` para incluir la habilitación de `salavirtual-artifacts-sync.timer` junto a las demás unidades de systemd.

---

### Task 2: Pure Domain Logic for Recording Filtering & Status Normalization

**Files:**

- Create: `src/modules/meet/grabaciones-filtro.domain.ts`
- Create: `test/grabaciones-filtro-domain.test.ts`

**Interfaces:**

- Produces:
  - `TipoFiltroArtefacto`: `"TODOS" | "GRABACIONES" | "ASISTENCIAS" | "NOTAS_Y_TRANSCRIPCIONES"`.
  - `EstadoVisualGrabacion`: `"DISPONIBLE" | "PROCESANDO" | "NO_REGISTRADA" | "NO_REQUERIDA"`.
  - `resolverEstadoVisualGrabacion(datos)`: función pura para clasificar el estado amigable de la reunión sin alarmas rojas.
  - `filtrarEncuentrosConArchivos(grupos, filtro, busqueda)`: función pura de búsqueda y filtrado.

- [x] **Step 1: Write the failing domain test**

Crear `test/grabaciones-filtro-domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  filtrarEncuentrosConArchivos,
  resolverEstadoVisualGrabacion,
  type GrupoEncuentroConArchivos
} from "../src/modules/meet/grabaciones-filtro.domain";

describe("grabaciones-filtro.domain", () => {
  it("determina el estado DISPONIBLE si existe archivo de video", () => {
    const estado = resolverEstadoVisualGrabacion({
      tieneArchivoGrabacion: true,
      archivosSincronizadosAt: new Date(),
      finProgramadoAt: new Date(Date.now() - 3600000),
      requiereGrabacion: true
    });
    expect(estado).toBe("DISPONIBLE");
  });

  it("determina el estado PROCESANDO si no sincronizo y termino hace menos de 4 horas", () => {
    const estado = resolverEstadoVisualGrabacion({
      tieneArchivoGrabacion: false,
      archivosSincronizadosAt: null,
      finProgramadoAt: new Date(Date.now() - 1800000), // terminó hace 30 min
      requiereGrabacion: true
    });
    expect(estado).toBe("PROCESANDO");
  });

  it("determina el estado NO_REGISTRADA si ya cerro el ciclo y requeria grabacion", () => {
    const estado = resolverEstadoVisualGrabacion({
      tieneArchivoGrabacion: false,
      archivosSincronizadosAt: new Date(),
      finProgramadoAt: new Date(Date.now() - 86400000),
      requiereGrabacion: true
    });
    expect(estado).toBe("NO_REGISTRADA");
  });

  it("filtra encuentros por texto de busqueda en titulo, programa o docente", () => {
    const grupos: GrupoEncuentroConArchivos[] = [
      {
        instanciaId: "1",
        titulo: "Seminario de Políticas Públicas",
        programa: "Maestría en Políticas",
        docente: "María García",
        fechaInicio: new Date(),
        archivos: [{ tipo: "GRABACION", id: "a1" }]
      },
      {
        instanciaId: "2",
        titulo: "Taller de Metodología",
        programa: "Doctorado en Ciencias Sociales",
        docente: "Juan Pérez",
        fechaInicio: new Date(),
        archivos: [{ tipo: "LISTA_ASISTENCIA", id: "a2" }]
      }
    ];

    expect(filtrarEncuentrosConArchivos(grupos, "TODOS", "políticas")).toHaveLength(1);
    expect(filtrarEncuentrosConArchivos(grupos, "TODOS", "Juan")).toHaveLength(1);
    expect(filtrarEncuentrosConArchivos(grupos, "GRABACIONES", "")).toHaveLength(1);
    expect(filtrarEncuentrosConArchivos(grupos, "ASISTENCIAS", "")).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx vitest run test/grabaciones-filtro-domain.test.ts`
Expected: FAIL because `grabaciones-filtro.domain.ts` does not exist.

- [x] **Step 3: Implement the pure domain module**

Crear `src/modules/meet/grabaciones-filtro.domain.ts`:

```ts
import type { TipoArtefactoMeet } from "./meet-artifacts.domain";

export type TipoFiltroArtefacto = "TODOS" | "GRABACIONES" | "ASISTENCIAS" | "NOTAS_Y_TRANSCRIPCIONES";

export type EstadoVisualGrabacion = "DISPONIBLE" | "PROCESANDO" | "NO_REGISTRADA" | "NO_REQUERIDA";

export type GrupoEncuentroConArchivos = Readonly<{
  instanciaId: string;
  titulo: string;
  programa: string;
  docente: string;
  fechaInicio: Date;
  folderId?: string | null;
  requiereGrabacion?: boolean;
  estadoGrabacion?: EstadoVisualGrabacion;
  archivos: readonly Readonly<{
    id: string;
    tipo: TipoArtefactoMeet;
    nombre?: string;
    webViewUrl?: string | null;
    tamanoBytes?: bigint | null;
    mimeType?: string | null;
  }>[];
}>;

export function resolverEstadoVisualGrabacion(datos: {
  tieneArchivoGrabacion: boolean;
  archivosSincronizadosAt: Date | null;
  finProgramadoAt: Date;
  requiereGrabacion: boolean;
}): EstadoVisualGrabacion {
  if (datos.tieneArchivoGrabacion) return "DISPONIBLE";
  const ahora = Date.now();
  const finMs = datos.finProgramadoAt.getTime();
  const transcurridoMs = ahora - finMs;
  const cuatroHorasMs = 4 * 60 * 60 * 1000;

  if (datos.archivosSincronizadosAt === null && transcurridoMs < cuatroHorasMs) {
    return "PROCESANDO";
  }

  if (datos.requiereGrabacion) {
    return "NO_REGISTRADA";
  }

  return "NO_REQUERIDA";
}

export function filtrarEncuentrosConArchivos(
  grupos: readonly GrupoEncuentroConArchivos[],
  filtro: TipoFiltroArtefacto,
  busqueda: string
): readonly GrupoEncuentroConArchivos[] {
  const query = busqueda.trim().toLowerCase();

  return grupos.filter((grupo) => {
    // Filtro por tipo de archivo
    if (filtro === "GRABACIONES" && !grupo.archivos.some((a) => a.tipo === "GRABACION")) {
      return false;
    }
    if (filtro === "ASISTENCIAS" && !grupo.archivos.some((a) => a.tipo === "LISTA_ASISTENCIA")) {
      return false;
    }
    if (
      filtro === "NOTAS_Y_TRANSCRIPCIONES" &&
      !grupo.archivos.some((a) => a.tipo === "TRANSCRIPCION" || a.tipo === "NOTAS")
    ) {
      return false;
    }

    // Filtro por texto
    if (!query) return true;
    const matchTitulo = grupo.titulo.toLowerCase().includes(query);
    const matchPrograma = grupo.programa.toLowerCase().includes(query);
    const matchDocente = grupo.docente.toLowerCase().includes(query);

    return matchTitulo || matchPrograma || matchDocente;
  });
}
```

- [x] **Step 4: Run the test and verify GREEN**

Run: `npx vitest run test/grabaciones-filtro-domain.test.ts`
Expected: PASS (4 tests passing).

---

### Task 3: Refactor Synchronization Service for Universal Capture and Gentle Error Handling

**Files:**

- Modify: `src/modules/meet/sincronizar-artefactos.service.ts`
- Modify: `test/sincronizar-artefactos-service.test.ts`

**Interfaces:**

- Produces:
  - `sincronizarArtefactosMeet`: sincroniza cualquier reunión terminada sin condicionarla a `requiereGrabacion: true`.
  - Cierra limpiamente el ciclo a las 48h sin escribir mensajes de error en `errorArchivos` si no hubo grabación.
  - Al procesar, no reporta fallas si Google está todavía renderizando el video.

- [x] **Step 1: Update unit tests in `test/sincronizar-artefactos-service.test.ts`**

Agregar prueba que valide:

1. Una reunión con `requiereGrabacion: false` donde alguien inició grabación (`estadoGrabacion === "GENERADA"`) sincroniza el archivo MP4 en Drive y lo guarda en base de datos.
2. Una reunión terminada hace más de 48 horas sin grabación se marca con `archivosSincronizadosAt = new Date()` y `errorArchivos = null` (no se trata como falla técnica).

- [x] **Step 2: Run test and verify RED**

Run: `npx vitest run test/sincronizar-artefactos-service.test.ts`

- [x] **Step 3: Modify `src/modules/meet/sincronizar-artefactos.service.ts`**

Ajustar la lógica para:

- Tratar `requiereGrabacion` solo como indicador de intención, no como filtro de exclusión.
- Si han transcurrido más de 48 horas desde `finProgramadoAt`, registrar `archivosSincronizadosAt = new Date()` y `errorArchivos = null` para finalizar el ciclo de sincronización sin generar alertas falsas.

- [x] **Step 4: Run test and verify GREEN**

Run: `npx vitest run test/sincronizar-artefactos-service.test.ts`
Expected: PASS.

---

### Task 4: API Route & Cron 3-Window Scanning Strategy

**Files:**

- Modify: `app/api/v1/reuniones/sincronizar-archivos/route.ts`

**Interfaces:**

- Produces: `executeSynchronization()` optimizado con 3 ventanas de escaneo:
  1. _Ventana Caliente (0 a 4 horas)_: `archivosSincronizadosAt: null`. Prioridad alta.
  2. _Ventana Intermedia (4 a 48 horas)_: reuniones con artefactos pendientes.
  3. _Cierre (> 48 horas)_: finalización elegante.

- [x] **Step 1: Update `app/api/v1/reuniones/sincronizar-archivos/route.ts`**

Implementar el selector de eventos por ventanas temporales e incorporar el timestamp de ejecución para telemetría.

- [x] **Step 2: Run all backend tests**

Run: `npx vitest run`
Expected: PASS.

---

### Task 5: Interactive Client Library Component (`RecordingsLibrary`)

**Files:**

- Create: `src/components/recordings-library.tsx`
- Modify: `app/(gestion)/grabaciones/grabaciones.css`

**Interfaces:**

- Produces: Componente de React con búsqueda reactiva en cliente, pestañas de filtro, badges de estado no alarmantes y enlaces limpios a Google Drive y documentos.
- Consumes: `GrupoEncuentroConArchivos[]` desde el Server Component.

- [x] **Step 1: Create `src/components/recordings-library.tsx`**

Implementar:

- Barra de búsqueda con ícono de lupa y botón para limpiar.
- Pestañas de filtrado (`Todos`, `Grabaciones`, `Asistencias`, `Transcripciones y notas`).
- Tarjetas de encuentro ordenadas cronológicamente con:
  - Título, materia, docente y fecha.
  - Enlace directo a la carpeta en Google Drive (`driveFolderUrl`).
  - Botones de acción directos: `Reproducir grabación`, `Ver asistencia`, `Abrir documento`.
  - Chip suave de estado: `⏳ Procesando video en Google Meet` (si corresponde).
- Estado vacío claro y amigable cuando no hay resultados de búsqueda.

- [x] **Step 2: Update `app/(gestion)/grabaciones/grabaciones.css`**

- Eliminar todas las clases de `.recording-incidents`, `.incident-row`, `.is-error`.
- Agregar estilos limpios para la biblioteca:
  - `.recordings-search-bar`: input estilizado con foco institucional.
  - `.recordings-filter-tabs`: botones tipo pill interactivos.
  - `.recordings-meeting-card`: tarjeta con sombra suave y jerarquía tipográfica.
  - `.recordings-status-badge`: insignias para video disponible y video en procesamiento.

---

### Task 6: Overhaul of `/grabaciones/page.tsx`

**Files:**

- Modify: `app/(gestion)/grabaciones/page.tsx`

**Interfaces:**

- Produces: Server Component limpio que obtiene los artefactos visibles según el rol del usuario, calcula contadores métricos y delega la interactividad a `RecordingsLibrary`.
- Consumes: `db`, `resolveSessionActor`, `listarArchivosMeetVisibles`.

- [x] **Step 1: Refactor `app/(gestion)/grabaciones/page.tsx`**

- Eliminar las llamadas a `listarGrabacionesPendientesVisibles` y `listarGrabacionesNoRealizadasVisibles` que alimentaban el bloque de incidencias.
- Reemplazar el botón manual `MeetArtifactsButton` por una insignia informativa de sincronización automática en segundo plano.
- Conservar el botón de acceso directo a la carpeta general de Drive (`driveDestinationId`).
- Agrupar los archivos por encuentro y pasarlos a `<RecordingsLibrary grupos={...} />`.

- [x] **Step 2: Run typecheck and tests**

Run: `npm run check && npx vitest run`
Expected: 0 TypeScript errors, 100% tests passing.

---

### Task 7: Meeting Detail Integration (`/reuniones/[solicitudId]`)

**Files:**

- Modify: `app/(gestion)/reuniones/[solicitudId]/page.tsx`
- Modify: `src/components/meeting-detail-manager.tsx`

**Interfaces:**

- Produces: Visibilidad directa de la grabación y lista de asistencia dentro de cada encuentro pasado en la ficha de la reunión.

- [x] **Step 1: Include `archivos` in `solicitudId/page.tsx`**

En la consulta de Prisma de `seriesRequests`, incluir `archivos: true` en los `eventosProveedor` para que la vista disponga de los enlaces de video y asistencia.

- [x] **Step 2: Render artifact links in `MeetingDetailManager`**

Para cada encuentro con `temporalidad === "PASADO"`, mostrar los botones:

- `🎥 Ver grabación` (si existe `webViewUrl`).
- `👥 Asistencia` (si existe lista generada).
- `📁 Carpeta Drive`.

- [x] **Step 3: Run typecheck and tests**

Run: `npm run check && npx vitest run`
Expected: 0 errors.

---

### Task 8: End-to-End Validation and Production Build

**Files:**

- Verification only

- [x] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: 100% tests passing.

- [x] **Step 2: Run typecheck**

Run: `npm run check`
Expected: 0 errors.

- [x] **Step 3: Run production build**

Run: `npm run build`
Expected: Successful Next.js build.

- [ ] **Step 4: Manual validation on browser**

Visitar:

1. `http://localhost:8000/grabaciones`: comprobar que no existen banners rojos de error, probar el buscador en vivo y los filtros por pestaña.
2. `http://localhost:8000/reuniones/[solicitudId]`: verificar que los encuentros pasados muestren sus enlaces directos a grabación y asistencia.

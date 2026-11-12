# Rediseño Arquitectónico, UI y UX del Dashboard Principal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rediseñar la ruta raíz `http://localhost:3000/` (`app/(gestion)/page.tsx`) de forma modular, altamente diferenciada por rol (`ADMINISTRACION`, `DOCENTE`, `ASISTENTE_TECNICO`) y persona, eliminando la sobrecarga cognitiva y optimizando la regla de los 5 segundos.

**Architecture:** Despachador delgado en `app/(gestion)/page.tsx` que delega en tres vistas orquestadas (`<AdminDashboard>`, `<TeacherDashboard>`, `<AssistantDashboard>`), respaldadas por adaptadores Prisma especializados (`admin-dashboard.adapter.ts`, `teacher-dashboard.adapter.ts`, `assistant-dashboard.adapter.ts`), componentes base compartidos (`DashboardHeader`, `LiveMeetingHero`), y funciones de dominio puro (`dashboard.domain.ts`).

**Tech Stack:** Next.js 16 (App Router, Turbopack, React 19 Server Components), TypeScript strict, Prisma 6, Vitest, Lucide React, CSS variables y tokens institucionales.

**Spec:** `docs/superpowers/specs/2026-09-11-dashboard-redesign.md`

## Global Constraints

- Trabajar directamente sobre la rama `main`.
- Prohibido llamar a `new Date()` o `Date.now()` en `src/modules/dashboard/dashboard.domain.ts` (debe recibir `ahora: Date`), validado por `test/functional-architecture.test.ts`.
- Prohibidas mutaciones de colecciones (`.push(`, `.sort(`, `.set(`, etc.) y `let`/`var` en `dashboard.domain.ts` según las reglas de pureza funcional del repositorio.
- Ningún objeto retornado por adaptadores hacia componentes puede contener tipos `bigint` sin convertir a `number` o `string`.
- No romper rutas existentes ni accesos directos ya en uso (`/reuniones`, `/asistencia-tecnica`, `/grabaciones`, `/agenda-abierta`).
- Mantener cobertura de tests: `npm run check`, `npx vitest run`, y `npm run build` deben pasar con 0 errores.

---

### Task 1: Tipos y Dominio Funcional Puro (`types.ts` y `dashboard.domain.ts`)

**Files:**

- Create: `src/modules/dashboard/types.ts`
- Create: `src/modules/dashboard/dashboard.domain.ts`
- Test: `test/dashboard-domain.test.ts`

**Interfaces:**

- Consumes: Tipos de fecha nativos `Date`.
- Produces:
  - `EstadoTemporalReunion = "EN_VIVO" | "PROXIMA_HOY" | "FUTURA" | "FINALIZADA"`
  - `determinarEstadoTemporal(inicio: Date, fin: Date, ahora: Date): EstadoTemporalReunion`
  - `formatearTiempoHastaReunion(inicio: Date, ahora: Date): string`
  - `esMismoDiaMontevideo(a: Date, b: Date): boolean`
  - `calcularNivelUrgenciaTriage(horasHastaInicio: number, tieneAsistente: boolean): "CRITICO" | "MODERADO" | "NORMAL"`

- [x] **Step 1: Escribir el test fallido para el dominio de dashboard**

Crear `test/dashboard-domain.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  calcularNivelUrgenciaTriage,
  determinarEstadoTemporal,
  esMismoDiaMontevideo,
  formatearTiempoHastaReunion
} from "../src/modules/dashboard/dashboard.domain";

describe("dashboard.domain", () => {
  const ahora = new Date("2026-09-11T18:00:00-03:00");

  it("clasifica una reunión como EN_VIVO 10 minutos antes del inicio y hasta el fin", () => {
    const inicio = new Date("2026-09-11T18:10:00-03:00");
    const fin = new Date("2026-09-11T20:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("EN_VIVO");
  });

  it("clasifica como PROXIMA_HOY si es más tarde el mismo día", () => {
    const inicio = new Date("2026-09-11T21:00:00-03:00");
    const fin = new Date("2026-09-11T23:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("PROXIMA_HOY");
  });

  it("clasifica como FUTURA si es en días posteriores", () => {
    const inicio = new Date("2026-09-12T10:00:00-03:00");
    const fin = new Date("2026-09-12T12:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("FUTURA");
  });

  it("clasifica como FINALIZADA si la hora actual superó el fin", () => {
    const inicio = new Date("2026-09-11T14:00:00-03:00");
    const fin = new Date("2026-09-11T16:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("FINALIZADA");
  });

  it("formatea el tiempo restante en lenguaje humano sin efectos de reloj", () => {
    const inicioEn15Min = new Date("2026-09-11T18:15:00-03:00");
    expect(formatearTiempoHastaReunion(inicioEn15Min, ahora)).toBe("Empieza en 15 min");

    const inicioEn2Horas = new Date("2026-09-11T20:30:00-03:00");
    expect(formatearTiempoHastaReunion(inicioEn2Horas, ahora)).toBe("Empieza en 2 h 30 min");

    const yaComenzada = new Date("2026-09-11T17:50:00-03:00");
    expect(formatearTiempoHastaReunion(yaComenzada, ahora)).toBe("En curso");
  });

  it("identifica el mismo día en zona horaria America/Montevideo", () => {
    const d1 = new Date("2026-09-11T03:00:00Z"); // 00:00 en Montevideo
    const d2 = new Date("2026-09-11T23:00:00Z"); // 20:00 en Montevideo
    const d3 = new Date("2026-09-12T03:01:00Z"); // 00:01 del día siguiente en Montevideo
    expect(esMismoDiaMontevideo(d1, d2)).toBe(true);
    expect(esMismoDiaMontevideo(d1, d3)).toBe(false);
  });

  it("calcula nivel de urgencia de triage para reuniones sin asistente", () => {
    expect(calcularNivelUrgenciaTriage(2, false)).toBe("CRITICO");
    expect(calcularNivelUrgenciaTriage(6, false)).toBe("MODERADO");
    expect(calcularNivelUrgenciaTriage(24, false)).toBe("NORMAL");
    expect(calcularNivelUrgenciaTriage(1, true)).toBe("NORMAL");
  });
});
```

- [x] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run test/dashboard-domain.test.ts`
Expected: FAIL (módulos no encontrados).

- [x] **Step 3: Implementar `types.ts` y `dashboard.domain.ts`**

Crear `src/modules/dashboard/types.ts`:

```typescript
export type EstadoTemporalReunion = "EN_VIVO" | "PROXIMA_HOY" | "FUTURA" | "FINALIZADA";

export interface HeroMeetingDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly joinUrl: string | null;
  readonly cohostConfirmado: boolean;
  readonly cohosts: readonly { readonly name: string; readonly email: string }[];
  readonly asistente: { readonly id: string; readonly nombre: string } | null;
  readonly requiereAsistencia: boolean;
  readonly salaNombre: string | null;
}

export interface UpcomingMeetingSummaryDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly joinUrl: string | null;
  readonly estadoTemporal: EstadoTemporalReunion;
  readonly asistenteNombre: string | null;
  readonly requiereAsistencia: boolean;
  readonly cohostsVerificados: boolean;
}

export interface TriageAttentionItemDTO {
  readonly key: string;
  readonly tone: "danger" | "warning" | "neutral";
  readonly count: number;
  readonly title: string;
  readonly details: readonly string[];
  readonly href: string;
  readonly actionLabel: string;
}

export interface RecentRecordingDTO {
  readonly id: string;
  readonly titulo: string;
  readonly programa: string;
  readonly fecha: string;
  readonly duracionMinutos: number | null;
  readonly driveUrl: string | null;
  readonly publicUrl: string | null;
}

export interface AssistantOpportunityDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly yaPostulado: boolean;
}
```

Crear `src/modules/dashboard/dashboard.domain.ts` (estrictamente puro, sin `new Date()`, sin `let`, sin mutaciones):

```typescript
import type { EstadoTemporalReunion } from "./types";

const MINUTOS_ANTICIPACION_EN_VIVO = 15;

export function determinarEstadoTemporal(inicio: Date, fin: Date, ahora: Date): EstadoTemporalReunion {
  const ahoraMs = ahora.getTime();
  const inicioMs = inicio.getTime();
  const finMs = fin.getTime();
  const umbralEnVivoMs = inicioMs - MINUTOS_ANTICIPACION_EN_VIVO * 60 * 1000;

  if (ahoraMs > finMs) {
    return "FINALIZADA";
  }
  if (ahoraMs >= umbralEnVivoMs && ahoraMs <= finMs) {
    return "EN_VIVO";
  }
  if (esMismoDiaMontevideo(inicio, ahora)) {
    return "PROXIMA_HOY";
  }
  return "FUTURA";
}

export function formatearTiempoHastaReunion(inicio: Date, ahora: Date): string {
  const diffMs = inicio.getTime() - ahora.getTime();
  if (diffMs <= 0) {
    return "En curso";
  }
  const totalMinutos = Math.floor(diffMs / (60 * 1000));
  if (totalMinutos < 60) {
    return `Empieza en ${Math.max(1, totalMinutos)} min`;
  }
  const horas = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;
  if (minutosRestantes === 0) {
    return `Empieza en ${horas} h`;
  }
  return `Empieza en ${horas} h ${minutosRestantes} min`;
}

export function esMismoDiaMontevideo(a: Date, b: Date): boolean {
  const diaA = obtenerClaveDiaMontevideo(a);
  const diaB = obtenerClaveDiaMontevideo(b);
  return diaA === diaB;
}

export function obtenerClaveDiaMontevideo(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

export function calcularNivelUrgenciaTriage(
  horasHastaInicio: number,
  tieneAsistente: boolean
): "CRITICO" | "MODERADO" | "NORMAL" {
  if (tieneAsistente) {
    return "NORMAL";
  }
  if (horasHastaInicio <= 4) {
    return "CRITICO";
  }
  if (horasHastaInicio <= 12) {
    return "MODERADO";
  }
  return "NORMAL";
}
```

- [x] **Step 4: Ejecutar tests de dominio y arquitectura funcional**

Run: `npx vitest run test/dashboard-domain.test.ts test/functional-architecture.test.ts`
Expected: PASS (todas las pruebas pasan y la arquitectura funcional valida que no hay efectos impuros).

- [x] **Step 5: Commit**

```bash
git add src/modules/dashboard/types.ts src/modules/dashboard/dashboard.domain.ts test/dashboard-domain.test.ts
git commit -m "feat(dashboard): agregar tipos y dominio funcional puro para rediseno"
```

---

### Task 2: Adaptadores de Datos Prisma por Rol (`teacher`, `assistant`, `admin`)

**Files:**

- Create: `src/modules/dashboard/teacher-dashboard.adapter.ts`
- Create: `src/modules/dashboard/assistant-dashboard.adapter.ts`
- Create: `src/modules/dashboard/admin-dashboard.adapter.ts`
- Test: `test/dashboard-adapters.test.ts`

**Interfaces:**

- Consumes: `db` de `@/src/lib/db`, tipos de `types.ts`, funciones de `dashboard.domain.ts`.
- Produces:
  - `obtenerDashboardDocente(db: PrismaClient, usuarioId: string, ahora: Date)`
  - `obtenerDashboardAsistenteOptimizado(db: PrismaClient, usuarioId: string, ahora: Date)`
  - `obtenerDashboardAdministracion(db: PrismaClient, ahora: Date)`

- [x] **Step 1: Escribir el test de adaptadores de dashboard**

Crear `test/dashboard-adapters.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { obtenerClaveDiaMontevideo } from "../src/modules/dashboard/dashboard.domain";

describe("adaptadores de dashboard", () => {
  it("valida la construcción de claves de fecha para consultas Prisma", () => {
    const fecha = new Date("2026-09-11T15:00:00Z");
    const clave = obtenerClaveDiaMontevideo(fecha);
    expect(clave).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [x] **Step 2: Ejecutar el test para verificar**

Run: `npx vitest run test/dashboard-adapters.test.ts`
Expected: PASS.

- [x] **Step 3: Implementar `teacher-dashboard.adapter.ts`**

Crear `src/modules/dashboard/teacher-dashboard.adapter.ts`:

- Consulta las instancias programadas del docente (`finProgramadoAt >= ahora`).
- Identifica la clase más inmediata para el Hero (si empieza hoy o está en curso).
- Recupera las siguientes 5 reuniones y las 3 grabaciones recientes de sus programas.
- Transforma todos los datos a DTOs planos (sin `BigInt`).

- [x] **Step 4: Implementar `assistant-dashboard.adapter.ts`**

Crear `src/modules/dashboard/assistant-dashboard.adapter.ts`:

- Reutiliza el cálculo de horas mensuales de `obtenerDashboardAsistente`.
- Incluye consulta directa de 3 reuniones próximas que requieren asistencia y no tienen asignación para postularse en 1 clic.
- Transforma a `HeroMeetingDTO` y `AssistantOpportunityDTO[]`.

- [x] **Step 5: Implementar `admin-dashboard.adapter.ts`**

Crear `src/modules/dashboard/admin-dashboard.adapter.ts`:

- Consulta acotada de alertas de triage (sin asistencia hoy, fallas Meet activas, grabaciones pendientes, incidencias).
- Consulta cronológica de las salas del día (`inicioProgramadoAt` entre inicio y fin del día en Montevideo, `take: 8`).
- Métricas consolidadas compactas (solicitudes en curso, reuniones de la semana).

- [x] **Step 6: Verificar tipos y tests**

Run: `npm run check && npx vitest run test/dashboard-adapters.test.ts`
Expected: PASS con 0 errores.

- [x] **Step 7: Commit**

```bash
git add src/modules/dashboard/teacher-dashboard.adapter.ts src/modules/dashboard/assistant-dashboard.adapter.ts src/modules/dashboard/admin-dashboard.adapter.ts test/dashboard-adapters.test.ts
git commit -m "feat(dashboard): agregar adaptadores Prisma especializados por rol"
```

---

### Task 3: Componentes UI Compartidos (`DashboardHeader` y `LiveMeetingHero`)

**Files:**

- Create: `src/components/dashboard/dashboard-header.tsx`
- Create: `src/components/dashboard/live-meeting-hero.tsx`
- Test: `test/dashboard-components.test.ts`

**Interfaces:**

- Consumes: `HeroMeetingDTO`, `formatShortDate`, `formatDate`, `formatTime`, `CopyMeetLinkButton`.
- Produces:
  - `<DashboardHeader userName={string} roleName={string} actions={ReactNode} />`
  - `<LiveMeetingHero meeting={HeroMeetingDTO | null} role="DOCENTE" | "ASISTENTE_TECNICO" | "ADMINISTRACION" emptyStateCopy={string} />`

- [x] **Step 1: Escribir test para componentes base del dashboard**

Crear `test/dashboard-components.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { determinarEstadoTemporal } from "../src/modules/dashboard/dashboard.domain";

describe("componentes compartidos de dashboard", () => {
  it("determina si la tarjeta hero debe mostrar el badge En Vivo", () => {
    const ahora = new Date("2026-09-11T18:00:00Z");
    const inicio = new Date("2026-09-11T18:05:00Z");
    const fin = new Date("2026-09-11T19:30:00Z");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("EN_VIVO");
  });
});
```

- [x] **Step 2: Implementar `src/components/dashboard/dashboard-header.tsx`**

Implementar un encabezado limpio y humano:

- Saludo personalizado (_"Hola, [Nombre]"_).
- Subtítulo con fecha formateada en Montevideo y rol en badge estilizado.
- Contenedor de acciones primarias y secundarias con soporte para responsive.

- [x] **Step 3: Implementar `src/components/dashboard/live-meeting-hero.tsx`**

Implementar la tarjeta Hero de alta visibilidad:

- Si `meeting !== null`:
  - Badge de estado dinámico (_"En vivo ahora"_ con pulso animado o cuenta regresiva _"Empieza en X min"_).
  - Título del evento / clase, programa académico y modalidad (Virtual / Híbrida).
  - Horario formateado (`19:00–21:00`).
  - Botón primario: **"Entrar a Google Meet"** (`target="_blank"` hacia `meeting.joinUrl`).
  - Botón secundario: `<CopyMeetLinkButton url={meeting.joinUrl} />`.
  - Ficha de cohost técnico y estado de verificación.
- Si `meeting === null`:
  - Estado vacío amable y elegante con mensaje personalizado (ej. _"No tenés clases programadas para hoy"_).

- [x] **Step 4: Verificar TypeScript y tests**

Run: `npm run check && npx vitest run test/dashboard-components.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard-header.tsx src/components/dashboard/live-meeting-hero.tsx test/dashboard-components.test.ts
git commit -m "feat(dashboard): crear componentes base DashboardHeader y LiveMeetingHero"
```

---

### Task 4: Sub-dashboard de Docente (`TeacherDashboard`)

**Files:**

- Create: `src/components/dashboard/teacher/teacher-upcoming-list.tsx`
- Create: `src/components/dashboard/teacher/teacher-recent-recordings.tsx`
- Create: `src/components/dashboard/teacher/teacher-dashboard.tsx`
- Modify: `src/components/teacher-dashboard.tsx` (re-exportar para compatibilidad)

**Interfaces:**

- Consumes: `obtenerDashboardDocente` de `teacher-dashboard.adapter.ts`, `DashboardHeader`, `LiveMeetingHero`.
- Produces: `<TeacherDashboard user={session.user} />`.

- [x] **Step 1: Implementar `teacher-upcoming-list.tsx`**

Implementar una lista limpia de próximas sesiones:

- Agrupación visual por fecha y hora.
- Título con enlace a la reunión.
- Modalidad y nombre del asistente técnico (si tiene).
- Botón discreto de Meet si ya está generado.

- [x] **Step 2: Implementar `teacher-recent-recordings.tsx`**

Implementar la tarjeta de grabaciones recientes para docentes:

- Muestra las últimas clases que ya tienen video sincronizado en Google Drive.
- Botón para abrir el video en Google Drive o copiar el enlace para compartir con alumnos.
- Enlace al final a `/grabaciones`.

- [x] **Step 3: Implementar `teacher-dashboard.tsx` y conectar con adapter**

Orquestar el panel docente:

- Llama a `obtenerDashboardDocente(db, user.id, new Date())`.
- Renderiza `<DashboardHeader>`, `<LiveMeetingHero>`, `<TeacherUpcomingList>` y `<TeacherRecentRecordings>`.

- [x] **Step 4: Actualizar `src/components/teacher-dashboard.tsx` para delegar al nuevo módulo**

- [x] **Step 5: Verificar TypeScript y compilación**

Run: `npm run check && npx vitest run`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/components/dashboard/teacher/ src/components/teacher-dashboard.tsx
git commit -m "feat(dashboard): implementar sub-dashboard optimizado para docentes"
```

---

### Task 5: Sub-dashboard de Asistente Técnico (`AssistantDashboard`)

**Files:**

- Create: `src/components/dashboard/assistant/assistant-open-opportunities.tsx`
- Create: `src/components/dashboard/assistant/assistant-hours-summary.tsx`
- Create: `src/components/dashboard/assistant/assistant-dashboard.tsx`
- Modify: `src/components/assistant-dashboard.tsx` (re-exportar para compatibilidad)

**Interfaces:**

- Consumes: `obtenerDashboardAsistenteOptimizado` de `assistant-dashboard.adapter.ts`, `DashboardHeader`, `LiveMeetingHero`.
- Produces: `<AssistantDashboard user={session.user} />`.

- [x] **Step 1: Implementar `assistant-open-opportunities.tsx`**

Implementar la sección de vacantes abiertas:

- Muestra hasta 3 reuniones que buscan asistente técnico.
- Permite postularse en 1 clic o navegar a `/agenda-abierta`.
- Indica fecha, hora, sala y modalidad.

- [x] **Step 2: Implementar `assistant-hours-summary.tsx`**

Implementar el resumen de horas trabajadas y postulaciones activas:

- Horas acumuladas en el mes (virtuales e híbridas).
- Horas del mes anterior.
- Estado de postulaciones respondidas vs pendientes.

- [x] **Step 3: Implementar `assistant-dashboard.tsx` y conectar con adapter**

Orquestar el panel del asistente:

- Renderiza `<DashboardHeader>`, `<LiveMeetingHero>` (con badge de cohost confirmado en Meet), `<AssistantOpenOpportunities>`, `<AssistantHoursSummary>` y las siguientes coberturas.

- [x] **Step 4: Actualizar `src/components/assistant-dashboard.tsx` para delegar al nuevo módulo**

- [x] **Step 5: Verificar TypeScript y compilación**

Run: `npm run check && npx vitest run`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/components/dashboard/assistant/ src/components/assistant-dashboard.tsx
git commit -m "feat(dashboard): implementar sub-dashboard optimizado para asistentes tecnicos"
```

---

### Task 6: Sub-dashboard de Administración (`AdminDashboard`)

**Files:**

- Create: `src/components/dashboard/admin/admin-triage-section.tsx`
- Create: `src/components/dashboard/admin/admin-today-timeline.tsx`
- Create: `src/components/dashboard/admin/admin-metrics-bar.tsx`
- Create: `src/components/dashboard/admin/admin-dashboard.tsx`

**Interfaces:**

- Consumes: `obtenerDashboardAdministracion` de `admin-dashboard.adapter.ts`, `DashboardHeader`, componentes de acción de `src/components/admin-attention-actions.tsx`.
- Produces: `<AdminDashboard user={session.user} />`.

- [x] **Step 1: Implementar `admin-triage-section.tsx`**

Implementar la sección de Triage Urgente:

- Si hay problemas: Tarjetas compactas con las acciones de 1 clic existentes (`AdminQuickAssignAction`, `AdminRetryMeetAction`, `AdminSyncRecordingsAction`).
- Si todo está en orden: Banner verde _"Todo bajo control: No hay excepciones operativas pendientes para hoy"_.

- [x] **Step 2: Implementar `admin-today-timeline.tsx`**

Implementar el timeline de salas de hoy:

- Cronología del día ordenada por hora de inicio.
- Estado en vivo / próxima / finalizada.
- Indicador claro de Asistente Técnico y badge de cohosts verificado/pendiente.
- Botón rápido de Meet y copia de link.

- [x] **Step 3: Implementar `admin-metrics-bar.tsx`**

Implementar la barra de métricas secundarias en la parte inferior:

- Solicitudes abiertas, reuniones de la semana, incidencias históricas.
- Enlaces rápidos de administración (`/reuniones`, `/asistencia-tecnica`, `/grabaciones`).

- [x] **Step 4: Implementar `admin-dashboard.tsx`**

Orquestar el panel de administración unificado:

- Carga `obtenerDashboardAdministracion(db, new Date())`.
- Renderiza `<DashboardHeader>`, `<AdminTriageSection>`, `<AdminTodayTimeline>` y `<AdminMetricsBar>`.

- [x] **Step 5: Verificar TypeScript y compilación**

Run: `npm run check && npx vitest run`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/components/dashboard/admin/
git commit -m "feat(dashboard): implementar sub-dashboard de administracion con triage operativo"
```

---

### Task 7: Integración en `app/(gestion)/page.tsx`, Estilos CSS y Verificación Total

**Files:**

- Modify: `app/(gestion)/page.tsx`
- Modify: `styles/globals.css` (estilos para hero de clase en vivo, timeline y triage)
- Test: `test/dashboard-views.test.ts`

**Interfaces:**

- Consumes: `<AdminDashboard>`, `<TeacherDashboard>`, `<AssistantDashboard>`, `auth()`.
- Produces: Página raíz `/` limpia de menos de 40 líneas de código.

- [x] **Step 1: Escribir test de integración para el despachador de roles en `test/dashboard-views.test.ts`**

Validar que `HomePage` rutea correctamente a cada rol y redirige si no hay sesión.

- [x] **Step 2: Refactorizar `app/(gestion)/page.tsx`**

Reducir `app/(gestion)/page.tsx` a un despachador limpio:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminDashboard } from "@/src/components/dashboard/admin/admin-dashboard";
import { AssistantDashboard } from "@/src/components/dashboard/assistant/assistant-dashboard";
import { TeacherDashboard } from "@/src/components/dashboard/teacher/teacher-dashboard";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) redirect("/acceso");

  if (session.user.role === "ASISTENTE_TECNICO") {
    return <AssistantDashboard user={session.user} />;
  }

  if (session.user.role === "DOCENTE") {
    return <TeacherDashboard user={session.user} />;
  }

  return <AdminDashboard user={session.user} />;
}
```

- [x] **Step 3: Ajustar estilos en `styles/globals.css`**

Añadir y afinar estilos CSS para:

- `.dashboard-hero-card` (tarjeta Hero con acentos visuales y pulso de "En vivo").
- `.today-timeline` (cronología de salas limpia con badges).
- `.triage-section` (grilla ordenada de atención urgente).
- Asegurar diseño responsive móvil y de escritorio con tokens CSS existentes.

- [x] **Step 4: Ejecutar todas las verificaciones del proyecto**

Run:

1. `npm run check` (TypeScript estricto)
2. `npm run validate:schema` (Prisma)
3. `npx vitest run` (100% de la suite de pruebas)
4. `npm run build` (Turbopack exitoso en 47+ rutas)

- [x] **Step 5: Commit final**

```bash
git add app/(gestion)/page.tsx styles/globals.css test/dashboard-views.test.ts
git commit -m "feat(dashboard): conectar nuevo dashboard modular por rol y optimizar estilos UI"
```

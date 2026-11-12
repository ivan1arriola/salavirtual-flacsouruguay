# Consola de reunión Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar una consola operativa en AppFLACSOAndroid basada en el estado real de Google Meet, con participantes, grabación, incidencias y cierre, usando Sala Virtual como único backend.

**Architecture:** `salavirtual-flacsouruguay` calcula y normaliza estado operativo, participantes y artefactos de Meet y los expone por `/api/v1/mobile/...`. `AppFLACSOAndroid` consume contratos estables y nunca accede directamente a Google Workspace ni PostgreSQL. La actualización durante `ESPERANDO_INICIO` y `EN_CURSO` usa polling con caché corta en backend y último dato válido en Android.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 6, PostgreSQL, Google Meet REST API, Vitest, Kotlin, Jetpack Compose, Android.

**Spec:** `docs/superpowers/specs/2026-09-16-consola-reunion-android-design.md`

## Global Constraints

- El estado `EN_CURSO` solo existe si Google Meet confirma una conferencia real.
- Al llegar el horario sin conferencia, usar `ESPERANDO_INICIO`.
- Si termina la franja prevista sin conferencia, usar `NO_INICIADA`.
- Android no puede recibir credenciales Google ni consultar PostgreSQL directamente.
- Un fallo externo no cambia el último estado válido por sí solo.
- Esta iteración no incluye Calendar personal, Telegram, disponibilidad ni reemplazos.

---

### Task 1: Modelar estado operativo en backend

**Files:**

- Create: `src/modules/asistencia/estado-reunion.ts`
- Create: `src/modules/asistencia/estado-reunion.test.ts`

**Interfaces:**

- Produces: `type EstadoReunionOperativa = "PROGRAMADA" | "ESPERANDO_INICIO" | "EN_CURSO" | "FINALIZADA" | "NO_INICIADA"`
- Produces: `derivarEstadoReunion(input): EstadoReunionOperativa`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { derivarEstadoReunion } from "./estado-reunion";

const inicio = new Date("2026-09-16T18:30:00-03:00");
const fin = new Date("2026-09-16T20:00:00-03:00");

describe("derivarEstadoReunion", () => {
  it("devuelve PROGRAMADA antes del horario", () => {
    expect(
      derivarEstadoReunion({
        ahora: new Date("2026-09-16T18:00:00-03:00"),
        inicio,
        fin,
        conferenciaInicio: null,
        conferenciaFin: null
      })
    ).toBe("PROGRAMADA");
  });

  it("devuelve ESPERANDO_INICIO al llegar la hora sin conferencia", () => {
    expect(
      derivarEstadoReunion({
        ahora: new Date("2026-09-16T18:40:00-03:00"),
        inicio,
        fin,
        conferenciaInicio: null,
        conferenciaFin: null
      })
    ).toBe("ESPERANDO_INICIO");
  });

  it("devuelve EN_CURSO con conferencia iniciada y no finalizada", () => {
    expect(
      derivarEstadoReunion({
        ahora: new Date("2026-09-16T18:45:00-03:00"),
        inicio,
        fin,
        conferenciaInicio: new Date("2026-09-16T18:42:00-03:00"),
        conferenciaFin: null
      })
    ).toBe("EN_CURSO");
  });

  it("devuelve FINALIZADA si la conferencia terminó", () => {
    expect(
      derivarEstadoReunion({
        ahora: new Date("2026-09-16T20:10:00-03:00"),
        inicio,
        fin,
        conferenciaInicio: new Date("2026-09-16T18:42:00-03:00"),
        conferenciaFin: new Date("2026-09-16T20:03:00-03:00")
      })
    ).toBe("FINALIZADA");
  });

  it("devuelve NO_INICIADA al terminar la franja sin conferencia", () => {
    expect(
      derivarEstadoReunion({
        ahora: new Date("2026-09-16T20:01:00-03:00"),
        inicio,
        fin,
        conferenciaInicio: null,
        conferenciaFin: null
      })
    ).toBe("NO_INICIADA");
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- src/modules/asistencia/estado-reunion.test.ts`
Expected: FAIL because module/function does not exist.

- [ ] **Step 3: Implement minimal derivation**

```ts
export type EstadoReunionOperativa =
  "PROGRAMADA" | "ESPERANDO_INICIO" | "EN_CURSO" | "FINALIZADA" | "NO_INICIADA";

export function derivarEstadoReunion(input: {
  ahora: Date;
  inicio: Date;
  fin: Date;
  conferenciaInicio: Date | null;
  conferenciaFin: Date | null;
}): EstadoReunionOperativa {
  if (input.conferenciaInicio && input.conferenciaFin) return "FINALIZADA";
  if (input.conferenciaInicio) return "EN_CURSO";
  if (input.ahora < input.inicio) return "PROGRAMADA";
  if (input.ahora <= input.fin) return "ESPERANDO_INICIO";
  return "NO_INICIADA";
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `npm test -- src/modules/asistencia/estado-reunion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/asistencia/estado-reunion.ts src/modules/asistencia/estado-reunion.test.ts
git commit -m "feat: modelar estado operativo de reuniones"
```

### Task 2: Adaptador Google Meet para conferencia, participantes y grabación

**Files:**

- Create: `src/modules/google-meet/conference-status.ts`
- Create: `src/modules/google-meet/conference-status.test.ts`
- Modify: Google Meet client/helper existente identificado por `git grep "meet.googleapis.com\|conferenceRecords" src app`

**Interfaces:**

- Produces: `getMeetConferenceSnapshot(meetingCode: string): Promise<MeetConferenceSnapshot | null>`
- Produces: `MeetConferenceSnapshot` con `startedAt`, `endedAt`, `participants`, `recording`.

- [ ] **Step 1: Write contract test with mocked Google response**

```ts
it("normaliza una conferencia activa", async () => {
  const snapshot = await getMeetConferenceSnapshot("abc-defg-hij", fakeMeetClientActive);
  expect(snapshot?.startedAt).toEqual(new Date("2026-09-16T21:42:00Z"));
  expect(snapshot?.endedAt).toBeNull();
  expect(snapshot?.participants[0].active).toBe(true);
});
```

- [ ] **Step 2: Run targeted test and verify failure**

Run: `npm test -- src/modules/google-meet/conference-status.test.ts`
Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement normalizer**

Define these exact public types:

```ts
export type MeetParticipantSession = {
  sessionId: string;
  displayName: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  active: boolean;
};

export type RecordingStatus = "NO_INICIADA" | "GRABANDO" | "PROCESANDO" | "DISPONIBLE" | "NO_DISPONIBLE";

export type MeetConferenceSnapshot = {
  startedAt: Date;
  endedAt: Date | null;
  participants: MeetParticipantSession[];
  recording: { status: RecordingStatus; url: string | null };
};
```

Resolve meeting space/conference record by meeting code using the existing Google authentication layer. Query participants and participant sessions for the resolved conference record. Query recording artifacts for the same conference record. Normalize Google timestamps to `Date` and never expose raw Google credentials.

- [ ] **Step 4: Add tests for ended conference and processing recording**

```ts
it("marca una grabación pendiente como PROCESANDO", async () => {
  const snapshot = await getMeetConferenceSnapshot("abc-defg-hij", fakeMeetClientEndedWithoutArtifact);
  expect(snapshot?.endedAt).not.toBeNull();
  expect(snapshot?.recording.status).toBe("PROCESANDO");
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- src/modules/google-meet/conference-status.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/google-meet
git commit -m "feat: normalizar conferencia y artefactos de Meet"
```

### Task 3: Servicio de estado operativo de una reunión asignada

**Files:**

- Create: `src/modules/asistencia/reunion-operativa.service.ts`
- Create: `src/modules/asistencia/reunion-operativa.service.test.ts`

**Interfaces:**

- Consumes: `derivarEstadoReunion`, `getMeetConferenceSnapshot`
- Produces: `getReunionOperativa(reunionId: string, actorId: string): Promise<ReunionOperativaDto>`

- [ ] **Step 1: Define DTO and failing service tests**

```ts
export type ReunionOperativaDto = {
  id: string;
  estado: EstadoReunionOperativa;
  inicioPrevisto: string;
  finPrevisto: string;
  inicioReal: string | null;
  finReal: string | null;
  meetUrl: string | null;
  hostEmail: string | null;
  participantesActivos: number;
  participantes: Array<{
    sessionId: string;
    displayName: string | null;
    joinedAt: string;
    leftAt: string | null;
    active: boolean;
  }>;
  grabacion: { status: RecordingStatus; url: string | null };
  actualizadoEn: string;
};
```

Test that an assigned assistant receives the meeting, an unrelated assistant is rejected, and a scheduled meeting becomes `ESPERANDO_INICIO` without Meet snapshot.

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `npm test -- src/modules/asistencia/reunion-operativa.service.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement service using existing Prisma models and authorization helpers**

Read meeting schedule, Meet code/url, host and assistant assignment. Reuse the current authorization pattern rather than introducing a second mobile auth model. Call Meet only when the meeting is near/inside/recently after its scheduled window, and return normalized DTO.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/modules/asistencia/reunion-operativa.service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/asistencia/reunion-operativa.service.*
git commit -m "feat: agregar servicio de reunión operativa"
```

### Task 4: Endpoint móvil de consola

**Files:**

- Create: `app/api/v1/mobile/reuniones/[id]/operativa/route.ts`
- Create or modify: route test following existing mobile API test conventions.

**Interfaces:**

- Consumes: `getReunionOperativa`
- Produces: `GET /api/v1/mobile/reuniones/:id/operativa`

- [ ] **Step 1: Write endpoint tests**

Verify `200` for assigned assistant, `401` without mobile session, `403` for unauthorized actor, and exact DTO keys.

- [ ] **Step 2: Run tests and verify failure**

Run the repository's targeted Vitest command for this route.
Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement GET route**

Resolve actor with the existing mobile authentication adapter, call `getReunionOperativa`, map authorization errors to `403` and missing meeting to `404`.

- [ ] **Step 4: Run targeted tests and full backend tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/v1/mobile/reuniones src/modules/asistencia
git commit -m "feat: exponer consola operativa por API móvil"
```

### Task 5: Persistir incidencias operativas

**Files:**

- Modify: `prisma/schema.prisma`
- Create: corresponding Prisma migration
- Create: `src/modules/asistencia/incidencias.service.ts`
- Create: `src/modules/asistencia/incidencias.service.test.ts`
- Create: `app/api/v1/mobile/reuniones/[id]/incidencias/route.ts`

**Interfaces:**

- Produces: `POST /api/v1/mobile/reuniones/:id/incidencias`
- Input: `{ categoria: "DOCENTE_NO_INGRESA" | "AUDIO" | "GRABACION" | "SALA_INCORRECTA" | "OTRA", nota?: string }`

- [ ] **Step 1: Add failing service tests**

Test category validation, optional note, actor attribution and meeting authorization.

- [ ] **Step 2: Add Prisma model and migration**

Use a dedicated `IncidenciaAsistencia` model related to meeting and assistant/staff actor, with `categoria`, nullable `nota`, and `createdAt`.

- [ ] **Step 3: Generate Prisma client and run migration tests**

Run: `npx prisma generate`
Then run the repository's DB-backed test command.
Expected: schema and client succeed.

- [ ] **Step 4: Implement service and POST route**

Return the created incident normalized for mobile display.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma src/modules/asistencia app/api/v1/mobile/reuniones
git commit -m "feat: registrar incidencias de asistencia"
```

### Task 6: Exponer cierre operativo

**Files:**

- Modify: `src/modules/asistencia/reunion-operativa.service.ts`
- Create: `app/api/v1/mobile/reuniones/[id]/cierre/route.ts`
- Test: service and route tests.

**Interfaces:**

- Produces: `POST /api/v1/mobile/reuniones/:id/cierre`
- Input: `{ observacion?: string }`

- [ ] **Step 1: Write failing closure tests**

Verify closure is allowed only after `FINALIZADA` or `NO_INICIADA`, stores assistant confirmation/optional note using the existing attendance/history model where possible, and does not overwrite Meet-derived times.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement minimal closure logic**

Reuse existing attendance/history entities if present. Only add schema if no appropriate existing persistence exists.

- [ ] **Step 4: Run backend suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/asistencia app/api/v1/mobile/reuniones prisma
git commit -m "feat: cerrar asistencia desde la consola móvil"
```

### Task 7: Modelos y API client en AppFLACSOAndroid

**Files:**

- Modify: `app/src/main/java/uy/edu/flacso/meetassistant/data/Models.kt`
- Modify: `app/src/main/java/uy/edu/flacso/meetassistant/data/Contracts.kt`
- Modify: `app/src/main/java/uy/edu/flacso/meetassistant/data/ApiClient.kt`
- Add/update unit tests in the app module.

**Interfaces:**

- Consumes: backend operational DTO/endpoints.
- Produces Kotlin enums/data classes matching exact backend values.

- [ ] **Step 1: Add failing serialization tests**

Cover all five meeting states and all five recording states.

- [ ] **Step 2: Add Kotlin models**

Define `OperationalMeetingState`, `RecordingState`, `OperationalParticipant`, `OperationalMeeting`, `MeetingIncidentRequest`, `MeetingClosureRequest`.

- [ ] **Step 3: Add API methods**

Add methods for GET operational meeting, POST incident and POST closure using the current authenticated API client/session.

- [ ] **Step 4: Run Android unit tests**

Run: `./gradlew test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java app/src/test
git commit -m "feat: consumir consola operativa desde Android"
```

### Task 8: Repository/ViewModel con polling y último estado válido

**Files:**

- Create: `app/src/main/java/uy/edu/flacso/meetassistant/meeting/OperationalMeetingRepository.kt`
- Create: `app/src/main/java/uy/edu/flacso/meetassistant/meeting/OperationalMeetingViewModel.kt`
- Create tests under matching test package.

**Interfaces:**

- Produces observable state containing `meeting`, `isRefreshing`, `isStale`, `errorMessage`.

- [ ] **Step 1: Write tests for polling policy**

Verify periodic refresh only while `ESPERANDO_INICIO` or `EN_CURSO`; stop polling for `PROGRAMADA`, `FINALIZADA`, `NO_INICIADA`.

- [ ] **Step 2: Write stale-cache test**

After one successful load followed by network failure, keep last meeting and set `isStale=true`.

- [ ] **Step 3: Implement repository/ViewModel**

Use lifecycle-aware coroutine polling and existing dependency patterns. Do not introduce WorkManager for this foreground-only console.

- [ ] **Step 4: Run Android unit tests**

Run: `./gradlew test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uy/edu/flacso/meetassistant/meeting app/src/test
git commit -m "feat: actualizar estado operativo de reuniones"
```

### Task 9: Consola Compose

**Files:**

- Create: `app/src/main/java/uy/edu/flacso/meetassistant/ui/OperationalMeetingScreen.kt`
- Modify: `app/src/main/java/uy/edu/flacso/meetassistant/ui/FlacsoMeetApp.kt`
- Add Compose/UI tests if the project already has Compose test infrastructure.

**Interfaces:**

- Consumes: `OperationalMeetingViewModel`.

- [ ] **Step 1: Implement state-specific header rendering with preview/test cases**

Required copy:

- `PROGRAMADA`: show schedule and normal details.
- `ESPERANDO_INICIO`: label `Esperando inicio` and keep meeting visually prominent.
- `EN_CURSO`: label `En curso`, timer from real start, active participant count and recording state.
- `FINALIZADA`: show actual duration, participant summary and recording link/status.
- `NO_INICIADA`: label `No iniciada` and offer review/closure action.

- [ ] **Step 2: Add participant section**

Show active first, then ended sessions, with joined/left times where available.

- [ ] **Step 3: Add incident action sheet**

Provide the five predefined categories and optional note for `OTRA` or additional context.

- [ ] **Step 4: Add closure UI**

Only show closure action in `FINALIZADA`/`NO_INICIADA`; display backend-confirmed summary before submission.

- [ ] **Step 5: Connect agenda detail navigation**

From the existing agenda card/detail action, navigate to operational meeting screen for the selected meeting ID.

- [ ] **Step 6: Run checks**

Run: `./gradlew test assembleDebug`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/uy/edu/flacso/meetassistant/ui
git commit -m "feat: agregar consola de reunión en Android"
```

### Task 10: Verification integrada y documentación

**Files:**

- Modify: backend and Android README/docs only where needed for new endpoints/behavior.

- [ ] **Step 1: Run backend verification**

Run: `npm test && npm run build`
Expected: PASS.

- [ ] **Step 2: Run Android verification**

Run: `./gradlew test assembleDebug`
Expected: PASS.

- [ ] **Step 3: Exercise five state scenarios against a test meeting**

Verify: before schedule → `PROGRAMADA`; schedule reached/no conference → `ESPERANDO_INICIO`; real Meet starts → `EN_CURSO`; Meet ends → `FINALIZADA`; scheduled window ends without Meet → `NO_INICIADA`.

- [ ] **Step 4: Verify failure behavior**

Temporarily make the operational endpoint unavailable after a successful Android fetch and confirm Android retains the last state while marking it stale.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md docs app
git commit -m "docs: documentar consola operativa de reuniones"
```

## Self-review

- Spec coverage: state machine, participants, recording, incidents, closure, polling, stale state and security boundaries are all assigned to explicit tasks.
- Scope remains limited to the first operational-console block; Calendar, Telegram, availability and replacement flows are excluded.
- Shared enum values and DTO names are consistent between backend and Android tasks.
- No implementation task requires Android to contact Google or PostgreSQL directly.

# Etapa 7: Archivos, Grabaciones y Drive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.
> Baseline: `npm test` passing (115 files, 923 tests), `npm run check` clean, `npm run build` clean.

**Goal:** Implementar las 5 capas arquitectónicas para el módulo `src/modules/archivos/` (`domain`, `ports`, `application`, `infrastructure`, `presentation`, `api.ts`, `presentation.ts`), extraer el cliente técnico de Google Drive en `src/integrations/google/drive/`, desacoplar la sincronización de grabaciones/asistencia/transcripciones y la inspección de participantes en vivo en casos de uso puros, y preservar fachadas retrocompatibles en `src/modules/meet/`.

**Architecture:** Monolito modular desacoplado.

- `src/integrations/google/drive/`: Cliente técnico HTTP puro para la API de Google Drive v3 (`https://www.googleapis.com/drive/v3` y `https://www.googleapis.com/upload/drive/v3`), sin reglas de negocio.
- `src/modules/archivos/domain/`: Tipos puros e inmutables (`TipoArtefactoMeet`, `RegistroConferenciaMeet`, `FilaAsistenciaMeet`, `AlcanceGrabaciones`, `EstadoVisualGrabacion`, `GrupoEncuentroConArchivos`, `SyncArtifactsResult`, `LiveParticipantsResult`), funciones puras de resolución de nombres, estados y filtros (`nombreCarpetaReunion`, `nombreArchivoReunion`, `elegirConferenciaMeet`, `asistenciaMeetCompleta`, `crearHtmlAsistencia`, `obtenerAlcanceGrabaciones`, `puedeSincronizarGrabaciones`, `resolverEstadoVisualGrabacion`, `filtrarEncuentrosConArchivos`).
- `src/modules/archivos/ports/`: Contrato de proveedor externo `ArtifactProviderPort` y contrato de repositorio `ArchivosRepositoryPort`.
- `src/modules/archivos/application/`: Casos de uso `sincronizarArtefactos`, `obtenerParticipantesActivos`, `listarArchivosVisibles`, `listarGrabacionesPendientesVisibles`, `listarGrabacionesNoRealizadasVisibles`.
- `src/modules/archivos/infrastructure/`: Adaptador Google `GoogleArtifactsProviderAdapter` implementando `ArtifactProviderPort` coordinando Meet y Drive; adaptador Prisma `PrismaArchivosRepositoryAdapter` implementando `ArchivosRepositoryPort`.
- `src/modules/archivos/api.ts` y `src/bootstrap/archivos.server.ts`: Raíz de composición con `server-only`.
- Fachadas en `src/modules/meet/*`: Preservan retrocompatibilidad para `google-meet-artifacts.adapter.ts`, `grabaciones.adapter.ts`, `grabaciones.domain.ts`, `grabaciones-filtro.domain.ts`, `meet-artifacts.domain.ts`, `sincronizar-artefactos.service.ts` y `live-participants.service.ts`.

**Tech Stack:** Node.js 24, TypeScript, Prisma 6, Vitest, Google Drive API v3, Google Meet REST API v2.

**Spec Reference:** `docs/superpowers/specs/2026-09-19-capas-y-encapsulamiento-design.md` (Secciones 4, 8, 9, 12, 14, 15) y `docs/superpowers/plans/2026-09-19-capas-y-encapsulamiento-plan-rector.md` (Etapa 7).

---

## Invariantes y Restricciones

1. **Pureza de Dominio:** `src/modules/archivos/domain/` contendrá únicamente tipos `readonly` y funciones sincrónicas puras. Cero imports de Prisma, Next.js, React, `google-auth-library` o APIs externas. Cero `new Date()`, cero `Date.now()`, cero `Math.random()`, cero mutación de colecciones (`.push`, `.splice`, etc.).
2. **Desacoplamiento de Aplicación:** `src/modules/archivos/application/` no importará Prisma, Next.js, React ni clientes Google directos; únicamente `domain` y `ports`.
3. **Aislamiento de Clientes Google:**
   - La llamada HTTP a Drive v3 se ubica en `src/integrations/google/drive/`.
   - `src/integrations/google/` no importa módulos de negocio, Prisma ni capas de presentación.
4. **Fachadas Temporales Retrocompatibles:**
   - `src/modules/meet/grabaciones.domain.ts` reexporta del nuevo dominio.
   - `src/modules/meet/grabaciones-filtro.domain.ts` reexporta del nuevo dominio.
   - `src/modules/meet/meet-artifacts.domain.ts` reexporta del nuevo dominio.
   - `src/modules/meet/google-meet-artifacts.adapter.ts` reexporta y provee compatibilidad con la función `crearGoogleMeetArtifactsClient`.
   - `src/modules/meet/grabaciones.adapter.ts` mantiene sus funciones exportadas delegando a la nueva infraestructura / bootstrap.
   - `src/modules/meet/sincronizar-artefactos.service.ts` preserva la firma de `sincronizarArtefactosMeet`.
   - `src/modules/meet/live-participants.service.ts` preserva la firma de `obtenerParticipantesActivosInstancia`.
5. **Verificación Continua Obligatoria:**
   - `npm run check`
   - `npm test`
   - `npm run validate:schema`
   - `npm run build`

---

## Tareas

### Tarea 1: Cliente Técnico Google Drive (`src/integrations/google/drive/`)

- Crear `src/integrations/google/drive/drive-files.client.ts`:
  - `obtenerOCrearCarpetaDrive(auth: JWT, parentId: string, name: string): Promise<string>`.
  - `moverArchivoDrive(auth: JWT, fileId: string, folderId: string, name: string): Promise<MovedDriveFile>`.
  - `subirDocumentoGoogleDrive(auth: JWT, folderId: string, name: string, html: string): Promise<MovedDriveFile>`.
- Actualizar `src/integrations/google/auth/google-auth.client.ts`:
  - Agregar `GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"] as const;`.
  - Agregar `GOOGLE_MEET_ARTIFACTS_SCOPES = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/meetings.space.readonly"] as const;`.
  - Agregar `crearGoogleDriveAuthClient(credentials: GoogleAuthCredentials): JWT`.
  - Agregar `crearGoogleMeetArtifactsAuthClient(credentials: GoogleAuthCredentials): JWT`.
- Crear `src/integrations/google/drive/index.ts`.
- Actualizar `src/integrations/google/index.ts`.
- Crear tests en `test/integrations-google-drive.test.ts`.

### Tarea 2: Capa de Dominio (`src/modules/archivos/domain/`)

- Crear `src/modules/archivos/domain/meet-artifacts.domain.ts`:
  - `TipoArtefactoMeet`, `TIPOS_ARTEFACTO_SINCRONIZABLES`, `DatosCarpetaReunion`, `DatosNombreArtefacto`, `FilaAsistenciaMeet`, `RegistroConferenciaMeet`, `SesionParticipanteMeet`.
  - `etiquetaTipoArtefactoMeet`, `nombreCarpetaReunion`, `nombreArchivoReunion`, `elegirConferenciaMeet`, `asistenciaMeetCompleta`, `crearHtmlAsistencia`.
- Crear `src/modules/archivos/domain/grabaciones.domain.ts`:
  - `RolUsuario`, `AlcanceGrabaciones`, `obtenerAlcanceGrabaciones`, `puedeSincronizarGrabaciones`.
- Crear `src/modules/archivos/domain/grabaciones-filtro.domain.ts`:
  - `TipoFiltroArtefacto`, `EstadoVisualGrabacion`, `GrupoEncuentroConArchivos`, `resolverEstadoVisualGrabacion`, `filtrarEncuentrosConArchivos`.
- Crear `src/modules/archivos/domain/archivos.types.ts`:
  - `EstadoResultadoGrabacion`, `SyncArtifactsResult`, `ParticipanteActivoMeet`, `LiveParticipantsResult`.
- Crear `src/modules/archivos/domain/index.ts`.
- Crear tests en `test/archivos-domain.test.ts` y verificar que pase `test/functional-architecture.test.ts`.

### Tarea 3: Capa de Puertos (`src/modules/archivos/ports/`)

- Crear `src/modules/archivos/ports/artifact-provider.port.ts`:
  - `ArtifactProviderPort`:
    - `buscarConferencia(codigo: string, inicio: Date, fin: Date): Promise<RegistroConferenciaMeet | null>`
    - `obtenerConferencia(conferenceName: string): Promise<RegistroConferenciaMeet>`
    - `obtenerArtefactos(conferenceName: string): Promise<MeetArtifactsScan>`
    - `obtenerDocumentoAsistencia(conferenceName: string): Promise<MeetAttendanceDocument>`
    - `obtenerOCrearCarpeta(parentId: string, name: string): Promise<string>`
    - `moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile>`
    - `subirDocumentoGoogle(folderId: string, name: string, html: string): Promise<MovedDriveFile>`
    - `obtenerParticipantesActivos(codigo: string, inicio: Date, fin: Date): Promise<MeetActiveParticipantsScan>`
- Crear `src/modules/archivos/ports/archivos-repository.port.ts`:
  - `ArchivosRepositoryPort`:
    - Consultas de lecturas para grabaciones y archivos visibles.
    - Consultas y comandos para sincronización de artefactos y participantes en vivo.
- Crear `src/modules/archivos/ports/index.ts`.

### Tarea 4: Capa de Aplicación (`src/modules/archivos/application/`)

- Crear `src/modules/archivos/application/sincronizar-artefactos.use-case.ts`:
  - Lógica de sincronización de grabaciones, transcripciones, notas y asistencia, con cálculo de estados y límites de concurrencia.
- Crear `src/modules/archivos/application/obtener-participantes-activos.use-case.ts`:
  - Lógica de consulta de participantes activos para una instancia de reunión.
- Crear `src/modules/archivos/application/consultar-grabaciones.use-case.ts`:
  - Casos de uso de consulta de archivos visibles, grabaciones pendientes y grabaciones no realizadas.
- Crear `src/modules/archivos/application/index.ts`.
- Crear tests en `test/archivos-application.test.ts`.

### Tarea 5: Capa de Infraestructura (`src/modules/archivos/infrastructure/`)

- Crear `src/modules/archivos/infrastructure/google/google-artifacts-provider.adapter.ts`:
  - Implementación de `ArtifactProviderPort` delegando a Meet REST API y cliente técnico de Drive.
- Crear `src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter.ts`:
  - Implementación de `ArchivosRepositoryPort` con Prisma.
- Crear `src/modules/archivos/infrastructure/index.ts`.
- Crear tests en `test/archivos-infrastructure.test.ts`.

### Tarea 6: Raíz de Composición, API Pública y Fachadas

- Crear `src/modules/archivos/api.ts`.
- Crear `src/modules/archivos/presentation.ts`.
- Crear `src/bootstrap/archivos.server.ts` con `import "server-only"`.
- Crear `test/archivos-bootstrap.test.ts`.
- Conectar fachadas retrocompatibles en `src/modules/meet/*`:
  - `src/modules/meet/grabaciones.domain.ts`
  - `src/modules/meet/grabaciones-filtro.domain.ts`
  - `src/modules/meet/meet-artifacts.domain.ts`
  - `src/modules/meet/google-meet-artifacts.adapter.ts`
  - `src/modules/meet/sincronizar-artefactos.service.ts`
  - `src/modules/meet/grabaciones.adapter.ts`
  - `src/modules/meet/live-participants.service.ts`

### Tarea 7: Verificación Integral

- Ejecutar arnés de arquitectura: `test/architecture-boundaries.test.ts`.
- Ejecutar pureza funcional: `test/functional-architecture.test.ts`.
- Ejecutar suite completa: `npm test`.
- Ejecutar `npm run check`.
- Ejecutar `npm run validate:schema`.
- Ejecutar `npm run build`.

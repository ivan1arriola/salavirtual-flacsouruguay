import type { PrismaClient, TipoArchivoReunion } from "@prisma/client";
import type { crearGoogleMeetArtifactsClient, GoogleArtifact, MovedDriveFile } from "./google-meet-artifacts.adapter";
import type { EstadoGrabacionMeet, RecordingStatusCredentials } from "./google-meet-recording-status.adapter";
import {
  nombreArchivoReunion,
  nombreCarpetaReunion,
  TIPOS_ARTEFACTO_SINCRONIZABLES
} from "./meet-artifacts.domain";

type ArtifactsClient = ReturnType<typeof crearGoogleMeetArtifactsClient>;

export type SyncArtifactsDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearClient: (credentials: Readonly<{
    serviceAccountEmail: string;
    privateKey: string;
    subject: string;
  }>) => ArtifactsClient;
  obtenerEstadoGrabacion?: (
    credentials: RecordingStatusCredentials,
    conferenceName: string
  ) => Promise<EstadoGrabacionMeet>;
}>;

export type SyncArtifactsResult = Readonly<{
  eventoProveedorId: string;
  estado: "SINCRONIZADO" | "SIN_REGISTRO_FINALIZADO" | "ARTEFACTOS_PENDIENTES" | "GRABACION_NO_REALIZADA" | "ERROR";
  archivos: number;
  error?: string;
}>;

export async function sincronizarArtefactosMeet(
  dependencies: SyncArtifactsDependencies,
  eventoProveedorIds: readonly string[]
): Promise<readonly SyncArtifactsResult[]> {
  const configuration = await dependencies.db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true }
  });
  if (!configuration?.serviceAccountEmail || !configuration.privateKeyCifrada || !configuration.driveDestinationId) {
    return eventoProveedorIds.map((eventoProveedorId) => ({
      eventoProveedorId,
      estado: "ERROR",
      archivos: 0,
      error: "Faltan credenciales o carpeta destino de Google Workspace."
    }));
  }

  const privateKey = dependencies.descifrar(configuration.privateKeyCifrada);
  const events = await dependencies.db.eventoProveedor.findMany({
    where: { id: { in: [...eventoProveedorIds] }, proveedor: { tipo: "GOOGLE_MEET" } },
    include: {
      cuentaProveedor: true,
      archivos: { select: { id: true, externalResourceName: true, tipo: true, mimeType: true } },
      instancia: { include: { solicitud: true } }
    }
  });

  return mapConLimite(events, 3, (event) => sincronizarEvento(
    dependencies,
    configuration.driveDestinationId!,
    configuration.serviceAccountEmail!,
    privateKey,
    event
  ));
}

type SyncEvent = Readonly<{
  id: string;
  codigoReunion: string | null;
  conferenceRecordName: string | null;
  cuentaProveedor: Readonly<{ emailOrganizador: string | null }> | null;
  archivos: readonly Readonly<{
    id: string;
    externalResourceName: string;
    tipo: TipoArchivoReunion;
    mimeType: string | null;
  }>[];
  instancia: Readonly<{
    inicioProgramadoAt: Date;
    finProgramadoAt: Date;
    timezone: string;
    requiereGrabacion: boolean;
    solicitud: Readonly<{ titulo: string }>;
  }>;
}>;

async function sincronizarEvento(
  dependencies: SyncArtifactsDependencies,
  destinationId: string,
  serviceAccountEmail: string,
  privateKey: string,
  event: SyncEvent
): Promise<SyncArtifactsResult> {
  const hostEmail = event.cuentaProveedor?.emailOrganizador;
  if (!hostEmail || !event.codigoReunion) {
    return registrarError(dependencies.db, event.id, "La reunión no tiene host o código Meet.");
  }
  try {
    const credentials = { serviceAccountEmail, privateKey, subject: hostEmail };
    const client = dependencies.crearClient(credentials);
    const conference = event.conferenceRecordName
      ? await client.obtenerConferencia(event.conferenceRecordName)
      : await client.buscarConferencia(
          event.codigoReunion,
          event.instancia.inicioProgramadoAt,
          event.instancia.finProgramadoAt
        );
    if (!conference?.endTime) {
      return { eventoProveedorId: event.id, estado: "SIN_REGISTRO_FINALIZADO", archivos: 0 };
    }

    const folderName = nombreCarpetaReunion({
      titulo: event.instancia.solicitud.titulo,
      inicio: event.instancia.inicioProgramadoAt,
      timezone: event.instancia.timezone
    });
    const folderId = await client.obtenerOCrearCarpeta(destinationId, folderName);
    const known = new Set(event.archivos
      .filter((file) => file.tipo !== "LISTA_ASISTENCIA" || file.mimeType === "application/vnd.google-apps.document")
      .map((file) => file.externalResourceName));
    const artifacts = await client.obtenerArtefactos(conference.name);
    const common = {
      titulo: event.instancia.solicitud.titulo,
      inicio: event.instancia.inicioProgramadoAt,
      timezone: event.instancia.timezone,
      codigoReunion: event.codigoReunion
    };
    let synchronized = 0;
    let pending = artifacts.pendientes;
    let grabacionNoRealizada = false;

    for (const [type, items] of [
      [TIPOS_ARTEFACTO_SINCRONIZABLES[0], artifacts.recordings],
      [TIPOS_ARTEFACTO_SINCRONIZABLES[1], artifacts.transcripts],
      [TIPOS_ARTEFACTO_SINCRONIZABLES[3], artifacts.notes]
    ] as const) {
      for (const [index, artifact] of items.entries()) {
        if (known.has(artifact.resourceName)) continue;
        const name = nombreArchivoReunion({ ...common, tipo: type, indice: index + 1, extension: artifact.extension });
        const moved = await client.moverArchivo(artifact.driveFileId, folderId, name);
        await registrarArchivo(dependencies.db, event.id, type, artifact, moved);
        known.add(artifact.resourceName);
        synchronized += 1;
      }
    }

    const tieneGrabacion = event.archivos.some(({ tipo }) => tipo === "GRABACION") || artifacts.recordings.length > 0;
    if (event.instancia.requiereGrabacion && !tieneGrabacion) {
      const estadoGrabacion = dependencies.obtenerEstadoGrabacion
        ? await dependencies.obtenerEstadoGrabacion(credentials, conference.name)
        : "PROCESANDO";
      if (estadoGrabacion === "AUSENTE") {
        grabacionNoRealizada = true;
      } else {
        pending += 1;
      }
    }

    const attendanceResource = `${conference.name}/attendance`;
    if (!known.has(attendanceResource)) {
      const attendance = await client.obtenerDocumentoAsistencia(conference.name);
      if (attendance.completa) {
        const name = nombreArchivoReunion({ ...common, tipo: TIPOS_ARTEFACTO_SINCRONIZABLES[2], indice: 1 });
        const uploaded = await client.subirDocumentoGoogle(folderId, name, attendance.html);
        await registrarArchivo(
          dependencies.db,
          event.id,
          TIPOS_ARTEFACTO_SINCRONIZABLES[2],
          { resourceName: attendanceResource, driveFileId: uploaded.id },
          uploaded
        );
        synchronized += 1;
      } else if (conferenciaTerminadaHaceMasDe(conference.endTime, 24)) {
        throw new Error(
          attendance.participantes === 0
            ? "Google Meet no devolvió participantes para generar la asistencia después de 24 horas."
            : "Google Meet todavía devuelve sesiones de asistencia incompletas después de 24 horas."
        );
      } else {
        pending += 1;
      }
    }

    if (pending > 0) {
      await dependencies.db.eventoProveedor.update({
        where: { id: event.id },
        data: {
          conferenceRecordName: conference.name,
          driveFolderId: folderId,
          archivosSincronizadosAt: null,
          errorArchivos: null
        }
      });
      return {
        eventoProveedorId: event.id,
        estado: "ARTEFACTOS_PENDIENTES",
        archivos: synchronized
      };
    }

    await dependencies.db.eventoProveedor.update({
      where: { id: event.id },
      data: {
        conferenceRecordName: conference.name,
        driveFolderId: folderId,
        archivosSincronizadosAt: new Date(),
        errorArchivos: null
      }
    });
    return {
      eventoProveedorId: event.id,
      estado: grabacionNoRealizada ? "GRABACION_NO_REALIZADA" : "SINCRONIZADO",
      archivos: synchronized
    };
  } catch (error) {
    return registrarError(
      dependencies.db,
      event.id,
      error instanceof Error ? error.message : "Error desconocido al sincronizar archivos."
    );
  }
}

async function registrarArchivo(
  db: PrismaClient,
  eventoProveedorId: string,
  tipo: TipoArchivoReunion,
  artifact: GoogleArtifact,
  drive: MovedDriveFile
): Promise<void> {
  await db.archivoReunion.upsert({
    where: {
      eventoProveedorId_externalResourceName: {
        eventoProveedorId,
        externalResourceName: artifact.resourceName
      }
    },
    create: {
      eventoProveedorId,
      tipo,
      externalResourceName: artifact.resourceName,
      driveFileId: drive.id,
      nombre: drive.name,
      mimeType: drive.mimeType,
      tamanoBytes: drive.size ? BigInt(drive.size) : null,
      webViewUrl: drive.webViewLink,
      capturadoAt: artifact.startTime ? new Date(artifact.startTime) : new Date()
    },
    update: {
      tipo,
      driveFileId: drive.id,
      nombre: drive.name,
      mimeType: drive.mimeType,
      tamanoBytes: drive.size ? BigInt(drive.size) : null,
      webViewUrl: drive.webViewLink,
      capturadoAt: artifact.startTime ? new Date(artifact.startTime) : new Date()
    }
  });
}

async function registrarError(
  db: PrismaClient,
  eventoProveedorId: string,
  error: string
): Promise<SyncArtifactsResult> {
  await db.eventoProveedor.update({ where: { id: eventoProveedorId }, data: { errorArchivos: error } });
  return { eventoProveedorId, estado: "ERROR", archivos: 0, error };
}

function conferenciaTerminadaHaceMasDe(endTime: string, hours: number): boolean {
  return Date.now() - Date.parse(endTime) > hours * 60 * 60 * 1000;
}

async function mapConLimite<T, R>(
  items: readonly T[],
  limite: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

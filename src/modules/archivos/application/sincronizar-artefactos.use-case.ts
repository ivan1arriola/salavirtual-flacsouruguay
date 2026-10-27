import {
  nombreArchivoReunion,
  nombreCarpetaReunion,
  TIPOS_ARTEFACTO_SINCRONIZABLES,
  type EstadoResultadoGrabacion,
  type SyncArtifactsResult
} from "../domain";
import type {
  ArchivosRepositoryPort,
  ArtifactProviderFactory,
  EventoParaSincronizarArchivos
} from "../ports";

export type SincronizarArtefactosInput = Readonly<{
  eventoProveedorIds: readonly string[];
  regenerarAsistencia?: boolean;
  asistenciaDriveFileIds?: Readonly<Record<string, string>>;
}>;

export async function sincronizarArtefactosUseCase(
  repositorio: ArchivosRepositoryPort,
  providerFactory: ArtifactProviderFactory,
  descifrar: (cifrado: string) => string,
  input: SincronizarArtefactosInput
): Promise<readonly SyncArtifactsResult[]> {
  const configuracion = await repositorio.obtenerConfiguracionWorkspacePrincipal();
  if (
    !configuracion?.activa ||
    !configuracion.serviceAccountEmail ||
    !configuracion.privateKeyCifrada ||
    !configuracion.driveDestinationId
  ) {
    return input.eventoProveedorIds.map((eventoProveedorId) => ({
      eventoProveedorId,
      estado: "ERROR",
      archivos: 0,
      error: "Faltan credenciales o carpeta destino de Google Workspace."
    }));
  }

  const privateKey = descifrar(configuracion.privateKeyCifrada);
  const eventos = await repositorio.obtenerEventosParaSincronizar(input.eventoProveedorIds);

  // All artifact uploads use the same Workspace service-account identity.
  // Serialize writes within one process; the DB lease protects other workers.
  return mapConLimite(eventos, 1, (evento) =>
    sincronizarEventoIndividual(
      repositorio,
      providerFactory,
      configuracion.driveDestinationId!,
      configuracion.serviceAccountEmail!,
      privateKey,
      configuracion.serviceAccountSubject ?? null,
      evento,
      input.regenerarAsistencia ?? false,
      input.asistenciaDriveFileIds?.[evento.id]
    )
  );
}

async function sincronizarEventoIndividual(
  repositorio: ArchivosRepositoryPort,
  providerFactory: ArtifactProviderFactory,
  destinationId: string,
  serviceAccountEmail: string,
  privateKey: string,
  adminEmailSubject: string | null,
  evento: EventoParaSincronizarArchivos,
  regenerarAsistencia: boolean,
  asistenciaDriveFileId?: string
): Promise<SyncArtifactsResult> {
  const hostEmail = evento.emailOrganizador;
  if (!hostEmail || !evento.codigoReunion) {
    const errorMsg = "La reunión no tiene host o código Meet.";
    await repositorio.registrarErrorSincronizacion(evento.id, errorMsg);
    return {
      eventoProveedorId: evento.id,
      estado: "ERROR",
      archivos: 0,
      error: errorMsg
    };
  }

  try {
    const provider = providerFactory({
      serviceAccountEmail,
      privateKey,
      subject: hostEmail,
      adminEmail: adminEmailSubject
    });

    const conference = evento.conferenceRecordName
      ? await provider.obtenerConferencia(evento.conferenceRecordName)
      : await provider.buscarConferencia(
          evento.codigoReunion,
          evento.inicioProgramadoAt,
          evento.finProgramadoAt
        );

    if (!conference) {
      return {
        eventoProveedorId: evento.id,
        estado: "SIN_REGISTRO_FINALIZADO",
        archivos: 0,
        grabacion: evento.requiereGrabacion ? "PENDIENTE" : "NO_REQUERIDA"
      };
    }

    if (!conference.endTime) {
      const attendance = await provider.obtenerDocumentoAsistencia(conference.name, evento.codigoReunion);
      if (attendance.sesiones > 0 && attendance.planilla && provider.subirPlanillaAsistencia) {
        const folderName = nombreCarpetaReunion({
          titulo: evento.tituloSolicitud,
          inicio: evento.inicioProgramadoAt,
          timezone: evento.timezone
        });
        const folderId = evento.driveFolderId ?? await provider.obtenerOCrearCarpeta(destinationId, folderName);
        const name = nombreArchivoReunion({
          titulo: evento.tituloSolicitud,
          inicio: evento.inicioProgramadoAt,
          timezone: evento.timezone,
          codigoReunion: evento.codigoReunion,
          tipo: TIPOS_ARTEFACTO_SINCRONIZABLES[2],
          indice: 1
        });
        const uploaded = await provider.subirPlanillaAsistencia(
          folderId, name, attendance.planilla,
          evento.inicioProgramadoAt, evento.finProgramadoAt, hostEmail, evento.cohostEmails ?? [],
          evento.asistenciaDriveFileId ?? undefined
        );
        await repositorio.registrarArchivoSincronizado(
          evento.id,
          TIPOS_ARTEFACTO_SINCRONIZABLES[2],
          { resourceName: `${conference.name}/attendance`, driveFileId: uploaded.id },
          uploaded
        );
        await repositorio.actualizarEstadoSincronizacion(evento.id, {
          conferenceRecordName: conference.name,
          driveFolderId: folderId,
          archivosSincronizadosAt: null,
          errorArchivos: null
        });
        return {
          eventoProveedorId: evento.id,
          estado: "ARTEFACTOS_PENDIENTES",
          archivos: 1,
          grabacion: evento.requiereGrabacion ? "PENDIENTE" : "NO_REQUERIDA"
        };
      }

      return {
        eventoProveedorId: evento.id,
        estado: "SIN_REGISTRO_FINALIZADO",
        archivos: 0,
        grabacion: evento.requiereGrabacion ? "PENDIENTE" : "NO_REQUERIDA"
      };
    }

    const folderName = nombreCarpetaReunion({
      titulo: evento.tituloSolicitud,
      inicio: evento.inicioProgramadoAt,
      timezone: evento.timezone
    });

    const folderId = evento.driveFolderId ?? await provider.obtenerOCrearCarpeta(destinationId, folderName);

    const known = new Set(
      evento.archivos
        .filter(
          (file) =>
            file.tipo !== "LISTA_ASISTENCIA" ||
            file.mimeType === "application/vnd.google-apps.spreadsheet"
        )
        .map((file) => file.externalResourceName)
    );

    const artifacts = await provider.obtenerArtefactos(conference.name);
    const common = {
      titulo: evento.tituloSolicitud,
      inicio: evento.inicioProgramadoAt,
      timezone: evento.timezone,
      codigoReunion: evento.codigoReunion
    };

    let synchronized = 0;
    let pending = artifacts.pendientes;

    for (const [type, items] of [
      [TIPOS_ARTEFACTO_SINCRONIZABLES[0], artifacts.recordings],
      [TIPOS_ARTEFACTO_SINCRONIZABLES[1], artifacts.transcripts],
      [TIPOS_ARTEFACTO_SINCRONIZABLES[3], artifacts.notes]
    ] as const) {
      const sortedItems = [...items].sort((a, b) => {
        const timeA = a.startTime ? Date.parse(a.startTime) : 0;
        const timeB = b.startTime ? Date.parse(b.startTime) : 0;
        return timeA - timeB;
      });
      for (const [index, artifact] of sortedItems.entries()) {
        if (known.has(artifact.resourceName)) continue;
        const name = nombreArchivoReunion({
          ...common,
          tipo: type,
          indice: index + 1,
          extension: artifact.extension
        });
        const moved = await provider.moverArchivo(artifact.driveFileId, folderId, name);
        await repositorio.registrarArchivoSincronizado(evento.id, type, artifact, moved);
        known.add(artifact.resourceName);
        synchronized += 1;
      }
    }

    const existingRecording = evento.archivos.some(({ tipo }) => tipo === "GRABACION");
    const recordingState: EstadoResultadoGrabacion =
      existingRecording || artifacts.estadoGrabacion === "GENERADA"
        ? "DISPONIBLE"
        : artifacts.estadoGrabacion === "PROCESANDO"
          ? "PENDIENTE"
          : evento.requiereGrabacion
            ? "NO_REALIZADA"
            : "NO_REQUERIDA";

    const attendanceResource = `${conference.name}/attendance`;
    if (!known.has(attendanceResource) || regenerarAsistencia) {
      const attendance = await provider.obtenerDocumentoAsistencia(conference.name, evento.codigoReunion);
      const debeGenerarPlanilla = regenerarAsistencia || attendance.completa
        || (attendance.sesiones > 0 && conferenciaTerminadaHaceMasDe(conference.endTime, 24));
      if (debeGenerarPlanilla) {
        const name = nombreArchivoReunion({
          ...common,
          tipo: TIPOS_ARTEFACTO_SINCRONIZABLES[2],
          indice: 1
        });
        if (regenerarAsistencia && (!provider.subirPlanillaAsistencia || !attendance.planilla)) {
          throw new Error("No se pudo reconstruir la planilla desde las APIs de Meet y Workspace.");
        }
        const uploaded = provider.subirPlanillaAsistencia && attendance.planilla
          ? await provider.subirPlanillaAsistencia(
              folderId, name, attendance.planilla,
              evento.inicioProgramadoAt, evento.finProgramadoAt, hostEmail, evento.cohostEmails ?? [],
              regenerarAsistencia ? asistenciaDriveFileId ?? evento.asistenciaDriveFileId ?? undefined : undefined
            )
          : await provider.subirDocumentoGoogle(folderId, name, attendance.html);
        await repositorio.registrarArchivoSincronizado(
          evento.id,
          TIPOS_ARTEFACTO_SINCRONIZABLES[2],
          { resourceName: attendanceResource, driveFileId: uploaded.id },
          uploaded
        );
        synchronized += 1;
      } else {
        pending += 1;
      }
    }

    if (pending > 0 && !conferenciaTerminadaHaceMasDe(conference.endTime, 48)) {
      await repositorio.actualizarEstadoSincronizacion(evento.id, {
        conferenceRecordName: conference.name,
        driveFolderId: folderId,
        archivosSincronizadosAt: null,
        errorArchivos: null
      });
      return {
        eventoProveedorId: evento.id,
        estado: "ARTEFACTOS_PENDIENTES",
        archivos: synchronized,
        grabacion: recordingState
      };
    }

    await repositorio.actualizarEstadoSincronizacion(evento.id, {
      conferenceRecordName: conference.name,
      driveFolderId: folderId,
      archivosSincronizadosAt: new Date(),
      errorArchivos: null
    });

    return {
      eventoProveedorId: evento.id,
      estado: "SINCRONIZADO",
      archivos: synchronized,
      grabacion: recordingState
    };
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Error desconocido al sincronizar archivos.";
    await repositorio.registrarErrorSincronizacion(evento.id, errorMsg);
    return {
      eventoProveedorId: evento.id,
      estado: "ERROR",
      archivos: 0,
      error: errorMsg
    };
  }
}

function conferenciaTerminadaHaceMasDe(
  endTime: string,
  hours: number,
  ahoraMs = Date.now()
): boolean {
  return ahoraMs - Date.parse(endTime) > hours * 60 * 60 * 1000;
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


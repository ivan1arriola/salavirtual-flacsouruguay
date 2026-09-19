import type { GoogleArtifact, MovedDriveFile, RolUsuario, TipoArtefactoMeet } from "../domain";

export type SessionActor = Readonly<{
  id: string;
  rol: RolUsuario;
  email?: string;
}>;

export type ConfiguracionWorkspaceArchivos = Readonly<{
  activa: boolean;
  serviceAccountEmail: string | null;
  privateKeyCifrada: string | null;
  driveDestinationId: string | null;
}>;

export type ArchivoExistente = Readonly<{
  id: string;
  externalResourceName: string;
  tipo: string;
  mimeType: string | null;
}>;

export type EventoParaSincronizarArchivos = Readonly<{
  id: string;
  codigoReunion: string | null;
  conferenceRecordName: string | null;
  emailOrganizador: string | null;
  archivos: readonly ArchivoExistente[];
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
  timezone: string;
  requiereGrabacion: boolean;
  tituloSolicitud: string;
}>;

export type DatosInstanciaParaParticipantes = Readonly<{
  codigoReunion: string | null;
  emailOrganizador: string | null;
  inicioProgramadoAt: Date;
  finProgramadoAt: Date;
}>;

export type EstadoSincronizacionInput = Readonly<{
  conferenceRecordName: string;
  driveFolderId: string;
  archivosSincronizadosAt: Date | null;
  errorArchivos: string | null;
}>;

export type ArchivoMeetVisibleModel = Readonly<{
  id: string;
  tipo: TipoArtefactoMeet;
  driveFileId: string;
  nombre: string;
  webViewUrl: string | null;
  tamanoBytes: bigint | number | null;
  mimeType: string | null;
  capturadoAt: Date | null;
  createdAt: Date;
  eventoProveedor: Readonly<{
    driveFolderId: string | null;
    archivosSincronizadosAt: Date | null;
    instancia: Readonly<{
      id: string;
      inicioProgramadoAt: Date;
      finProgramadoAt: Date;
      requiereGrabacion: boolean;
      solicitud: Readonly<{
        titulo: string;
        docentePrograma: Readonly<{
          programa: Readonly<{ nombre: string }>;
          docente: Readonly<{ usuario: Readonly<{ nombres: string | null; apellidos: string | null }> }>;
        }>;
      }>;
    }>;
  }>;
}>;

export type EventoGrabacionPendienteModel = Readonly<{
  id: string;
  codigoReunion: string | null;
  archivosSincronizadosAt: Date | null;
  errorArchivos: string | null;
  instancia: Readonly<{
    id: string;
    inicioProgramadoAt: Date;
    finProgramadoAt: Date;
    requiereGrabacion: boolean;
    solicitud: Readonly<{
      titulo: string;
      docentePrograma: Readonly<{
        programa: Readonly<{ nombre: string }>;
        docente: Readonly<{ usuario: Readonly<{ nombres: string | null; apellidos: string | null }> }>;
      }>;
    }>;
  }>;
}>;

export type ArchivosRepositoryPort = Readonly<{
  obtenerConfiguracionWorkspacePrincipal(): Promise<ConfiguracionWorkspaceArchivos | null>;
  obtenerEventosParaSincronizar(eventoProveedorIds: readonly string[]): Promise<readonly EventoParaSincronizarArchivos[]>;
  registrarArchivoSincronizado(
    eventoProveedorId: string,
    tipo: TipoArtefactoMeet,
    artifact: GoogleArtifact,
    drive: MovedDriveFile
  ): Promise<void>;
  actualizarEstadoSincronizacion(
    eventoProveedorId: string,
    datos: EstadoSincronizacionInput
  ): Promise<void>;
  registrarErrorSincronizacion(
    eventoProveedorId: string,
    error: string
  ): Promise<void>;
  obtenerDatosInstanciaParaParticipantes(
    instanciaId: string
  ): Promise<DatosInstanciaParaParticipantes | null>;
  listarArchivosVisibles(actor: SessionActor): Promise<readonly ArchivoMeetVisibleModel[]>;
  listarGrabacionesPendientesVisibles(
    actor: SessionActor,
    desde: Date,
    hasta: Date
  ): Promise<readonly EventoGrabacionPendienteModel[]>;
  listarGrabacionesNoRealizadasVisibles(
    actor: SessionActor,
    desde: Date,
    hasta: Date
  ): Promise<readonly EventoGrabacionPendienteModel[]>;
}>;

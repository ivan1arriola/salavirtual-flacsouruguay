import type {
  EstadoGrabacionDetectada,
  GoogleArtifact,
  MovedDriveFile,
  RolUsuario,
  TipoArtefactoMeet,
} from "../domain";

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
  serviceAccountSubject?: string | null;
}>;

export type ArchivoExistente = Readonly<{
  id: string;
  driveFileId: string;
  externalResourceName: string;
  tipo: string;
  mimeType: string | null;
}>;

export type PlanillaAsistenciaCandidata = Readonly<{
  eventoProveedorId: string;
  spreadsheetId: string;
  emailOrganizador: string;
}>;

export type EventoParaSincronizarArchivos = Readonly<{
  id: string;
  driveFolderId?: string | null;
  codigoReunion: string | null;
  conferenceRecordName: string | null;
  emailOrganizador: string | null;
  cohostEmails?: readonly string[];
  archivos: readonly ArchivoExistente[];
  asistenciaDriveFileId?: string | null;
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
  driveFolderId?: string | null;
  archivosSincronizadosAt: Date | null;
  errorArchivos: string | null;
  estadoGrabacionMeet?: EstadoGrabacionDetectada;
  grabacionObservadaAt?: Date;
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
          docente: Readonly<{
            usuario: Readonly<{ nombres: string | null; apellidos: string | null }>;
          }>;
        }>;
      }>;
    }>;
  }>;
}>;

export type GrabacionesDbPage = Readonly<{
  encuentros: readonly Readonly<{
    instanciaId: string;
    solicitudId: string;
    /** Proveedor real del encuentro: la tarjeta ya no asume Google Meet. */
    proveedor: "GOOGLE_MEET" | "ZOOM";
    /** Hay asistencia de Zoom persistida para este encuentro. */
    asistenciaZoom: boolean;
    titulo: string;
    programa: string;
    docente: string;
    fechaInicio: Date;
    finProgramadoAt: Date;
    folderId: string | null;
    requiereGrabacion: boolean;
    archivosSincronizadosAt: Date | null;
    estadoGrabacionMeet: EstadoGrabacionDetectada | null;
    grabacionObservadaAt: Date | null;
    archivos: readonly Readonly<{
      id: string;
      tipo: TipoArtefactoMeet;
      nombre: string;
      /** En Zoom solo hay URL cuando el archivo está conservado (enlace seguro a Drive). */
      webViewUrl: string | null;
      tamanoBytes: bigint | null;
      mimeType: string | null;
      /** Solo archivos de Zoom: etiqueta de categoría (Video, Audio, Chat, …). */
      etiquetaZoom?: string;
      pendienteZoom?: boolean;
      estadoZoomEtiqueta?: string;
      errorCodigo?: string | null;
    }>[];
  }>[];
  pagina: number;
  totalPaginas: number;
  totalEncuentros: number;
  conteos: Readonly<{
    todos: number;
    grabaciones: number;
    asistencias: number;
    notas: number;
    transcripciones: number;
  }>;
}>;
export type ListarGrabacionesDbInput = Readonly<{
  pagina: number;
  busqueda: string;
  filtro: import("../domain").TipoFiltroArtefacto;
}>;

export type ArchivosRepositoryPort = Readonly<{
  obtenerConfiguracionWorkspacePrincipal(): Promise<ConfiguracionWorkspaceArchivos | null>;
  obtenerEventosParaSincronizar(
    eventoProveedorIds: readonly string[],
  ): Promise<readonly EventoParaSincronizarArchivos[]>;
  listarPlanillasAsistenciaCandidatas?(): Promise<readonly PlanillaAsistenciaCandidata[]>;
  registrarArchivoSincronizado(
    eventoProveedorId: string,
    tipo: TipoArtefactoMeet,
    artifact: GoogleArtifact,
    drive: MovedDriveFile,
  ): Promise<void>;
  actualizarEstadoSincronizacion(
    eventoProveedorId: string,
    datos: EstadoSincronizacionInput,
  ): Promise<void>;
  registrarErrorSincronizacion(eventoProveedorId: string, error: string): Promise<void>;
  obtenerDatosInstanciaParaParticipantes(
    instanciaId: string,
  ): Promise<DatosInstanciaParaParticipantes | null>;
  listarArchivosVisibles(actor: SessionActor): Promise<readonly ArchivoMeetVisibleModel[]>;
  listarGrabacionesDb?(
    actor: SessionActor,
    input: ListarGrabacionesDbInput,
  ): Promise<GrabacionesDbPage>;
}>;

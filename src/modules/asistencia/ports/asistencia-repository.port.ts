import type {
  ModalidadAsistencia,
  RegistroAsistenciaPersonal,
  RegistroHistorialAsistenciaPersonal
} from "../domain";

export type AssistantProfile = Readonly<{
  id: string;
  usuarioId: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  cesadoHastaProximoInicioSesion: boolean;
}>;

export type ActualizarPostulacionInput = Readonly<{
  instanciaSalaId: string;
  asistenteTecnicoId: string;
  estado: "ME_INTERESA" | "RETIRADO";
  comentario?: string;
}>;

export type AsignacionRow = Readonly<{
  id: string;
  instanciaSalaId: string;
  asistenteTecnicoId: string;
  estado: string;
  asistenteUsuarioId: string;
  asistenteEmail: string | null;
  googleAccountIds: readonly string[];
}>;

export type MeetingCoverInfo = Readonly<{
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  modalidad: ModalidadAsistencia;
  docenteNombre?: string;
}>;

export type ReportarDuracionInput = Readonly<{
  asignacionId: string;
  usuarioId: string;
  inicioReal: Date;
  finReal: Date;
  comentario?: string;
  incidencia?: Readonly<{
    tipo: string;
    severidad: string;
    descripcion: string;
  }>;
}>;

export type DisponibilidadSemanalInput = Readonly<{
  disponibleGeneral: boolean;
  franjas: readonly Readonly<{
    diaSemana: number;
    horaDesde: string;
    horaHasta: string;
    tipo: "DISPONIBLE" | "NO_DISPONIBLE" | "PREFERENTE";
  }>[];
}>;

export type AsistenciaRepositoryPort = Readonly<{
  obtenerPerfilAsistentePorUsuarioId(usuarioId: string): Promise<AssistantProfile | null>;
  actualizarPostulacion(input: ActualizarPostulacionInput): Promise<void>;
  reservarYAsignarAsistente(
    instanciaSalaId: string,
    asistenteTecnicoId: string,
    adminUsuarioId: string
  ): Promise<AsignacionRow>;
  desvincularAsistente(asignacionId: string, adminUsuarioId: string): Promise<AsignacionRow>;
  reportarDuracion(input: ReportarDuracionInput, ahora?: Date): Promise<void>;
  actualizarDisponibilidad(usuarioId: string, input: DisponibilidadSemanalInput): Promise<void>;
  obtenerAsistenciasPersonales(
    usuarioId: string,
    periodo: "MES_ACTUAL" | "HISTORICO",
    ahora?: Date
  ): Promise<readonly RegistroAsistenciaPersonal[]>;
  obtenerHistorialAsistenteEnRango(
    usuarioId: string,
    desde: Date,
    hasta: Date,
    limite?: number
  ): Promise<readonly RegistroHistorialAsistenciaPersonal[]>;
  obtenerSlugAsistente(usuarioId: string): Promise<string | null>;
  obtenerAsistentesParaNotificacion(instanciaSalaId: string): Promise<Readonly<{
    reunion: MeetingCoverInfo;
    destinatarios: readonly string[];
  }>>;
}>;

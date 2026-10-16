export type RolUsuario = "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO";

export type EstadoResultadoGrabacion =
  | "NO_REQUERIDA"
  | "PENDIENTE"
  | "DISPONIBLE"
  | "NO_REALIZADA";

export type SyncArtifactsResult = Readonly<{
  eventoProveedorId: string;
  estado: "SINCRONIZADO" | "SIN_REGISTRO_FINALIZADO" | "ARTEFACTOS_PENDIENTES" | "ERROR";
  archivos: number;
  grabacion?: EstadoResultadoGrabacion;
  error?: string;
}>;

export type ParticipanteActivoMeet = Readonly<{
  nombre: string;
  email?: string;
  user?: string;
  tipo: "CUENTA_GOOGLE" | "ANONIMO" | "TELEFONO";
}>;

export type LiveParticipantsResult =
  | Readonly<{
      estado: "OK";
      conferenciaExiste: boolean;
      conferenceName?: string;
      participantes: readonly ParticipanteActivoMeet[];
    }>
  | Readonly<{
      estado: "NO_DISPONIBLE";
      motivo: "SIN_MEET" | "SIN_ORGANIZADOR" | "SIN_CREDENCIALES";
      participantes: readonly [];
    }>;

export type GoogleArtifact = Readonly<{
  resourceName: string;
  driveFileId: string;
  startTime?: string;
  extension?: string;
}>;

export type EstadoGrabacionMeet = "AUSENTE" | "PROCESANDO" | "GENERADA";

export type MeetArtifactsScan = Readonly<{
  recordings: readonly GoogleArtifact[];
  transcripts: readonly GoogleArtifact[];
  notes: readonly GoogleArtifact[];
  estadoGrabacion: EstadoGrabacionMeet;
  pendientes: number;
}>;

export type ParametroAuditoriaMeet = Readonly<{
  name: string;
  value?: string;
  intValue?: string;
  boolValue?: boolean;
}>;

export type EventoAuditoriaMeet = Readonly<{
  conferenceId: string;
  endpointId: string;
  meetingCode: string;
  identifier: string;
  identifierType: string;
  displayName: string;
  timestamp: string;
  durationSeconds: number;
  parameters: readonly ParametroAuditoriaMeet[];
}>;

export type CorreoAuditadoMeet = Readonly<{
  correo: string;
  externo: boolean | null;
  conferenciaId: string;
  nombre?: string;
  salida?: string;
  conexiones?: readonly {
    inicio: string;
    fin: string;
    duracionSegundos: number;
    nombre: string;
    identificador: string;
    endpointId?: string;
    meetingCode?: string;
    identifierType?: string;
    timestamp?: string;
    parameters?: readonly ParametroAuditoriaMeet[];
  }[];
}>;

export type MeetAttendanceDocument = Readonly<{
  html: string;
  planilla?: {
    sesionesMeet: readonly { nombre: string; tipo: string; inicio: string; fin: string }[];
    correosAuditados: readonly CorreoAuditadoMeet[];
    eventosAuditoria: readonly EventoAuditoriaMeet[];
  };
  completa: boolean;
  participantes: number;
  sesiones: number;
}>;

export type MeetActiveParticipantsScan = Readonly<{
  conferenciaExiste: boolean;
  conferenceName?: string;
  participantesActivos: readonly ParticipanteActivoMeet[];
}>;

export type MovedDriveFile = Readonly<{
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
}>;


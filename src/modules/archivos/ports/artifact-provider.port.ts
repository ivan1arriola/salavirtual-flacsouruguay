import type {
  GoogleArtifact,
  MeetActiveParticipantsScan,
  MeetArtifactsScan,
  MeetAttendanceDocument,
  MovedDriveFile,
  RegistroConferenciaMeet
} from "../domain";

export type ArtifactProviderCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
  adminEmail?: string | null;
}>;

export type MeetArtifactCredentials = ArtifactProviderCredentials;

export type ArtifactProviderPort = Readonly<{
  buscarConferencia(codigo: string, inicio: Date, fin: Date): Promise<RegistroConferenciaMeet | null>;
  obtenerConferencia(conferenceName: string): Promise<RegistroConferenciaMeet>;
  obtenerArtefactos(conferenceName: string): Promise<MeetArtifactsScan>;
  obtenerDocumentoAsistencia(conferenceName: string, meetingCode?: string): Promise<MeetAttendanceDocument>;
  planillaAsistenciaGoogleVacia?(spreadsheetId: string): Promise<boolean>;
  obtenerOCrearCarpeta(parentId: string, name: string): Promise<string>;
  moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile>;
  subirDocumentoGoogle(folderId: string, name: string, html: string): Promise<MovedDriveFile>;
  subirPlanillaAsistencia?(folderId: string, name: string, data: NonNullable<MeetAttendanceDocument['planilla']>, inicio: Date, fin: Date, organizador: string, cohosts?: readonly string[], spreadsheetId?: string): Promise<MovedDriveFile>;
  obtenerParticipantesActivos(
    codigo: string,
    inicio: Date,
    fin: Date,
    conferenceRecord?: RegistroConferenciaMeet | null
  ): Promise<MeetActiveParticipantsScan>;
}>;

export type ArtifactProviderFactory = (credentials: ArtifactProviderCredentials) => ArtifactProviderPort;

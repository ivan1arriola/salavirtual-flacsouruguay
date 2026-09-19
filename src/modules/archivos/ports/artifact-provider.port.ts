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
}>;

export type MeetArtifactCredentials = ArtifactProviderCredentials;

export type ArtifactProviderPort = Readonly<{
  buscarConferencia(codigo: string, inicio: Date, fin: Date): Promise<RegistroConferenciaMeet | null>;
  obtenerConferencia(conferenceName: string): Promise<RegistroConferenciaMeet>;
  obtenerArtefactos(conferenceName: string): Promise<MeetArtifactsScan>;
  obtenerDocumentoAsistencia(conferenceName: string): Promise<MeetAttendanceDocument>;
  obtenerOCrearCarpeta(parentId: string, name: string): Promise<string>;
  moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile>;
  subirDocumentoGoogle(folderId: string, name: string, html: string): Promise<MovedDriveFile>;
  obtenerParticipantesActivos(codigo: string, inicio: Date, fin: Date): Promise<MeetActiveParticipantsScan>;
}>;

export type ArtifactProviderFactory = (credentials: ArtifactProviderCredentials) => ArtifactProviderPort;

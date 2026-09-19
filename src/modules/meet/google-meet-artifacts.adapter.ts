import {
  crearGoogleArtifactsProviderAdapter,
  type ArtifactProviderCredentials,
  type EstadoGrabacionMeet,
  type GoogleArtifact,
  type MeetActiveParticipantsScan,
  type MeetArtifactsScan,
  type MeetAttendanceDocument,
  type MovedDriveFile,
  type ParticipanteActivoMeet,
  type RegistroConferenciaMeet
} from "@/src/modules/archivos/api";

export type MeetArtifactCredentials = ArtifactProviderCredentials;
export type ConferenceRecord = RegistroConferenciaMeet;
export type {
  GoogleArtifact,
  MovedDriveFile,
  EstadoGrabacionMeet,
  MeetArtifactsScan,
  MeetAttendanceDocument,
  ParticipanteActivoMeet,
  MeetActiveParticipantsScan
};

export function crearGoogleMeetArtifactsClient(credentials: MeetArtifactCredentials) {
  return crearGoogleArtifactsProviderAdapter(credentials);
}

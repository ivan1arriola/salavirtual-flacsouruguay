/** Tipos canónicos para datos históricos importados de Zoom. */
export type ZoomHistoricalMeeting = Readonly<{
  legacyId: string;
  topic: string;
  startTime: string;
  durationMinutes?: number;
  joinUrl?: string;
  recordingFiles?: readonly ZoomHistoricalRecording[];
}>;

export type ZoomHistoricalRecording = Readonly<{
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
}>;

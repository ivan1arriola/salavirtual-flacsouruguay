export type ZoomHistoricalMeeting = {
  legacyId: string;
  topic: string;
  startTime: string;
  durationMinutes?: number;
  joinUrl?: string;
  recordingFiles?: ZoomHistoricalRecording[];
};

export type ZoomHistoricalRecording = {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
};

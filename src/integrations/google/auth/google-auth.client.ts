import { JWT } from "google-auth-library";

export type GoogleAuthCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject?: string;
}>;

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_MEET_SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.settings",
  "https://www.googleapis.com/auth/meetings.space.readonly",
  "https://www.googleapis.com/auth/meetings.space.created",
] as const;

export const GOOGLE_HTTP_TIMEOUT_MS = 60_000;

export function crearGoogleAuthJwt(
  credentials: GoogleAuthCredentials,
  scopes: readonly string[]
): JWT {
  return new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [...scopes],
    subject: credentials.subject,
  });
}

export function crearGoogleCalendarAuthClient(
  credentials: GoogleAuthCredentials
): JWT {
  return crearGoogleAuthJwt(credentials, GOOGLE_CALENDAR_SCOPES);
}

export function crearGoogleMeetAuthClient(
  credentials: GoogleAuthCredentials
): JWT {
  return crearGoogleAuthJwt(credentials, GOOGLE_MEET_SCOPES);
}

export const GOOGLE_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
] as const;

export function crearGoogleGmailAuthClient(
  credentials: GoogleAuthCredentials
): JWT {
  return crearGoogleAuthJwt(credentials, GOOGLE_GMAIL_SCOPES);
}


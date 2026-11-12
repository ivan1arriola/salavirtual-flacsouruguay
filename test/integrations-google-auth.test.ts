import { describe, expect, it } from "vitest";
import {
  crearGoogleAuthJwt,
  crearGoogleCalendarAuthClient,
  crearGoogleMeetAuthClient,
  GOOGLE_CALENDAR_SCOPES,
  GOOGLE_MEET_SCOPES,
  GOOGLE_HTTP_TIMEOUT_MS,
  type GoogleAuthCredentials
} from "../src/integrations/google/auth";

describe("integrations/google/auth", () => {
  const credentials: GoogleAuthCredentials = {
    serviceAccountEmail: "service-test@flacso.iam.gserviceaccount.com",
    privateKey:
      "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----\n",
    subject: "sala01@flacso.edu.uy"
  };

  it("crearGoogleAuthJwt instancia JWT con las credenciales y scopes dados", () => {
    const jwt = crearGoogleAuthJwt(credentials, ["https://example.com/scope"]);
    expect(jwt.email).toBe(credentials.serviceAccountEmail);
    expect(jwt.subject).toBe(credentials.subject);
    expect(jwt.scopes).toEqual(["https://example.com/scope"]);
  });

  it("crearGoogleCalendarAuthClient usa los scopes correctos de Calendar", () => {
    const jwt = crearGoogleCalendarAuthClient(credentials);
    expect(jwt.email).toBe(credentials.serviceAccountEmail);
    expect(jwt.subject).toBe(credentials.subject);
    expect(jwt.scopes).toEqual([...GOOGLE_CALENDAR_SCOPES]);
  });

  it("crearGoogleMeetAuthClient usa los scopes de settings, read y created de Meet", () => {
    const jwt = crearGoogleMeetAuthClient(credentials);
    expect(jwt.email).toBe(credentials.serviceAccountEmail);
    expect(jwt.subject).toBe(credentials.subject);
    expect(jwt.scopes).toEqual([...GOOGLE_MEET_SCOPES]);
  });

  it("define el timeout HTTP por defecto en 60 segundos", () => {
    expect(GOOGLE_HTTP_TIMEOUT_MS).toBe(60_000);
  });
});

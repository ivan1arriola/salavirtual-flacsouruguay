import type { MeetProvisionRequest, MeetProvisionResult } from "./provider";

export function crearCalendarEvent(request: MeetProvisionRequest) {
  const attendeeEmails = normalizeEmails([
    ...(request.cohostEmails ?? []),
    ...(request.guestEmails ?? []),
  ]);
  return {
    id: request.calendarEventId,
    summary: request.titulo,
    description: request.descripcion,
    start: {
      dateTime: request.inicio.toISOString(),
      timeZone: request.timezone
    },
    end: {
      dateTime: request.fin.toISOString(),
      timeZone: request.timezone
    },
    ...(attendeeEmails.length
      ? { attendees: attendeeEmails.map((email) => ({ email })) }
      : {}),
    ...(request.conferenceData ? { conferenceData: request.conferenceData } : {})
  } as const;
}

export function crearConferenceDataMeet(codigoReunion: string, joinUrl: string) {
  return {
    conferenceId: codigoReunion,
    conferenceSolution: {
      key: { type: "hangoutsMeet" },
      name: "Google Meet"
    },
    entryPoints: [{
      entryPointType: "video",
      uri: joinUrl,
      label: joinUrl.replace(/^https?:\/\//, ""),
      meetingCode: codigoReunion
    }]
  } as const;
}

export function extraerConferenceData(
  payload: unknown
): Readonly<Record<string, unknown>> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const conferenceData = (payload as { conferenceData?: unknown }).conferenceData;
  if (!conferenceData || typeof conferenceData !== "object" || Array.isArray(conferenceData)) {
    return undefined;
  }
  return conferenceData as Readonly<Record<string, unknown>>;
}

export type CalendarEvent = Readonly<{
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: Readonly<{ dateTime?: string | null; timeZone?: string | null }> | null;
  end?: Readonly<{ dateTime?: string | null; timeZone?: string | null }> | null;
  hangoutLink?: string | null;
  attendees?: readonly Readonly<{ email?: string | null }>[];
  conferenceData?: Readonly<{
    conferenceId?: string | null;
    entryPoints?: readonly Readonly<{
      entryPointType?: string | null;
      meetingCode?: string | null;
      uri?: string | null;
    }>[];
  }> | null;
}>;

export function extraerMeetProvisionado(
  event: CalendarEvent
): MeetProvisionResult | null {
  const codigoReunion =
    event.conferenceData?.conferenceId ??
    event.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video"
    )?.meetingCode;
  if (!event.id || !event.hangoutLink || !codigoReunion) return null;

  return {
    externalEventId: event.id,
    codigoReunion,
    joinUrl: event.hangoutLink,
    payload: event
  };
}

export function eventoCalendarCoincideConSolicitud(
  payload: unknown,
  request: Pick<MeetProvisionRequest, "titulo" | "descripcion" | "inicio" | "fin" | "timezone">,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  const event = payload as CalendarEvent;
  const start = event.start?.dateTime ? Date.parse(event.start.dateTime) : Number.NaN;
  const end = event.end?.dateTime ? Date.parse(event.end.dateTime) : Number.NaN;
  return event.summary === request.titulo &&
    (event.description ?? "") === (request.descripcion ?? "") &&
    start === request.inicio.getTime() &&
    end === request.fin.getTime() &&
    event.start?.timeZone === request.timezone &&
    event.end?.timeZone === request.timezone;
}

function normalizeEmails(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

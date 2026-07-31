import type { MeetProvisionRequest, MeetProvisionResult } from "./provider";

export function crearCalendarEvent(
  request: MeetProvisionRequest,
  requestId: string
) {
  return {
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
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    }
  } as const;
}

export type CalendarEvent = Readonly<{
  id?: string | null;
  hangoutLink?: string | null;
  conferenceData?: Readonly<{
    conferenceId?: string | null;
    entryPoints?: readonly Readonly<{
      entryPointType?: string | null;
      meetingCode?: string | null;
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

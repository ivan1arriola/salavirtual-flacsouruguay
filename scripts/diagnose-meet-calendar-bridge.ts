import { randomUUID } from "node:crypto";
import { JWT } from "google-auth-library";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MEET_CREATED_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";
const MEET_READ_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      ?.trim() || undefined
  );
}

function requiredEnv(name: "GOOGLE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_PRIVATE_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} es obligatorio para este diagnóstico.`);
  }
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function errorDetails(error: unknown): unknown {
  if (!error || typeof error !== "object") {
    return String(error);
  }
  const candidate = error as {
    message?: unknown;
    code?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  return {
    message: typeof candidate.message === "string" ? candidate.message : String(error),
    code: candidate.code ?? null,
    status: candidate.response?.status ?? null,
    response: candidate.response?.data ?? null
  };
}

async function main(): Promise<void> {
  const serviceAccountEmail = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = normalizePrivateKey(requiredEnv("GOOGLE_PRIVATE_KEY"));
  const subject = process.env.GOOGLE_SERVICE_ACCOUNT_SUBJECT?.trim() || "sala01@flacso.edu.uy";
  const cohost = argValue("cohost") || "coordinacion.edutic@flacso.edu.uy";

  if (subject.toLowerCase() === cohost.toLowerCase()) {
    throw new Error("El cohost de prueba debe ser distinto del organizador.");
  }

  const meetAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    subject,
    scopes: [MEET_CREATED_SCOPE, MEET_SETTINGS_SCOPE, MEET_READ_SCOPE]
  });
  const calendarAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    subject,
    scopes: [CALENDAR_SCOPE]
  });

  const createdSpace = await meetAuth.request<{
    name?: string;
    meetingCode?: string;
    meetingUri?: string;
  }>({
    url: `${MEET_API}/spaces`,
    method: "POST",
    timeout: 30_000,
    data: {
      config: {
        moderation: "ON",
        accessType: "TRUSTED"
      }
    }
  });

  const spaceName = createdSpace.data.name;
  const meetingCode = createdSpace.data.meetingCode;
  const meetingUri = createdSpace.data.meetingUri;
  if (!spaceName || !meetingCode || !meetingUri) {
    throw new Error("Meet no devolvió name, meetingCode y meetingUri para el espacio de prueba.");
  }

  await meetAuth.request({
    url: `${MEET_API}/${spaceName}/members`,
    method: "POST",
    timeout: 30_000,
    data: { email: cohost, role: "COHOST" }
  });

  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  let calendarEventId: string | undefined;

  try {
    const inserted = await calendarAuth.request<{
      id?: string;
      htmlLink?: string;
      hangoutLink?: string;
      conferenceData?: {
        conferenceId?: string;
        conferenceSolution?: { key?: { type?: string }; name?: string };
        entryPoints?: Array<{ entryPointType?: string; uri?: string; meetingCode?: string }>;
      };
    }>({
      url: `${CALENDAR_API}/calendars/${encodeURIComponent(subject)}/events?conferenceDataVersion=1&sendUpdates=none`,
      method: "POST",
      timeout: 30_000,
      data: {
        summary: `[DIAGNÓSTICO] Puente Meet API → Calendar ${randomUUID().slice(0, 8)}`,
        description:
          "Evento temporal creado por Sala Virtual para comprobar si Calendar puede adjuntar un espacio creado previamente por Meet API. Puede eliminarse.",
        start: { dateTime: start.toISOString(), timeZone: "America/Montevideo" },
        end: { dateTime: end.toISOString(), timeZone: "America/Montevideo" },
        conferenceData: {
          conferenceId: meetingCode,
          conferenceSolution: {
            key: { type: "hangoutsMeet" },
            name: "Google Meet"
          },
          entryPoints: [
            {
              entryPointType: "video",
              uri: meetingUri,
              label: meetingUri.replace(/^https?:\/\//, ""),
              meetingCode
            }
          ]
        }
      }
    });

    calendarEventId = inserted.data.id;
    const attachedUri = inserted.data.conferenceData?.entryPoints?.find(
      ({ entryPointType }) => entryPointType === "video"
    )?.uri;
    const bridgeOk = attachedUri === meetingUri || inserted.data.hangoutLink === meetingUri;

    console.log(
      JSON.stringify(
        {
          serviceAccountEmail,
          delegatedSubject: subject,
          testCohost: cohost,
          meetSpaceCreated: true,
          spaceName,
          meetingCode,
          meetingUri,
          cohostCreated: true,
          calendarEventCreated: Boolean(calendarEventId),
          calendarEventId: calendarEventId ?? null,
          calendarHtmlLink: inserted.data.htmlLink ?? null,
          calendarHangoutLink: inserted.data.hangoutLink ?? null,
          calendarConferenceId: inserted.data.conferenceData?.conferenceId ?? null,
          calendarConferenceType: inserted.data.conferenceData?.conferenceSolution?.key?.type ?? null,
          calendarVideoUri: attachedUri ?? null,
          bridgeOk
        },
        null,
        2
      )
    );

    if (!bridgeOk) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          meetSpaceCreated: true,
          meetingCode,
          meetingUri,
          cohostCreated: true,
          calendarBridgeCreated: false,
          error: errorDetails(error)
        },
        null,
        2
      )
    );
    process.exitCode = 2;
  } finally {
    if (calendarEventId) {
      try {
        await calendarAuth.request({
          url: `${CALENDAR_API}/calendars/${encodeURIComponent(subject)}/events/${encodeURIComponent(calendarEventId)}?sendUpdates=none`,
          method: "DELETE",
          timeout: 30_000
        });
        console.log(JSON.stringify({ temporaryCalendarEventDeleted: true, calendarEventId }, null, 2));
      } catch (error) {
        console.error(
          JSON.stringify(
            {
              temporaryCalendarEventDeleted: false,
              calendarEventId,
              deleteError: errorDetails(error)
            },
            null,
            2
          )
        );
        process.exitCode = 3;
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import "dotenv/config";
import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";
import { normalizeCohostEmails } from "../src/modules/meet/cohosts.domain";
import { configurarGoogleMeetExistente } from "../src/modules/meet/google-calendar.adapter";

const applyChanges = process.argv.includes("--apply");
const MEET_API = "https://meet.googleapis.com/v2";
const MEET_SCOPES = [
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.settings",
  "https://www.googleapis.com/auth/meetings.space.readonly",
] as const;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)?.trim() || undefined;
}

function requiredEnv(name: "GOOGLE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_PRIVATE_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para esta migración temporal.`);
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

async function main(): Promise<void> {
  const serviceAccountEmail = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = normalizePrivateKey(requiredEnv("GOOGLE_PRIVATE_KEY"));
  const meetingFilter = argValue("meeting");
  const now = new Date();

  const meetings = await db.instanciaSala.findMany({
    where: {
      ...(meetingFilter ? { id: meetingFilter } : { inicioProgramadoAt: { gte: now } }),
      estado: { in: ["PROGRAMADA", "EN_CURSO"] },
      eventosProveedor: { some: { proveedor: { tipo: "GOOGLE_MEET" } } },
    },
    orderBy: { inicioProgramadoAt: "asc" },
    select: {
      id: true,
      inicioProgramadoAt: true,
      solicitud: {
        select: {
          titulo: true,
          creadaPor: {
            select: {
              emailPrincipal: true,
              cuentasGoogle: { select: { email: true } },
            },
          },
        },
      },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: {
            select: {
              usuario: {
                select: {
                  emailPrincipal: true,
                  cuentasGoogle: { select: { email: true } },
                },
              },
            },
          },
        },
      },
      cohosts: {
        select: { cuentaGoogle: { select: { email: true } } },
      },
      cohostEmails: { select: { email: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: {
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
        },
        take: 1,
      },
    },
  });

  if (meetingFilter && meetings.length === 0) {
    throw new Error(`No se encontró una reunión activa con Google Meet para --meeting=${meetingFilter}.`);
  }

  const plan = meetings.flatMap((meeting) => {
    const event = meeting.eventosProveedor[0];
    const organizer = event?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
    const code = event?.codigoReunion?.trim();
    if (!organizer || !code) return [];

    const requester = meeting.solicitud.creadaPor;
    const assistants = meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario);
    const desired = normalizeCohostEmails([
      ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...meeting.cohostEmails.map(({ email }) => email),
      ...requester.cuentasGoogle.map(({ email }) => email),
      ...(requester.cuentasGoogle.length === 0 && requester.emailPrincipal ? [requester.emailPrincipal] : []),
      ...assistants.flatMap((assistant) => assistant.cuentasGoogle.map(({ email }) => email)),
      ...assistants.flatMap((assistant) =>
        assistant.cuentasGoogle.length === 0 && assistant.emailPrincipal ? [assistant.emailPrincipal] : []
      ),
    ]).filter((email) => email !== organizer);

    return desired.length > 0
      ? [{
          id: meeting.id,
          title: meeting.solicitud.titulo,
          start: meeting.inicioProgramadoAt,
          organizer,
          code,
          desired,
        }]
      : [];
  });

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    credentialSource: "temporary-env",
    serviceAccountEmail,
    meetingFilter: meetingFilter ?? null,
    meetingsReviewed: meetings.length,
    meetingsToSync: plan.length,
    cohostAssignmentsRequested: plan.reduce((total, item) => total + item.desired.length, 0),
    sample: plan.slice(0, meetingFilter ? 1 : 10).map((item) => ({
      instanciaSalaId: item.id,
      titulo: item.title,
      inicio: item.start.toISOString(),
      organizador: item.organizer,
      codigoReunion: item.code,
      cohosts: item.desired,
    })),
  }, null, 2));

  if (!applyChanges) return;

  const failures: Array<{ instanciaSalaId: string; titulo: string; error: string }> = [];
  const verificationFailures: Array<{ instanciaSalaId: string; missing: string[] }> = [];
  let synced = 0;

  for (const item of plan) {
    const credentials = {
      serviceAccountEmail,
      privateKey,
      subject: item.organizer,
    };

    try {
      await configurarGoogleMeetExistente(credentials, item.code, { cohostEmails: item.desired });

      const auth = new JWT({
        email: serviceAccountEmail,
        key: privateKey,
        scopes: [...MEET_SCOPES],
        subject: item.organizer,
      });
      const space = await auth.request<{ name?: string }>({
        url: `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(item.code)}`,
        method: "GET",
        timeout: 30_000,
      });
      if (!space.data.name) throw new Error("Google Meet no devolvió el recurso canónico del espacio.");
      const members = await auth.request<{ members?: Array<{ email?: string; role?: string }> }>({
        url: `${MEET_API}/${space.data.name}/members?pageSize=100`,
        method: "GET",
        timeout: 30_000,
      });
      const existingCohosts = new Set(
        (members.data.members ?? [])
          .filter(({ role }) => role === "COHOST")
          .flatMap(({ email }) => email ? [email.trim().toLowerCase()] : [])
      );
      const missing = item.desired.filter((email) => !existingCohosts.has(email));
      if (missing.length > 0) {
        verificationFailures.push({ instanciaSalaId: item.id, missing });
      } else {
        synced += 1;
      }
    } catch (error) {
      failures.push({
        instanciaSalaId: item.id,
        titulo: item.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    synced,
    failed: failures.length,
    verificationFailed: verificationFailures.length,
    failures: failures.slice(0, 50),
    verificationFailures: verificationFailures.slice(0, 50),
  }, null, 2));

  if (failures.length > 0 || verificationFailures.length > 0) {
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

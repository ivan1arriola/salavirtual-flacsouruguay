import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { configurarGoogleMeetExistente } from "@/src/modules/meet/google-calendar.adapter";
import { normalizeCohostEmails } from "@/src/modules/meet/cohosts.domain";
import { cargarCredencialesEncuentro } from "@/src/modules/reuniones/encuentros-persistence.adapter";

export const runtime = "nodejs";

type PendingExternal = Readonly<{
  instanciaSalaId: string;
  titulo: string;
  inicio: string;
  emails: readonly string[];
}>;

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor || actor.rol !== "ADMINISTRACION" || !actor.activo) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const meetings = await db.instanciaSala.findMany({
    where: {
      estado: { in: ["PROGRAMADA", "EN_CURSO"] },
      finProgramadoAt: { gt: new Date() },
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
              cuentasGoogle: { select: { id: true, email: true } },
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
                  cuentasGoogle: { select: { id: true, email: true } },
                },
              },
            },
          },
        },
      },
      cohosts: {
        select: {
          cuentaGoogleId: true,
          cuentaGoogle: { select: { email: true } },
        },
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

  const candidates: typeof meetings = [];
  let cohostsAgregados = 0;

  for (const meeting of meetings) {
    if (!meeting.eventosProveedor[0]?.codigoReunion) continue;

    const requester = meeting.solicitud.creadaPor;
    const assistants = meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario);
    const expectedAccountIds = new Set([
      ...requester.cuentasGoogle.map(({ id }) => id),
      ...assistants.flatMap((assistant) => assistant.cuentasGoogle.map(({ id }) => id)),
    ]);
    const expectedEmails = normalizeCohostEmails([
      ...(requester.cuentasGoogle.length === 0 && requester.emailPrincipal ? [requester.emailPrincipal] : []),
      ...assistants.flatMap((assistant) =>
        assistant.cuentasGoogle.length === 0 && assistant.emailPrincipal ? [assistant.emailPrincipal] : []
      ),
    ]);
    const currentAccountIds = new Set(meeting.cohosts.map(({ cuentaGoogleId }) => cuentaGoogleId));
    const currentEmails = new Set(meeting.cohostEmails.map(({ email }) => email.toLowerCase()));
    const missingAccountIds = [...expectedAccountIds].filter((id) => !currentAccountIds.has(id));
    const missingEmails = expectedEmails.filter((email) => !currentEmails.has(email));

    if (missingAccountIds.length > 0) {
      const result = await db.cohostReunion.createMany({
        data: missingAccountIds.map((cuentaGoogleId) => ({
          instanciaSalaId: meeting.id,
          cuentaGoogleId,
        })),
        skipDuplicates: true,
      });
      cohostsAgregados += result.count;
    }
    if (missingEmails.length > 0) {
      const result = await db.cohostEmailReunion.createMany({
        data: missingEmails.map((email) => ({ instanciaSalaId: meeting.id, email })),
        skipDuplicates: true,
      });
      cohostsAgregados += result.count;
    }

    if (
      meeting.cohosts.length + meeting.cohostEmails.length > 0 ||
      missingAccountIds.length > 0 ||
      missingEmails.length > 0
    ) {
      candidates.push(meeting);
    }
  }

  const failures: Array<Readonly<{
    instanciaSalaId: string;
    titulo: string;
    inicio: string;
    error: string;
  }>> = [];
  const pendingExternal: PendingExternal[] = [];
  let synced = 0;

  for (const meeting of candidates) {
    const event = meeting.eventosProveedor[0];
    if (!event?.codigoReunion || !event.cuentaProveedor?.emailOrganizador) continue;

    const requester = meeting.solicitud.creadaPor;
    const assistants = meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario);
    const allDesiredEmails = normalizeCohostEmails([
      ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...meeting.cohostEmails.map(({ email }) => email),
      ...requester.cuentasGoogle.map(({ email }) => email),
      ...(requester.cuentasGoogle.length === 0 && requester.emailPrincipal ? [requester.emailPrincipal] : []),
      ...assistants.flatMap((assistant) => assistant.cuentasGoogle.map(({ email }) => email)),
      ...assistants.flatMap((assistant) =>
        assistant.cuentasGoogle.length === 0 && assistant.emailPrincipal ? [assistant.emailPrincipal] : []
      ),
    ]);

    const organizerDomain = event.cuentaProveedor.emailOrganizador.split("@")[1]?.toLowerCase() ?? "";
    const internalEmails = organizerDomain
      ? allDesiredEmails.filter((email) => email.endsWith(`@${organizerDomain}`))
      : allDesiredEmails;
    const externalEmails = organizerDomain
      ? allDesiredEmails.filter((email) => !email.endsWith(`@${organizerDomain}`))
      : [];

    if (externalEmails.length > 0) {
      pendingExternal.push({
        instanciaSalaId: meeting.id,
        titulo: meeting.solicitud.titulo,
        inicio: meeting.inicioProgramadoAt.toISOString(),
        emails: externalEmails,
      });
    }

    if (internalEmails.length === 0) continue;

    try {
      const credentials = await cargarCredencialesEncuentro(
        db,
        descifrarConfiguracion,
        event.cuentaProveedor.emailOrganizador,
      );
      await configurarGoogleMeetExistente(credentials, event.codigoReunion, {
        cohostEmails: internalEmails,
      });
      synced += 1;
    } catch (error) {
      failures.push({
        instanciaSalaId: meeting.id,
        titulo: meeting.solicitud.titulo,
        inicio: meeting.inicioProgramadoAt.toISOString(),
        error: error instanceof Error ? error.message : "Error desconocido al sincronizar con Google Meet.",
      });
    }
  }

  const skipped = meetings.length - candidates.length;
  const externalEmailCount = pendingExternal.reduce((total, item) => total + item.emails.length, 0);

  await db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "COHOSTS_REUNIONES_RESINCRONIZADOS",
      entidadTipo: "ConfiguracionGoogleWorkspace",
      entidadId: "principal",
      valorNuevo: {
        reunionesActivas: meetings.length,
        candidatas: candidates.length,
        cohostsAgregados,
        sincronizadas: synced,
        omitidas: skipped,
        fallidas: failures.length,
        cohostsExternosPendientes: externalEmailCount,
        reunionesConExternos: pendingExternal.length,
      },
    },
  });

  let message: string;
  if (candidates.length === 0) {
    message = "No hay reuniones activas o futuras con un Meet provisionado para sincronizar.";
  } else if (failures.length > 0) {
    message = `Se sincronizaron ${synced} reuniones; ${failures.length} todavía tienen un error de Google Meet.`;
  } else if (externalEmailCount > 0) {
    message = `Se sincronizaron ${synced} reuniones. ${externalEmailCount} cohosts externos requieren asignación manual mientras la API siga en Developer Preview.`;
  } else {
    message = `Se completaron los cohosts y se sincronizaron ${synced} ${synced === 1 ? "reunión" : "reuniones"}.`;
  }

  return NextResponse.json({
    reunionesActivas: meetings.length,
    candidatas: candidates.length,
    cohostsAgregados,
    sincronizadas: synced,
    omitidas: skipped,
    fallidas: failures.length,
    cohostsExternosPendientes: externalEmailCount,
    reunionesConExternos: pendingExternal.length,
    errores: failures.slice(0, 20),
    externos: pendingExternal.slice(0, 20),
    message,
  });
}

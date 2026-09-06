import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { sincronizarCohostsDeInstancia } from "@/src/modules/asistencia/asistencia.service";
import { configurarGoogleMeetExistente } from "@/src/modules/meet/google-calendar.adapter";
import { normalizeCohostEmails } from "@/src/modules/meet/cohosts.domain";

export const runtime = "nodejs";

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
              cuentasGoogle: { select: { id: true } },
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
                  cuentasGoogle: { select: { id: true } },
                },
              },
            },
          },
        },
      },
      cohosts: { select: { cuentaGoogleId: true } },
      cohostEmails: { select: { email: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: { codigoReunion: true },
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
  let synced = 0;

  for (const meeting of candidates) {
    try {
      await sincronizarCohostsDeInstancia({
        db,
        descifrar: descifrarConfiguracion,
        configurarEspacio: configurarGoogleMeetExistente,
      }, meeting.id);
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
      },
    },
  });

  return NextResponse.json({
    reunionesActivas: meetings.length,
    candidatas: candidates.length,
    cohostsAgregados,
    sincronizadas: synced,
    omitidas: skipped,
    fallidas: failures.length,
    errores: failures.slice(0, 20),
    message: candidates.length === 0
      ? "No hay reuniones activas o futuras con un Meet provisionado para sincronizar."
      : failures.length === 0
        ? `Se completaron los cohosts y se sincronizaron ${synced} ${synced === 1 ? "reunión" : "reuniones"}.`
        : `Se agregaron ${cohostsAgregados} cohosts en Sala Virtual; ${synced} reuniones se sincronizaron con Google y ${failures.length} quedaron pendientes.`,
  });
}

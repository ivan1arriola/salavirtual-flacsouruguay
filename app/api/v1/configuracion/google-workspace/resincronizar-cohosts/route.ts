import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { sincronizarCohostsDeInstancia } from "@/src/modules/asistencia/asistencia.service";
import { configurarGoogleMeetExistente } from "@/src/modules/meet/google-calendar.adapter";

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
      solicitud: { select: { titulo: true } },
      cohosts: { select: { id: true } },
      cohostEmails: { select: { id: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: { codigoReunion: true },
        take: 1,
      },
    },
  });

  const candidates = meetings.filter((meeting) =>
    Boolean(meeting.eventosProveedor[0]?.codigoReunion) &&
    meeting.cohosts.length + meeting.cohostEmails.length > 0
  );
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
        sincronizadas: synced,
        omitidas: skipped,
        fallidas: failures.length,
      },
    },
  });

  return NextResponse.json({
    reunionesActivas: meetings.length,
    candidatas: candidates.length,
    sincronizadas: synced,
    omitidas: skipped,
    fallidas: failures.length,
    errores: failures.slice(0, 20),
    message: candidates.length === 0
      ? "No hay reuniones activas o futuras con cohosts y un Meet provisionado para sincronizar."
      : failures.length === 0
        ? `Cohosts reaplicados correctamente en ${synced} ${synced === 1 ? "reunión" : "reuniones"}.`
        : `Se actualizaron ${synced} reuniones y ${failures.length} quedaron con error.`,
  });
}

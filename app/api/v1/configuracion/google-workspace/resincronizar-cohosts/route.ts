import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { normalizeCohostEmails } from "@/src/modules/meet/cohosts.domain";
import { provisionarEventosMeet } from "@/src/modules/meet/provisionar-eventos.service";

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
    where: { estado: { in: ["PROGRAMADA", "EN_CURSO"] }, finProgramadoAt: { gt: new Date() } },
    orderBy: { inicioProgramadoAt: "asc" },
    select: {
      id: true, inicioProgramadoAt: true,
      solicitud: { select: {
        titulo: true,
        docentePrograma: { select: { docente: { select: { usuario: { select: {
          emailPrincipal: true, cuentasGoogle: { select: { id: true, email: true } },
        } } } } } },
      } },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: { asistenteTecnico: { select: { usuario: { select: {
          emailPrincipal: true, cuentasGoogle: { select: { id: true, email: true } },
        } } } } },
      },
      cohosts: { select: { cuentaGoogleId: true, cuentaGoogle: { select: { email: true } } } },
      cohostEmails: { select: { email: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: { id: true, externalEventId: true, codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } } },
        take: 1,
      },
    },
  });

  let cohostsAgregados = 0;
  let synced = 0;
  let candidates = 0;
  let skipped = 0;
  const failures: Array<{ instanciaSalaId: string; titulo: string; inicio: string; error: string }> = [];

  for (const meeting of meetings) {
    const event = meeting.eventosProveedor[0];
    const organizer = event?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
    if (!event?.externalEventId || !organizer) { skipped += 1; continue; }
    const users = [
      meeting.solicitud.docentePrograma.docente.usuario,
      ...meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario),
    ];
    const accountIds = [...new Set(users.flatMap((user) => user.cuentasGoogle
      .filter(({ email }) => email.trim().toLowerCase() !== organizer).map(({ id }) => id)))];
    const fallback = normalizeCohostEmails(users.flatMap((user) =>
      user.cuentasGoogle.length === 0 && user.emailPrincipal ? [user.emailPrincipal] : []
    )).filter((email) => email !== organizer);

    try {
      const result = await db.$transaction(async (tx) => {
        // Use the same persisted operation and claim as normal provisioning. Do not
        // overwrite cancellation/reprogramming or a synchronization in progress.
        const queued = await tx.eventoProveedor.updateMany({
          where: { id: event.id, reclamoIntegracionAt: null,
            OR: [{ operacionPendiente: null }, { operacionPendiente: "CONFIGURAR_MEET" }] },
          data: { operacionPendiente: "CONFIGURAR_MEET", estadoIntegracion: "PENDIENTE", errorIntegracion: null },
        });
        if (queued.count !== 1) return null;
        const linked = accountIds.length ? await tx.cohostReunion.createMany({
          data: accountIds.map((cuentaGoogleId) => ({ instanciaSalaId: meeting.id, cuentaGoogleId })),
          skipDuplicates: true,
        }) : { count: 0 };
        const manual = fallback.length ? await tx.cohostEmailReunion.createMany({
          data: fallback.map((email) => ({ instanciaSalaId: meeting.id, email })), skipDuplicates: true,
        }) : { count: 0 };
        return linked.count + manual.count;
      });
      if (result === null) { skipped += 1; continue; }
      candidates += 1;
      cohostsAgregados += result;
      // No domain filter: Gmail and other Google accounts must also be assigned.
      const [outcome] = await provisionarEventosMeet({
        db, descifrar: descifrarConfiguracion, crearProvider: crearGoogleCalendarProvider,
      }, [event.id]);
      if (outcome?.estado !== "SINCRONIZADA") {
        throw new Error(outcome?.error ?? "La configuración de los cohosts sigue pendiente de confirmación en Google.");
      }
      synced += 1;
    } catch (error) {
      failures.push({ instanciaSalaId: meeting.id, titulo: meeting.solicitud.titulo,
        inicio: meeting.inicioProgramadoAt.toISOString(),
        error: error instanceof Error ? error.message : "No se pudo verificar el rol en Google Meet.",
      });
    }
  }

  await db.auditoria.create({ data: {
    actorUsuarioId: actor.id, accion: "COHOSTS_REUNIONES_RESINCRONIZADOS",
    entidadTipo: "ConfiguracionGoogleWorkspace", entidadId: "principal",
    valorNuevo: { reunionesActivas: meetings.length, candidatas: candidates, cohostsAgregados,
      sincronizadas: synced, omitidas: skipped, fallidas: failures.length },
  } });
  return NextResponse.json({
    reunionesActivas: meetings.length, candidatas: candidates, cohostsAgregados,
    sincronizadas: synced, omitidas: skipped, fallidas: failures.length,
    // Retained for clients using the previous response shape. External accounts
    // now go through the same verified assignment as institutional accounts.
    cohostsExternosPendientes: 0, reunionesConExternos: 0, externos: [], errores: failures.slice(0, 20),
    message: `Cohosts verificados en ${synced} reuniones; ${failures.length} con error y ${skipped} omitidas o con otra operación pendiente.`,
  });
}
